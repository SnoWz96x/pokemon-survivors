import { fromStrings, lazy } from '../engine/pixelart'
import type { Team } from '../data/versus'

/**
 * The Vale's ground decor (`render/vale.ts` bakes them into its floor tiles):
 * tall grass, flowers, mushrooms, logs, and each base's banners and lamps.
 * Code-authored pixel strings; draw-only, nothing here stands in anyone's way.
 */

const LEAF = { a: '#2a5c2a', b: '#3e7e36', c: '#5a964a', d: '#1e4820' } as const

/** A clump of tall grass, for the jungle. */
export const TALL_GRASS = lazy(() =>
  fromStrings(
    [
      '..c....c..c.',
      '.cb...cb..b.',
      '.bb.c.bb.cb.',
      'cbb.bcbba.bb',
      'bba.bbbaa.ba',
      'bbaabbaaabba',
      'baaaabaaaaaa',
      '.dddddddddd.',
    ],
    LEAF,
  ),
)

/** A second, smaller clump, so the patches don't repeat. */
export const TALL_GRASS_SMALL = lazy(() => fromStrings(['..c..c.', '.cb.cb.', 'cbb.bba', 'bbabbaa', 'baaaaaa', '.ddddd.'], LEAF))

/** Flower clusters for the lanes' verges, in three colorways. */
export const FLOWER_PATCHES = lazy(() =>
  (['#f8f0f0', '#f88aa8', '#98b8f8'] as const).map((petal) =>
    fromStrings(['.p.....', 'pyp..p.', '.p..pyp', '.g.p.p.', '.gpyp..', '..gpg..', '...g...'], { p: petal, y: '#f8d848', g: '#3e7e36' }),
  ),
)

/** A red-capped mushroom pair. */
export const MUSHROOMS = lazy(() =>
  fromStrings(['.rrr....', 'rwrrr...', 'rrrwr.rr', '.sss.rwr', '..s...s.', '.dd..dd.'], { r: '#d84838', w: '#f8f0e8', s: '#e8dcc0', d: '#2a4a24' }),
)

/** A fallen log, mossy on top. */
export const LOG = lazy(() =>
  fromStrings(
    ['..gggggggggggg..', '.bmmmmmmmmmmmmro', 'bbccbccbbcbbccrro', 'bcbbcbbccbbcbbrwo', 'bbccbbcbbccbbcrro', '.bbbbbbbbbbbbbro.', '..ssssssssssss...'],
    { g: '#5a964a', m: '#46843e', b: '#7a5232', c: '#5e3e26', r: '#a87e4e', w: '#d0ae7e', o: '#3e2818', s: 'rgba(12,28,16,0.45)' },
  ),
)

/** Each team's banner, hung on the hedge at the back of its base: the team color with the ball emblem in white. */
const banner = (team: Team, cloth: string) =>
    fromStrings(
      [
        'oyyyyyyyyyo',
        '.okkkkkkko.',
        '.okcccccko.',
        '.okcwwwcko.',
        '.okwwdwwko.',
        '.okdd.ddko.',
        '.okwwdwwko.',
        '.okcwwwcko.',
        '.okcccccko.',
        '.okcllccko.',
        '.okcccccko.',
        '.okcccccko.',
        '.okcc.ccko.',
        '.okc...cko.',
        '.ok.....ko.',
        '.o.......o.',
      ],
      { o: '#181820', y: '#e0b850', k: team === 0 ? '#2c5aa8' : '#a83838', c: cloth, w: '#f8f8f8', d: '#282830', l: team === 0 ? '#a8d0ff' : '#ffb0a8' },
    )
const BANNERS = lazy(() => [banner(0, '#4890f0'), banner(1, '#f05858')] as const)

/** A lamp post on the plaza, its lantern lit in the team's light. */
const lamp = (light: string) =>
  fromStrings(
    ['..ooo..', '.oyyyo.', 'oylwlyo', 'oylllyo', '.oyyyo.', '..ooo..', '...o...', '...o...', '...o...', '...o...', '...o...', '...o...', '..ooo..', '.ooooo.', '.sssss.'],
    { o: '#26262e', y: '#e0b850', l: light, w: '#ffffff', s: 'rgba(12,28,16,0.4)' },
  )
const LAMPS = lazy(() => [lamp('#a8d0ff'), lamp('#ffb0a8')] as const)

export const bannerOf = (team: Team) => BANNERS()[team]
export const lampOf = (team: Team) => LAMPS()[team]
