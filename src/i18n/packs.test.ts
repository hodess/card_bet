import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// import direct des dictionnaires, sans passer par le singleton : ce test tourne
// en environnement node, sans localStorage ni document.
import { fr } from './fr'
import { en } from './en'

const SLUGS = readdirSync(join(process.cwd(), 'data/packs'))
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace(/\.json$/, ''))
  .sort()

describe('libellés des packs', () => {
  it('trouve les fichiers de packs', () => {
    expect(SLUGS).toEqual(['football', 'naruto'])
  })

  // Livrer un pack sans ses libellés fait rougir la CI : les noms de packs sont du
  // contenu de l'application, pas des données utilisateur — ils se traduisent.
  it.each(SLUGS)('%s a son nom et sa description en fr et en', slug => {
    for (const dict of [fr, en]) {
      expect(dict[`packs.${slug}.name`]).toBeTruthy()
      expect(dict[`packs.${slug}.description`]).toBeTruthy()
    }
  })
})
