import { describe, expect, it } from 'vitest'
import { idsByName } from './discord'

describe('idsByName', () => {
  it('finds channels by name whatever emoji and separator staff put in front', () => {
    const ids = idsByName([
      { id: '1', name: '🪪》introductions' },
      { id: '2', name: '⚙️》mod-chat' },
      { id: '3', name: 'idea-review' },
      { id: '4', name: 'Trainer' },
    ])
    expect([...ids]).toEqual([['introductions', '1'], ['mod-chat', '2'], ['idea-review', '3'], ['Trainer', '4']])
  })
})
