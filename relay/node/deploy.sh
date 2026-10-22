#!/bin/bash
# Runs on the relay's instance as root (Systems Manager, on every `sst deploy` and when the
# instance first comes up). Idempotent: installs what is missing (Node, the service, the
# health check, log shipping), puts bundle {{ Version }} in place and restarts the relay.
# sst.config.ts fills in the @...@ placeholders; Systems Manager fills in the Version.
set -euo pipefail

VERSION='{{ Version }}'
APP=/opt/ps-relay
DATA=/var/lib/ps-relay
LOGS=/var/log/ps-relay

# Node, pinned and checked.
if [ "$(/opt/node/bin/node --version 2>/dev/null || true)" != "v@NODE_VERSION@" ]; then
  curl -fsSL "https://nodejs.org/dist/v@NODE_VERSION@/node-v@NODE_VERSION@-linux-arm64.tar.xz" -o /tmp/node.tar.xz
  echo "@NODE_SHA256@  /tmp/node.tar.xz" | sha256sum -c -
  rm -rf /opt/node.new && mkdir -p /opt/node.new
  tar -xJf /tmp/node.tar.xz -C /opt/node.new --strip-components=1
  rm -rf /opt/node && mv /opt/node.new /opt/node && rm -f /tmp/node.tar.xz
fi

id ps-relay >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /sbin/nologin ps-relay
install -d -o ps-relay -g ps-relay -m 750 "$DATA" "$LOGS"
install -d -m 755 "$APP"
rpm -q amazon-cloudwatch-agent >/dev/null 2>&1 || dnf install -y -q amazon-cloudwatch-agent
rpm -q logrotate >/dev/null 2>&1 || dnf install -y -q logrotate

# The bundle, by its hash. The last 5 stay for a quick rollback (`ln -sfn` an older one, restart).
aws s3 cp --quiet "s3://@BUCKET@/bundles/relay-$VERSION.mjs" "$APP/relay-$VERSION.mjs"
ls -t "$APP"/relay-*.mjs | tail -n +6 | xargs -r rm -f

# The environment (the admin token from Parameter Store, never in the deploy's own history).
TOKEN=$(aws ssm get-parameter --with-decryption --name '@TOKEN_PARAM@' --query Parameter.Value --output text)
umask 077
cat > /etc/ps-relay.env <<EOF
PORT=@PORT@
HOST=0.0.0.0
DATA_DIR=$DATA
CLERK_ISSUER=https://clerk.pokemonsurvivors.com
ALLOWED_ORIGINS=@ALLOWED_ORIGINS@
ALLOW_GUESTS=@ALLOW_GUESTS@
TRUST_PROXY=cloudfront
ADMIN_TOKEN=$TOKEN
RELAY_VERSION=$VERSION
EOF
umask 022

# The service: restarted a second after any exit; SIGTERM is its graceful stop (players reconnect and resume).
cat > /etc/systemd/system/ps-relay.service <<'EOF'
[Unit]
Description=Pokémon Survivors co-op relay (São Paulo)
After=network-online.target
Wants=network-online.target

[Service]
User=ps-relay
EnvironmentFile=/etc/ps-relay.env
ExecStart=/opt/node/bin/node --enable-source-maps --disable-warning=ExperimentalWarning /opt/ps-relay/relay.mjs
Restart=always
RestartSec=1
KillSignal=SIGTERM
TimeoutStopSec=10
LimitNOFILE=65536
StandardOutput=append:/var/log/ps-relay/relay.log
StandardError=append:/var/log/ps-relay/relay.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/ps-relay /var/log/ps-relay

[Install]
WantedBy=multi-user.target
EOF

# A watchdog for a hung process (a crash is systemd's): /health must answer within 3 s, every 30 s.
cat > "$APP/health.sh" <<'EOF'
#!/bin/sh
curl -fsS --max-time 3 http://127.0.0.1:@PORT@/health >/dev/null && exit 0
echo '{"ev":"relay.unhealthy"}' >> /var/log/ps-relay/relay.log
systemctl restart ps-relay
EOF
chmod 755 "$APP/health.sh"
cat > /etc/systemd/system/ps-relay-health.service <<'EOF'
[Unit]
Description=Restart the relay when /health doesn't answer

[Service]
Type=oneshot
ExecStart=/opt/ps-relay/health.sh
EOF
cat > /etc/systemd/system/ps-relay-health.timer <<'EOF'
[Unit]
Description=Check the relay's health every 30 s

[Timer]
OnBootSec=60
OnUnitActiveSec=30

[Install]
WantedBy=timers.target
EOF

cat > /etc/logrotate.d/ps-relay <<'EOF'
/var/log/ps-relay/relay.log {
  daily
  rotate 3
  compress
  missingok
  notifempty
  copytruncate
}
EOF

# CloudWatch Logs: the relay's JSON lines, one stream per instance.
cat > /opt/aws/amazon-cloudwatch-agent/etc/ps-relay.json <<'EOF'
{
  "agent": { "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [{ "file_path": "/var/log/ps-relay/relay.log", "log_group_name": "@LOG_GROUP@", "log_stream_name": "{instance_id}" }]
      }
    }
  }
}
EOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/ps-relay.json >/dev/null

# Swap and restart: the old process closes every socket as a restart, the new one loads the rooms from disk.
ln -sfn "$APP/relay-$VERSION.mjs" "$APP/relay.mjs"
systemctl daemon-reload
systemctl enable -q ps-relay ps-relay-health.timer
systemctl restart ps-relay
systemctl start ps-relay-health.timer

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:@PORT@/health" 2>/dev/null | grep -q "\"version\":\"$VERSION\""; then
    echo "relay $VERSION is up"
    exit 0
  fi
  sleep 1
done
echo "relay $VERSION did not come up" >&2
tail -n 50 "$LOGS/relay.log" >&2
exit 1
