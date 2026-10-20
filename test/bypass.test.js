import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBypass } from '../src/rinlink/core/bypass.js'
import { CFG } from '../src/rinlink/config.js'

CFG.LOG_LEVEL = 'none'
Math.random = () => 0

const TOPICS = [{ title: 'ok' }]

function make({ lock = '0', cleared = '', tab = null, blocked = false } = {}) {
    const map = new Map([['rin:bypass_lock', lock]])
    if (cleared) map.set('rin:cleared', cleared)
    const storage = {
        get: (k, d) => (map.has(k) ? map.get(k) : d),
        set: (k, v) => void map.set(k, v),
        delete: k => void map.delete(k),
    }
    const opened = { calls: 0 }
    const openTab = () => {
        opened.calls++
        return tab
    }
    const xhr = {
        calls: 0,
        request(url, cb) {
            xhr.calls++
            cb(blocked, blocked ? [] : TOPICS)
        },
    }
    const cfg = { BASE_URL: 'https://cs.rin.ru/forum/', BYPASS_POLL_MS: 5, BYPASS_TIMEOUT: 40 }
    return { bypass: createBypass({ storage, cfg, openTab, xhr }), storage, map, opened, xhr }
}

const runBypass = b => new Promise(resolve => b.run('https://cs.rin.ru/forum/search.php?keywords=x', resolve))

test('waits for another tab to release the bypass lock, then reads without opening a tab', async () => {
    const h = make({ lock: String(Date.now()) })
    const pending = runBypass(h.bypass)
    setTimeout(() => h.storage.set('rin:bypass_lock', '0'), 30)

    const topics = await pending
    assert.deepEqual(topics, TOPICS)
    assert.equal(h.opened.calls, 0, 'must not open a second bypass tab')
})

test('gives up and releases the lock when the bypass tab closes', async () => {
    const h = make({ tab: { closed: true, close() {} } })
    const topics = await runBypass(h.bypass)

    assert.deepEqual(topics, [])
    assert.equal(h.map.get('rin:bypass_lock'), '0')
})

test('reads the results as soon as the verify tab reports success', async () => {
    const tab = {
        closed: false,
        closedByScript: false,
        close() {
            this.closedByScript = true
        },
    }
    const h = make({ tab, cleared: String(Date.now() + 10_000) })
    const topics = await runBypass(h.bypass)

    assert.deepEqual(topics, TOPICS)
    assert.ok(h.xhr.calls >= 1)
})
