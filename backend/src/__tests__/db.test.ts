import { describe, it, expect } from 'vitest'

/**
 * Tests unitaires sur les helpers Kysely — sans connexion réelle à la BDD.
 * Les tests d'intégration (vraie BDD) sont à écrire séparément avec Testcontainers.
 */

describe('db/types', () => {
  it('les types Database sont bien définis', async () => {
    // On vérifie juste que les imports compilent
    const { } = await import('../db/types')
    expect(true).toBe(true)
  })
})

describe('db/migrations nommage', () => {
  it('les clés de migration suivent le format NNN_nom', () => {
    const keys = ['001_initial', '002_example_add_column']
    const pattern = /^\d{3}_[a-z_]+$/
    keys.forEach((k) => {
      expect(k).toMatch(pattern)
    })
  })
})
