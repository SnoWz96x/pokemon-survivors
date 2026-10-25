import { describe, expect, it } from 'vitest'
import { cleanPath, localeOfPath, suggest } from './notFound'
import { notFoundIndex } from './pages/notFound'

const index = notFoundIndex()

describe('404 suggestion', () => {
  it('fixes a typo in a Pokémon page', () => {
    expect(suggest('/pokedex/charmandr/', index, 'pt')).toEqual({ path: '/pokedex/charmander/', name: 'Charmander', dex: 4 })
  })

  it('finds the same page under another language’s name, in the page’s language', () => {
    expect(suggest('/en/guia/', index, 'en')?.path).toBe('/en/guide/')
    expect(suggest('/es/changelog', index, 'es')?.path).toBe('/es/novedades/')
  })

  it('ignores case, accents, a missing slash and index.html', () => {
    expect(suggest('/EN/Pok%C3%A9dex/Charmander', index, 'en')?.path).toBe('/en/pokedex/charmander/')
    expect(suggest('/guia/index.html', index, 'pt')?.path).toBe('/guia/')
  })

  it('takes any stage of a family to its page', () => {
    expect(suggest('/en/pokedex/charmeleon/', index, 'en')?.path).toBe('/en/pokedex/charmander/')
    expect(suggest('/pikachu', index, 'fr')?.path).toBe('/fr/pokedex/pichu/')
  })

  it('falls back to the deepest page the path goes below', () => {
    expect(suggest('/en/pokedex/charmander/moves/', index, 'en')?.path).toBe('/en/pokedex/charmander/')
  })

  it('suggests nothing when nothing is close', () => {
    expect(suggest('/qwertyuiop/', index, 'pt')).toBeNull()
    expect(suggest('/wp-admin/setup.php', index, 'en')).toBeNull()
  })
})

describe('404 paths', () => {
  it('reads the language from the prefix, none at the root', () => {
    expect(localeOfPath('/zh-tw/guide/x', index.prefixes)).toBe('zh')
    expect(localeOfPath('/fr', index.prefixes)).toBe('fr')
    expect(localeOfPath('/pokedex/x', index.prefixes)).toBeNull()
  })

  it('cleans a path for comparison', () => {
    expect(cleanPath('//Pokédex//Mr Mime')).toBe('/pokedex/mr-mime/')
  })
})
