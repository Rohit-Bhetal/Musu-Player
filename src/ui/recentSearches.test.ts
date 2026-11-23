import { afterEach, describe, expect, it } from 'vitest'
import { clearRecentSearches, recentSearches, recordSearch } from './recentSearches'

afterEach(() => {
  clearRecentSearches()
})

describe('recordSearch', () => {
  it('adds the most recent search to the front', () => {
    recordSearch('kalank')
    recordSearch('counting stars')
    expect(recentSearches.get()).toEqual(['counting stars', 'kalank'])
  })

  it('moves a repeated search back to the front instead of listing it twice', () => {
    recordSearch('kalank')
    recordSearch('counting stars')
    recordSearch('Kalank') // same search, different case
    expect(recentSearches.get()).toEqual(['Kalank', 'counting stars'])
  })

  it('ignores a blank search', () => {
    recordSearch('   ')
    expect(recentSearches.get()).toEqual([])
  })

  it('caps the list rather than growing forever', () => {
    for (let i = 0; i < 20; i += 1) recordSearch(`search ${i}`)
    expect(recentSearches.get()).toHaveLength(8)
    expect(recentSearches.get()[0]).toBe('search 19') // most recent first
  })
})
