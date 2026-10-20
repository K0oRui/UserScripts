import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStorage } from '../src/rinlink/core/storage.js'

function memBackend() {
    const map = new Map()
    return {
        map,
        get: (k, d) => (map.has(k) ? map.get(k) : d),
        set: (k, v) => void map.set(k, v),
        delete: k => void map.delete(k),
    }
}

test('storage get returns default when unset', () => {
    const storage = createStorage(memBackend())
    assert.equal(storage.get('nope', 'fallback'), 'fallback')
})

test('storage get/set/delete roundtrip through injected backend', () => {
    const backend = memBackend()
    const storage = createStorage(backend)
    storage.set('key', 'value')
    assert.equal(storage.get('key', null), 'value')
    assert.equal(backend.map.get('key'), 'value')
    storage.delete('key')
    assert.equal(backend.map.has('key'), false)
})

test('storage handles object values', () => {
    const storage = createStorage(memBackend())
    const obj = { a: 1, b: [2, 3] }
    storage.set('obj', obj)
    assert.deepEqual(storage.get('obj', null), obj)
})
