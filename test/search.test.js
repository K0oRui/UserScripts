import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CFG } from '../src/rinlink/config.js'
import { createSearchService } from '../src/rinlink/core/search.js'

CFG.LOG_LEVEL = 'none'
globalThis.location = { hostname: 'test.local' }

const topic = (text, href = 'viewtopic.php?t=42') => ({
    textContent: text,
    href,
    getAttribute: () => href,
})

const flush = () => new Promise(r => setTimeout(r, 15))

function makeService() {
    const mem = new Map()
    const cache = {
        get: id => mem.get(id) ?? null,
        set: (id, data) => void mem.set(id, data),
        clear: id => void mem.delete(id),
    }
    const requests = []
    const xhr = {
        request(url, cb) {
            requests.push({ url, cb })
        },
    }
    const bypass = {
        urls: [],
        calls: 0,
        run(url, cb) {
            bypass.urls.push(url)
            bypass.calls++
            bypass.cb = cb
        },
        reply(topics) {
            if (bypass.cb) bypass.cb(topics)
        },
    }
    const ui = {
        setPending() {},
        setReady() {
            ui.readyCalls = (ui.readyCalls ?? 0) + 1
        },
        setNotFound() {},
        setLoginRequired() {
            ui.loginCalls = (ui.loginCalls ?? 0) + 1
        },
        showLoginBanner() {
            ui.loginBannerCalls = (ui.loginBannerCalls ?? 0) + 1
        },
        showVerify() {
            ui.showVerifyCalls = (ui.showVerifyCalls ?? 0) + 1
            ui.lastOnVerify = arguments[1]
        },
        appendTags() {},
        extractTags() {
            return []
        },
        showNotFoundBanner() {
            ui.bannerCalls = (ui.bannerCalls ?? 0) + 1
        },
    }
    const search = createSearchService({ cache, xhr, bypass, cfg: { SEARCH_COOLDOWN_MS: 0 }, ui })
    return { cache, mem, requests, xhr, bypass, ui, search }
}

test('searchFor resolves ready when a topic matches on first attempt', async () => {
    const { search, requests } = makeService()
    const p = search.searchFor('730', 'Counter-Strike Global Offensive', null, null)
    assert.equal(requests.length, 2)
    requests[0].cb(false, [topic('Counter-Strike Global Offensive')], '<html id="pagecontent">ok</html>')
    const res = await p
    assert.equal(res.status, 'ready')
    assert.ok(res.url.includes('viewtopic.php?t=42'))
})

test('searchFor resolves verify when blocked and records pending', async () => {
    const { search, requests, ui } = makeService()
    const p = search.searchFor('100', 'Some Game', null, null)
    assert.equal(requests.length, 2)
    requests[0].cb(true, [], '')
    const res = await p
    assert.equal(res.status, 'verify')
    assert.equal(search.getDebugState().verifyPending, 1)
    assert.equal(ui.showVerifyCalls ?? 0, 0)
})

test('searchFor with a button on blocked marks the button for verify', async () => {
    const { search, requests, ui } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('100', 'Some Game', btn, null)
    requests[0].cb(true, [], '')
    const res = await p
    assert.equal(res.status, 'verify')
    assert.equal(ui.showVerifyCalls, 1)
})

test('searchFor short-circuits from cache without xhr calls', async () => {
    const { search, requests, cache } = makeService()
    cache.set('730', { exists: true, url: 'https://cs.rin.ru/forum/viewtopic.php?t=99', tags: ['isolado'], ts: Date.now() })
    const p = search.searchFor('730', 'Game')
    const res = await p
    assert.equal(res.status, 'ready')
    assert.ok(res.url.includes('t=99'))
    assert.equal(requests.length, 0)
})

test('searchFor resolves notfound when all searches come up empty', async () => {
    const { search, requests, ui } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('200', 'Unknown Game Zzz', btn, null)
    while (requests.length) {
        requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
        await flush()
    }
    await flush()
    const res = await p
    assert.equal(res.status, 'notfound')
    assert.ok((ui.bannerCalls ?? 0) >= 1)
    assert.equal(search.getDebugState().resolved, 1)
})

test('searchFor asks a guest to sign in instead of caching a miss', async () => {
    const { search, requests, ui, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('13520', 'Far Cry', btn, null)
    const guestPage = '<html id="pagecontent"><a href="./ucp.php?mode=login">Login</a> no matches</html>'
    while (requests.length) {
        requests.shift().cb(false, [], guestPage, false, true)
        await flush()
    }
    await flush()
    const res = await p
    assert.equal(res.status, 'login')
    assert.equal(ui.loginCalls, 1)
    assert.equal(ui.loginBannerCalls, 1)
    assert.equal(mem.size, 0, 'a guest miss must not be cached')
})

test('a guest bypass miss asks for login instead of caching', async () => {
    const { search, requests, ui, bypass, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('900', 'Guest Game', btn, null)
    requests[0].cb(true, [], '')
    const res = await p
    assert.equal(res.status, 'verify')

    ui.lastOnVerify()
    await flush()
    assert.equal(bypass.calls, 1)

    bypass.cb([], true, true)
    await flush()
    assert.equal(ui.loginCalls, 1)
    assert.equal(mem.size, 0, 'a guest bypass miss must not be cached')
})

test('searchFor resolves notfound when both appId and title legs miss', async () => {
    const { search, requests, mem } = makeService()
    const p = search.searchFor('730', 'Counter-Strike Global Offensive', null, null)
    assert.equal(requests.length, 2, 'only the appId and title legs should run')
    requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
    requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
    await flush()
    assert.equal(requests.length, 0, 'no further legs should run after both misses')
    const res = await p
    assert.equal(res.status, 'notfound')
    assert.equal(mem.get('730')?.exists, false)
})

test('retry routes the search through the bypass flow on verify', async () => {
    const { search, requests, ui, bypass } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('100', 'Some Game', btn, null)
    requests[0].cb(true, [], '')
    const res = await p
    assert.equal(res.status, 'verify')
    assert.equal(typeof ui.lastOnVerify, 'function')

    ui.lastOnVerify()
    await flush()
    assert.equal(bypass.calls, 1)
    assert.ok(bypass.urls[0].includes('keywords='))

    bypass.reply([topic('Some Game — topic', 'viewtopic.php?t=77')])
    await flush()
    assert.ok(btn.href.includes('viewtopic.php?t=77'))
    const again = search.searchFor('100', 'Some Game', null, null)
    const r = await again
    assert.equal(r.status, 'ready')
    assert.ok(r.url.includes('viewtopic.php?t=77'))
})

test('retry resolves notfound when the bypass fails', async () => {
    const { search, requests, ui, bypass } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.searchFor('100', 'Some Game', btn, null)
    requests[0].cb(true, [], '')
    await p

    ui.lastOnVerify()
    await flush()
    assert.equal(bypass.calls, 1)
    bypass.reply([])
    await flush()

    const again = search.searchFor('100', 'Some Game', null, null)
    const r = await again
    assert.equal(r.status, 'notfound')
})

test('searchFor dedupes concurrent calls for the same appId', async () => {
    const { search, requests } = makeService()
    const p1 = search.searchFor('999', 'Deduped Game')
    const p2 = search.searchFor('999', 'Deduped Game')
    assert.equal(requests.length, 2)
    requests[0].cb(false, [topic('Deduped Game')], '<html id="pagecontent">ok</html>')
    const [r1, r2] = await Promise.all([p1, p2])
    assert.equal(r1.status, 'ready')
    assert.equal(r2.status, 'ready')
})

test('games without an appId never share a cache entry', async () => {
    const { search, requests, cache } = makeService()

    const btnA = { dataset: {}, href: '#' }
    const pA = search.searchFor(null, 'Game A', btnA, null)
    requests.shift().cb(false, [topic('Game A', 'viewtopic.php?t=1')], '<html id="pagecontent"></html>')
    const a = await pA
    assert.ok(a.url.includes('t=1'))
    requests.length = 0

    const btnB = { dataset: {}, href: '#' }
    const pB = search.searchFor(null, 'Game B', btnB, null)
    assert.ok(requests.length > 0, 'expected a fresh search for the second game')
    requests.shift().cb(false, [topic('Game B', 'viewtopic.php?t=2')], '<html id="pagecontent"></html>')
    const b = await pB

    assert.ok(b.url.includes('t=2'), `second game reused the first result: ${b.url}`)
    assert.ok(btnB.href.includes('t=2'))
    assert.equal(cache.get(null), null, 'null-appId results must not be cached')
})

test('a button inserted while verify is pending gets its own verify control', async () => {
    const { search, requests, ui } = makeService()
    const btn1 = { dataset: {}, href: '#' }
    const p1 = search.searchFor('100', 'Some Game', btn1, null)
    requests[0].cb(true, [], '')
    await p1
    assert.equal(search.getDebugState().verifyPending, 1)

    const btn2 = { dataset: {}, href: '#' }
    const res = await search.searchFor('100', 'Some Game', btn2, null)
    assert.equal(res.status, 'verify')
    assert.equal(ui.showVerifyCalls, 2)
    assert.equal(typeof ui.lastOnVerify, 'function')
})

test('exhausted flood retries ask for verify instead of caching a miss', async () => {
    const { search, requests, ui, mem } = makeService()
    const p = search.searchFor('200', 'Rate Limited', null, null)

    for (let round = 0; round < 12; round++) {
        if (!requests.length) {
            await flush()
            if (!requests.length) break
        }
        const pair = requests.splice(0, 2)
        for (const req of pair) req.cb(false, [], '<html>You cannot make another search, try again in 10 seconds</html>')
        await flush()
    }

    const res = await p
    assert.equal(res.status, 'verify', 'a flood limit must not look like a missing topic')
    assert.equal(search.getDebugState().verifyPending, 1)
    assert.equal(ui.bannerCalls ?? 0, 0)
    assert.equal(mem.size, 0, 'a rate limit must not poison the cache')
})

test('forceSearch title runs only the title leg and updates the button on a match', async () => {
    const { search, requests, cache, ui } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.forceSearch('901', 'Some Game', btn, 'title')

    assert.equal(requests.length, 1, 'a forced search must not fan out')
    assert.ok(requests[0].url.includes('sf=titleonly'))
    requests[0].cb(false, [topic('Some Game')], '<html id="pagecontent">ok</html>')

    const res = await p
    assert.equal(res.status, 'ready')
    assert.ok(res.url.includes('viewtopic.php?t=42'))
    assert.equal(btn.href, res.url)
    assert.equal(ui.readyCalls, 1)
    assert.equal(cache.get('901')?.exists, true)
})

test('forceSearch title miss does not cache or show the not found state', async () => {
    const { search, requests, ui, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.forceSearch('902', 'Nothing Here', btn, 'title')

    assert.equal(requests.length, 1)
    requests[0].cb(false, [], '<html id="pagecontent">page</html>')

    const res = await p
    assert.equal(res.status, 'notfound')
    assert.equal(ui.bannerCalls ?? 0, 0)
    assert.equal(btn.href, '#')
    assert.equal(mem.size, 0, 'a forced miss must not poison the cache')
    assert.equal(search.getDebugState().inFlight, 0)
})

test('forceSearch reports a guest miss without changing the page state', async () => {
    const { search, requests, ui, mem } = makeService()
    const btn = { dataset: {}, href: '#' }
    const p = search.forceSearch('903', 'Far Cry', btn, 'title')
    const guestPage = '<html id="pagecontent"><a href="./ucp.php?mode=login">Login</a> no matches</html>'

    requests[0].cb(false, [], guestPage, false, true)

    const res = await p
    assert.equal(res.status, 'login')
    assert.equal(ui.loginCalls ?? 0, 0)
    assert.equal(ui.loginBannerCalls ?? 0, 0)
    assert.equal(mem.size, 0)
})

test('forceSearch auto runs the full flow but does not cache a miss', async () => {
    const { search, requests, ui, mem } = makeService()
    const p = search.forceSearch('904', 'Missing Game', null, 'auto')
    assert.equal(requests.length, 2)

    while (requests.length) {
        requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
        await flush()
    }
    await flush()

    const res = await p
    assert.equal(res.status, 'notfound')
    assert.equal(ui.bannerCalls ?? 0, 0)
    assert.equal(mem.size, 0)
})

const topicPage = appId => `<html><div class="postbody"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg"></div></html>`

test('a one-word title match is rejected when the topic belongs to another app', async () => {
    const { search, requests, mem } = makeService()
    const p = search.searchFor('1077660', 'Drift', null, null)

    assert.equal(requests.length, 2)
    requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
    requests.shift().cb(false, [topic('Drift [Early Access]')], '<html id="pagecontent">page</html>')

    assert.equal(requests.length, 1, 'the title candidate should be opened')
    assert.ok(requests[0].url.includes('viewtopic.php?t=42'))
    requests[0].cb(false, [], topicPage(2159650))

    const res = await p
    assert.equal(res.status, 'notfound')
    assert.equal(mem.get('1077660')?.exists, false)
})

test('a one-word title match is accepted when the topic carries the appId', async () => {
    const { search, requests, mem } = makeService()
    const p = search.searchFor('1077660', 'Drift', null, null)

    requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
    requests.shift().cb(false, [topic('Drift [Early Access]')], '<html id="pagecontent">page</html>')
    requests.shift().cb(false, [], topicPage(1077660))

    const res = await p
    assert.equal(res.status, 'ready')
    assert.ok(res.url.includes('viewtopic.php?t=42'))
    assert.equal(mem.get('1077660')?.exists, true)
})

test('a multi-word title match skips the topic appId check', async () => {
    const { search, requests } = makeService()
    const p = search.searchFor('730', 'Some Game', null, null)

    requests.shift().cb(false, [], '<html id="pagecontent">page</html>')
    requests.shift().cb(false, [topic('Some Game')], '<html id="pagecontent">page</html>')

    const res = await p
    assert.equal(res.status, 'ready')
    assert.equal(requests.length, 0, 'multi-word names should not trigger a topic fetch')
})

test('forceSearch title rejects a same-name topic for another app', async () => {
    const { search, requests } = makeService()
    const p = search.forceSearch('1077660', 'Drift', null, 'title')

    assert.equal(requests.length, 1)
    requests.shift().cb(false, [topic('Drift [Early Access]')], '<html id="pagecontent">page</html>')
    assert.equal(requests.length, 1)
    requests.shift().cb(false, [], topicPage(2159650))

    const res = await p
    assert.equal(res.status, 'notfound')
    assert.equal(res.reason, 'appid-mismatch')
})

test('forceSearch appId mode requires an appId', async () => {
    const { search, requests } = makeService()
    const res = await search.forceSearch(null, 'Name Only', null, 'appId')
    assert.equal(res.status, 'error')
    assert.equal(res.reason, 'no-appid')
    assert.equal(requests.length, 0)
})

test('forceSearch refuses to run while another search is in flight', async () => {
    const { search, requests } = makeService()
    const first = search.searchFor('905', 'Busy Game')

    const res = await search.forceSearch('905', 'Busy Game', null, 'title')
    assert.equal(res.status, 'busy')

    requests[0].cb(false, [topic('Busy Game')], '<html id="pagecontent">ok</html>')
    assert.equal((await first).status, 'ready')
})
