/// <reference path="./.sst/platform/config.d.ts" />

/**
 * The co-op relay in São Paulo (AWS sa-east-1), for rooms whose host is in
 * South America: Cloudflare has no Durable Objects there, so those rooms run
 * 116–140 ms away in the US; this one answers in single-digit ms.
 *
 * One small ARM instance runs the Node shell (relay/node) under systemd, its
 * rooms in SQLite on the instance's disk; CloudFront in front gives it TLS and
 * a `wss://<id>.cloudfront.net` address without a domain (the São Paulo edge
 * is next door to the region), and only CloudFront can reach the instance.
 * A deploy uploads the new bundle and has Systems Manager run `deploy.sh` on
 * the instance: it installs what's missing, swaps the bundle and restarts the
 * service (players are told to reconnect and resume: about a second).
 *
 *   AWS_PROFILE=<profile> npx sst deploy --stage production
 *
 * See README.md ("São Paulo relay") for the one-time steps.
 */

/** The instance: 2 burstable Graviton vCPUs, 1 GB. ~US$ 9.80 a month in São Paulo. */
const INSTANCE_TYPE = 't4g.micro'

/** Node for the instance (linux-arm64), checked against nodejs.org's SHASUMS256.txt. */
const NODE = { version: '24.22.1', sha256: 'dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e' } as const

/** The relay's port on the instance (CloudFront's origin; the security group lets only CloudFront in). */
const PORT = 8080

/** CloudFront's managed policies: no caching; every viewer header (the WebSocket handshake's) plus `CloudFront-Viewer-Address`. */
const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
const ALL_VIEWER_AND_CLOUDFRONT_HEADERS = '33f36d7e-f396-46d9-90e0-52428a34d9dc'

/** Where the game may connect from: production serves only the live site; other stages also take Vercel previews (and localhost, always). */
const ORIGINS = {
  production: 'https://www.pokemonsurvivors.com,https://pokemonsurvivors.com',
  other: 'https://www.pokemonsurvivors.com,https://pokemonsurvivors.com,https://*.vercel.app',
} as const

export default $config({
  app(input) {
    return {
      name: 'ps-relay-sa',
      home: 'aws',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: input?.stage === 'production',
      providers: { aws: { region: 'sa-east-1' } },
    }
  },
  async run() {
    const { execFileSync } = await import('node:child_process')
    const { readFileSync } = await import('node:fs')
    const production = $app.stage === 'production'
    const stage = $app.stage

    // The bundle (dist/relay.mjs), named by its hash: a deploy happens when the code changed.
    const version = execFileSync('node', ['build.mjs'], { encoding: 'utf8' }).trim()
    const bundleKey = `bundles/relay-${version}.mjs`

    const adminToken = new sst.Secret('AdminToken')

    /* ---------------- Network: one public subnet, only CloudFront gets in ---------------- */

    const zone = aws.ec2
      .getInstanceTypeOfferingsOutput({ locationType: 'availability-zone', filters: [{ name: 'instance-type', values: [INSTANCE_TYPE] }] })
      .apply((o) => [...o.locations].sort()[0] ?? 'sa-east-1a')
    const vpc = new aws.ec2.Vpc('Vpc', { cidrBlock: '10.42.0.0/16', enableDnsSupport: true, enableDnsHostnames: true, tags: { Name: `ps-relay-${stage}` } })
    const gateway = new aws.ec2.InternetGateway('Gateway', { vpcId: vpc.id })
    const subnet = new aws.ec2.Subnet('Subnet', { vpcId: vpc.id, cidrBlock: '10.42.1.0/24', availabilityZone: zone, tags: { Name: `ps-relay-${stage}` } })
    const routes = new aws.ec2.RouteTable('Routes', { vpcId: vpc.id, routes: [{ cidrBlock: '0.0.0.0/0', gatewayId: gateway.id }] })
    new aws.ec2.RouteTableAssociation('SubnetRoutes', { subnetId: subnet.id, routeTableId: routes.id })
    const cloudfront = aws.ec2.getManagedPrefixListOutput({ name: 'com.amazonaws.global.cloudfront.origin-facing' })
    const firewall = new aws.ec2.SecurityGroup('Firewall', {
      vpcId: vpc.id,
      description: 'ps-relay: the relay port from CloudFront only; no SSH (Session Manager)',
      ingress: [{ protocol: 'tcp', fromPort: PORT, toPort: PORT, prefixListIds: [cloudfront.id], description: 'CloudFront' }],
      egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'], description: 'Clerk JWKS, S3, SSM, CloudWatch, nodejs.org, dnf' }],
    })

    /* ---------------- Artifacts, secrets, logs ---------------- */

    const artifacts = new sst.aws.Bucket('Artifacts')
    const bundle = new aws.s3.BucketObjectv2('Bundle', { bucket: artifacts.name, key: bundleKey, source: new $util.asset.FileAsset('dist/relay.mjs'), contentType: 'text/javascript' })
    const tokenParam = new aws.ssm.Parameter('AdminTokenParam', { name: `/ps-relay/${stage}/admin-token`, type: 'SecureString', value: adminToken.value })
    const logs = new aws.cloudwatch.LogGroup('Logs', { name: `/ps-relay/${stage}`, retentionInDays: 30 })

    /* ---------------- The instance ---------------- */

    const role = new aws.iam.Role('InstanceRole', {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: 'ec2.amazonaws.com' }),
      managedPolicyArns: ['arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore', 'arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy'],
    })
    new aws.iam.RolePolicy('InstanceAccess', {
      role: role.id,
      policy: $jsonStringify({
        Version: '2012-10-17',
        Statement: [
          { Effect: 'Allow', Action: ['s3:GetObject'], Resource: $interpolate`${artifacts.arn}/bundles/*` },
          { Effect: 'Allow', Action: ['s3:PutObject'], Resource: $interpolate`${artifacts.arn}/deploys/*` },
          { Effect: 'Allow', Action: ['ssm:GetParameter'], Resource: tokenParam.arn },
        ],
      }),
    })
    const profile = new aws.iam.InstanceProfile('InstanceProfile', { role: role.name })
    const ami = aws.ssm.getParameterOutput({ name: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64' }).value

    const instance = new aws.ec2.Instance(
      'Relay',
      {
        ami,
        instanceType: INSTANCE_TYPE,
        subnetId: subnet.id,
        vpcSecurityGroupIds: [firewall.id],
        iamInstanceProfile: profile.name,
        associatePublicIpAddress: true,
        rootBlockDevice: { volumeType: 'gp3', volumeSize: 8, encrypted: true },
        // IMDSv2 only.
        metadataOptions: { httpTokens: 'required', httpEndpoint: 'enabled' },
        creditSpecification: { cpuCredits: 'unlimited' },
        disableApiTermination: production,
        tags: { Name: `ps-relay-${stage}` },
      },
      // A newer AMI never replaces the running instance (and its rooms): deploys only swap the bundle.
      { ignoreChanges: ['ami'] },
    )
    // A fixed address: CloudFront's origin is its DNS name, which must survive a stop and start.
    const ip = new aws.ec2.Eip('Ip', { domain: 'vpc', instance: instance.id, tags: { Name: `ps-relay-${stage}` } })

    // Hardware failure: the same instance (disk, address, rooms) comes back on another host. A stuck OS: a reboot.
    const alarm = (name: string, metric: string, action: string) =>
      new aws.cloudwatch.MetricAlarm(name, {
        namespace: 'AWS/EC2',
        metricName: metric,
        dimensions: { InstanceId: instance.id },
        statistic: 'Maximum',
        period: 60,
        evaluationPeriods: 2,
        threshold: 1,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        alarmActions: [`arn:aws:automate:sa-east-1:ec2:${action}`],
      })
    alarm('Recover', 'StatusCheckFailed_System', 'recover')
    alarm('Reboot', 'StatusCheckFailed_Instance', 'reboot')

    /* ---------------- Deploys: Systems Manager runs deploy.sh on the instance ---------------- */

    const script = $resolve([artifacts.name, tokenParam.name, logs.name]).apply(([bucket, param, group]) =>
      readFileSync('deploy.sh', 'utf8')
        .replaceAll('@BUCKET@', bucket)
        .replaceAll('@TOKEN_PARAM@', param)
        .replaceAll('@LOG_GROUP@', group)
        .replaceAll('@NODE_VERSION@', NODE.version)
        .replaceAll('@NODE_SHA256@', NODE.sha256)
        .replaceAll('@PORT@', String(PORT))
        .replaceAll('@ALLOWED_ORIGINS@', production ? ORIGINS.production : ORIGINS.other)
        .replaceAll('@ALLOW_GUESTS@', production ? 'off' : 'on'),
    )
    const document = new aws.ssm.Document('Deploy', {
      documentType: 'Command',
      documentFormat: 'JSON',
      content: $jsonStringify({
        schemaVersion: '2.2',
        description: 'Installs the São Paulo relay, swaps in bundle {{ Version }} and restarts it.',
        parameters: { Version: { type: 'String', allowedPattern: '^[0-9a-f]{16}$' } },
        mainSteps: [{ action: 'aws:runShellScript', name: 'deploy', inputs: { timeoutSeconds: '600', runCommand: script.apply((s) => s.split('\n')) } }],
      }),
    })
    const deploy = new aws.ssm.Association(
      'DeployRun',
      {
        name: document.name,
        documentVersion: document.latestVersion,
        targets: [{ key: 'InstanceIds', values: [instance.id] }],
        parameters: { Version: version },
        outputLocation: { s3BucketName: artifacts.name, s3KeyPrefix: 'deploys' },
        // `sst deploy` waits for the instance to say it's up, and fails if it doesn't.
        waitForSuccessTimeoutSeconds: 600,
      },
      { dependsOn: [bundle, ip] },
    )

    /* ---------------- TLS and the address: CloudFront ---------------- */

    const cdn = new aws.cloudfront.Distribution('Cdn', {
      enabled: true,
      comment: `ps-relay ${stage} (São Paulo co-op relay)`,
      // South America's edges are only in the "All" price class (100 and 200 would send Brazil to the US).
      priceClass: 'PriceClass_All',
      isIpv6Enabled: true,
      httpVersion: 'http2',
      origins: [
        {
          originId: 'relay',
          domainName: ip.publicDns,
          customOriginConfig: { httpPort: PORT, httpsPort: 443, originProtocolPolicy: 'http-only', originSslProtocols: ['TLSv1.2'], originReadTimeout: 60, originKeepaliveTimeout: 60 },
        },
      ],
      defaultCacheBehavior: {
        targetOriginId: 'relay',
        viewerProtocolPolicy: 'https-only',
        allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        cachedMethods: ['GET', 'HEAD'],
        cachePolicyId: CACHING_DISABLED,
        originRequestPolicyId: ALL_VIEWER_AND_CLOUDFRONT_HEADERS,
        compress: false,
      },
      restrictions: { geoRestriction: { restrictionType: 'none' } },
      viewerCertificate: { cloudfrontDefaultCertificate: true },
    })

    return {
      /** VITE_COOP_URL_SA for the game's build. */
      url: $interpolate`https://${cdn.domainName}`,
      version,
      instance: instance.id,
      deploy: deploy.associationId,
      logs: logs.name,
    }
  },
})
