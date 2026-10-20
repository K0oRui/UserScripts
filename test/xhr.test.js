import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createXhr, detectBlocked, detectGuest } from '../src/rinlink/core/xhr.js'

const SIGNALS = [
    'Security check',
    'CS RIN - Security check',
    'CS RIN - Unauthorized',
    'securitytoken_expiration',
    'Just a moment...',
    'Checking your browser',
    'cf-browser-verification',
    'challenge-platform',
]

test('detectBlocked: HTTP 403 and 401 are blocked', () => {
    assert.equal(detectBlocked(403, 'anything with pagecontent', SIGNALS), true)
    assert.equal(detectBlocked(401, 'anything with pagecontent', SIGNALS), true)
})

test('detectBlocked: block signals match case-insensitively', () => {
    assert.equal(detectBlocked(200, 'Just a moment... pagecontent wrapcentre', SIGNALS), true)
    assert.equal(detectBlocked(200, 'Checking your browser pagecontent', SIGNALS), true)
    assert.equal(detectBlocked(200, 'SECURITY CHECK pagecontent', SIGNALS), true)
    assert.equal(detectBlocked(200, 'challenge-platform pagecontent', SIGNALS), true)
})

test('detectBlocked: healthy page with markers is not blocked', () => {
    const body = '<div id="pagecontent"><div class="wrapcentre">topics here</div></div>'
    assert.equal(detectBlocked(200, body, SIGNALS), false)
})

test('detectBlocked: small body without layout markers is blocked', () => {
    assert.equal(detectBlocked(200, 'tiny response', SIGNALS), true)
})

test('detectBlocked: body without layout markers is blocked regardless of size', () => {
    const big = 'x'.repeat(12000)
    assert.equal(detectBlocked(200, big, SIGNALS), true)
})

test('detectBlocked: signal match wins even when markers are present', () => {
    assert.equal(detectBlocked(200, 'CS RIN - Security check pagecontent wrapcentre', SIGNALS), true)
    assert.equal(detectBlocked(200, 'securitytoken_expiration pagecontent', SIGNALS), true)
})

test('detectGuest: login link without logout marks a guest', () => {
    const body = '<a href="./ucp.php?mode=login">Login</a><div class="wrapcentre">results</div>'
    assert.equal(detectGuest(body), true)
})

test('detectGuest: logged-in page is not a guest', () => {
    const body = '<a href="./ucp.php?mode=logout">Logout</a><div class="wrapcentre">results</div>'
    assert.equal(detectGuest(body), false)
})

test('detectGuest: login wall text marks a guest', () => {
    assert.equal(detectGuest('<p>You must be logged in to search.</p>'), true)
    assert.equal(detectGuest('<p>Only registered users can use the search.</p>'), true)
})

test('detectGuest: empty and ordinary pages are not guests', () => {
    assert.equal(detectGuest(''), false)
    assert.equal(detectGuest('<div class="wrapcentre">results</div>'), false)
})

test('createXhr forwards the guest flag from the response body', () => {
    const prevXhr = globalThis.GM_xmlhttpRequest
    const prevParser = globalThis.DOMParser
    globalThis.DOMParser = class {
        parseFromString() {
            return { querySelectorAll: () => [] }
        }
    }
    globalThis.GM_xmlhttpRequest = ({ onload }) =>
        onload({
            status: 200,
            responseText: '<div id="pagecontent"><a href="./ucp.php?mode=login">Login</a></div>',
        })

    try {
        const xhr = createXhr({ XHR_CONCURRENCY: 2, XHR_TIMEOUT_MS: 1000, BLOCK_SIGNALS: [] })
        let args
        xhr.request('https://cs.rin.ru/forum/search.php?keywords=x', (...a) => {
            args = a
        })
        assert.equal(args[0], false)
        assert.equal(args[4], true)
    } finally {
        if (prevXhr === undefined) delete globalThis.GM_xmlhttpRequest
        else globalThis.GM_xmlhttpRequest = prevXhr
        if (prevParser === undefined) delete globalThis.DOMParser
        else globalThis.DOMParser = prevParser
    }
})
