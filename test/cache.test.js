import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache } from '../src/rinlink/core/cache.js'

const CACHE_KEY = id => `rin:cache:${id}`

function memBackend() {
    const map = new Map()
    return {
        map,
        get: (k, d) => (map.has(k) ? map.get(k) : d),
        set: (k, v) => void map.set(k, v),
        delete: k => void map.delete(k),
    }
}

test('cache keys use rin:cache:<id> shape and store JSON with ts', () => {
    const backend = memBackend()
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 24 * 60 * 60 * 1000 } })
    cache.set('730', { exists: true, url: 'https://example.com/topic', tags: ['update'] })
    const raw = backend.map.get('rin:cache:730')
    const parsed = JSON.parse(raw)
    assert.equal(parsed.exists, true)
    assert.equal(parsed.url, 'https://example.com/topic')
    assert.ok(typeof parsed.ts === 'number')
})

test('cache roundtrips via get', () => {
    const backend = memBackend()
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 1000 } })
    cache.set('730', { exists: true, url: 'u', tags: ['a'] })
    const entry = cache.get('730')
    assert.equal(entry.exists, true)
    assert.equal(entry.url, 'u')
    assert.deepEqual(entry.tags, ['a'])
})

test('cache drops entries written by an older schema', () => {
    const backend = memBackend()
    backend.map.set('rin:cache:730', JSON.stringify({ exists: true, url: 'wrong-topic', ts: Date.now() }))
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 24 * 60 * 60 * 1000 } })
    assert.equal(cache.get('730'), null)
    assert.equal(backend.map.has('rin:cache:730'), false)
})

test('cache get returns null for missing key', () => {
    const cache = createCache({ storage: memBackend(), cfg: { CACHE_KEY, CACHE_TTL: 1000 } })
    assert.equal(cache.get('missing'), null)
})

test('cache expires after TTL and deletes the key', () => {
    const backend = memBackend()
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 1000 } })
    cache.set('730', { exists: true })
    backend.map.set('rin:cache:730', JSON.stringify({ exists: true, ts: Date.now() - 5000 }))
    assert.equal(cache.get('730'), null)
    assert.equal(backend.map.has('rin:cache:730'), false)
})

test('cache clear removes key', () => {
    const backend = memBackend()
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 1000 } })
    cache.set('730', { exists: true })
    assert.equal(backend.map.has('rin:cache:730'), true)
    cache.clear('730')
    assert.equal(backend.map.has('rin:cache:730'), false)
})

test('cache get returns null on invalid JSON', () => {
    const backend = memBackend()
    backend.map.set('rin:cache:730', 'not-json{{')
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 1000 } })
    assert.equal(cache.get('730'), null)
})

test('prune deletes expired cache keys and leaves fresh ones', () => {
    const backend = memBackend()
    backend.keys = () => [...backend.map.keys()]
    const cache = createCache({ storage: backend, cfg: { CACHE_KEY, CACHE_TTL: 1000 } })

    cache.set('730', { exists: true })
    cache.set('570', { exists: true })
    backend.map.set('rin:cache:440', JSON.stringify({ exists: true, ts: Date.now() - 5000 }))
    backend.map.set('unrelated', 'keep me')

    cache.prune()

    assert.equal(backend.map.has('rin:cache:440'), false)
    assert.equal(backend.map.has('rin:cache:730'), true)
    assert.equal(backend.map.has('rin:cache:570'), true)
    assert.equal(backend.map.get('unrelated'), 'keep me')
})
