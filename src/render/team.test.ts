import { describe, expect, it } from 'vitest'
import { edgeSpot, tagText, type EdgeSpot } from './team'

describe('tagText', () => {
  it('writes names in the in-world font: capitals, no accents, 8 letters', () => {
    expect(tagText('João', 1)).toBe('JOAO')
    expect(tagText('  maria-luísa silva ', 0)).toBe('MARIA-LU')
  })

  it('falls back to the seat when nothing writable is left', () => {
    expect(tagText('🐉🔥', 2)).toBe('P3')
  })
})

describe('edgeSpot', () => {
  const insets = { top: 30, bottom: 24, side: 14 }
  const out: EdgeSpot = { x: 0, y: 0, angle: 0 }

  it('leaves on-screen points alone', () => {
    expect(edgeSpot(200, 100, insets, 100, 50, out)).toBe(false)
  })

  it('pins an off-screen point to the edge it lies past, clear of the HUD', () => {
    expect(edgeSpot(200, 100, insets, 900, 50, out)).toBe(true)
    expect(out).toEqual({ x: 178, y: 50, angle: 0 })
    edgeSpot(200, 100, insets, 100, -500, out)
    // The top keeps `insets.top` (capped at a quarter of the screen) plus a margin.
    expect(out.x).toBe(100)
    expect(out.y).toBe(33)
  })
})
