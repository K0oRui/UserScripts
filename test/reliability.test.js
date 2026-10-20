import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchService } from '../src/rinlink/core/search.js'

globalThis.location = { hostname: 'test.local' }

const topic = (text, href = 'viewtopic.php?t=42') => ({
    textContent: text,
    href,
    getAttribute: () => href,
})

const flush = () => new Promise(r => setTimeout(r, 10))

function makeService({ tags = [] } = {}) {
    const mem = new Map()
    const cache = {
        get: id => mem.get(id) ?? null,
        set: (id, data) => void mem.set(id, data),
        clear: id => void mem.delete(id),
    }
    const requests = []
    const xhr = {
        created: 0,
        request(url, cb) {
            xhr.created++
            requests.push({ url, cb })
        },
    }
    const bypass = {
        cbs: [],
        run(url, cb) {
            bypass.cbs.push(cb)
        },
    }
    const ui = {
        setPending() {},
        setReady() {},
        setNotFound() {},
        showVerify(btn, onVerify) {
            ui.verifiers = ui.verifiers ?? new Map()
            ui.verifiers.set(btn, onVerify)
        },
        appendTags() {},
        extractTags() {
            return tags
        },
        showNotFoundBanner() {},
    }
    const search = createSearchService({ cache, xhr, bypass, cfg: { SEARCH_COOLDOWN_MS: 0 }, ui })
    return { mem, requests, xhr, bypass, ui, search }
}

test('searchFor gives up after repeated flood responses instead of looping forever', async () => {
    const { search, requests, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('300', 'Flooded Game', btn, null)
    let shifts = 0
    while (requests.length && shifts < 40) {
        shifts++
        requests.shift().cb(false, [], 'cannot make another search, try again in 10 seconds')
        await flush()
    }
    const res = await p
    assert.equal(res.status, 'verify')
    assert.equal(mem.size, 0)
    assert.ok(shifts < 40, `took ${shifts} requests, loop may be unbounded`)
    assert.ok(shifts > 3, `expected several retries, got ${shifts}`)
})

test('a single unavailable leg retries instead of caching a miss', async () => {
    const { search, requests, mem } = makeService()
    const p = search.searchFor('310', 'Half Flooded', null, null)

    assert.equal(requests.length, 2)
    const [appIdReq, titleReq] = requests.splice(0, 2)
    appIdReq.cb(false, [], 'cannot make another search, try again in 10 seconds')
    titleReq.cb(false, [], '<html id="pagecontent">page</html>')
    await flush()

    assert.equal(requests.length, 2, 'the first pass should run again')
    requests[0].cb(false, [topic('Half Flooded')], '<html id="pagecontent">ok</html>')

    const res = await p
    assert.equal(res.status, 'ready')
    assert.equal(res.url.includes('viewtopic.php?t=42'), true)
    assert.equal(mem.get('310')?.exists, true)
})

test('retry via a second verify button keeps the first button subscribed', async () => {
    const { search, requests, ui, bypass } = makeService()
    const btn1 = { dataset: {}, href: '#' }
    const btn2 = { dataset: {}, href: '#' }
    const p1 = search.searchFor('400', 'Two Button Game', btn1, null)
    const p2 = search.searchFor('400', 'Two Button Game', btn2, null)
    requests[0].cb(true, [], '')
    assert.equal((await p1).status, 'verify')
    assert.equal((await p2).status, 'verify')

    ui.verifiers.get(btn1)()
    await flush()
    ui.verifiers.get(btn2)()
    await flush()
    assert.equal(bypass.cbs.length, 1, 'a second verify click must reuse the running bypass')

    bypass.cbs[0]([topic('Two Button Game')])
    await flush()
    assert.ok(btn1.href.includes('viewtopic.php'), `btn1 not updated: ${btn1.href}`)
    assert.ok(btn2.href.includes('viewtopic.php'), `btn2 not updated: ${btn2.href}`)
})

test('a failed bypass returns to verify instead of caching a miss', async () => {
    const { search, requests, ui, bypass, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('600', 'Blocked Game', btn, null)
    requests[0].cb(true, [], '')
    assert.equal((await p).status, 'verify')

    ui.verifiers.get(btn)()
    await flush()
    assert.equal(bypass.cbs.length, 1)
    bypass.cbs[0]([], false)
    await flush()

    assert.equal(mem.size, 0, 'a failed bypass must not cache a miss')
    assert.equal(search.getDebugState().verifyPending, 1)
})

test('refetchAll cancels an in-flight search without writing its result', async () => {
    const { search, requests, mem } = makeService()
    const p = search.searchFor('700', 'Slow Game', null, null)
    assert.equal(requests.length, 2)

    search.refetchAll()
    assert.equal((await p).status, 'cancelled')

    for (const req of requests.splice(0)) req.cb(false, [topic('Slow Game', 'viewtopic.php?t=9')], '<html id="pagecontent"></html>')
    await flush()

    assert.equal(mem.size, 0, 'a cancelled search must not write the cache')
    assert.equal(search.getDebugState().resolved, 0)
})

test('in-memory cache preserves tags on repeat visits', async () => {
    const { search, requests, xhr } = makeService({ tags: ['ENG'] })
    const p = search.searchFor('500', 'Tagged Game', null, null)
    requests[0].cb(false, [topic('Tagged Game')], '<html id="pagecontent">ok</html>')
    const first = await p
    assert.equal(first.status, 'ready')
    assert.deepEqual(first.tags, ['ENG'])

    const second = await search.searchFor('500', 'Tagged Game', null, null)
    assert.equal(second.status, 'ready')
    assert.deepEqual(second.tags, ['ENG'])
    assert.equal(xhr.created, 2)
})

test('searchFor with no appId and no name resolves notfound without xhr', async () => {
    const { search, requests } = makeService()
    const res = await search.searchFor(null, null, null, null)
    assert.equal(res.status, 'notfound')
    assert.equal(requests.length, 0)
})

test('repeated transport failures route to verify instead of notfound', async () => {
    const { search, requests, ui } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('600', 'Flaky Game', btn, null)
    let shifts = 0
    while (requests.length && shifts < 10) {
        shifts++
        requests.shift().cb(false, [], '', true)
        await flush()
    }
    const res = await p
    assert.equal(res.status, 'verify')
    assert.equal(search.getDebugState().verifyPending, 1)
    assert.equal(ui.verifiers.size, 1)
})
