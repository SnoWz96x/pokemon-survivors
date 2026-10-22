import type { Connection } from '../coop/client'
import { t } from '../i18n'
import { h, setText } from './dom'

/**
 * The co-op run's connection bits (`ui/teamLayer.ts` owns it): the pip (ping
 * and quality), the veil while reconnecting (only after a second of
 * silence), joining ("Entrando na partida…", waiting on a snapshot) or far
 * behind, with the syncing bar.
 */
export const createCoopHud = (root: HTMLElement) => {
  const ms = h('span')
  const pip = h('div', { class: 'coop-pip good', 'aria-live': 'off' }, h('i'), ms)
  const veilText = h('b')
  const veilHint = h('small')
  const bar = h('div', { class: 'coop-bar-fill' })
  const progress = h('div', { class: 'coop-bar hidden' }, bar)
  const veil = h('div', { class: 'coop-veil hidden' }, h('div', { class: 'coop-veil-box box' }, veilText, progress, veilHint))
  const el = h('div', { class: 'coop-hud' }, pip, veil)
  root.append(el)
  let quality = ''
  return {
    update: (c: Connection, joining: boolean) => {
      const q = c.quality
      if (q !== quality) {
        pip.className = `coop-pip ${q}`
        quality = q
      }
      setText(ms, c.rtt > 0 ? t().coop.ping(c.rtt) : '…')
      const m = t().coop
      const show = joining || c.stalled || c.syncing !== null
      veil.classList.toggle('hidden', !show)
      if (show) {
        setText(veilText, c.stalled ? m.reconnecting : joining ? m.joining : m.syncing)
        setText(veilHint, c.stalled ? m.reconnectingHint : '')
        progress.classList.toggle('hidden', c.stalled || c.syncing === null)
        bar.style.width = `${Math.round((c.syncing ?? 0) * 100)}%`
      }
    },
    dispose: () => el.remove(),
  }
}

export type CoopHud = ReturnType<typeof createCoopHud>
