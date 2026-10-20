import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractAppId, sanitiseKw, buildSearchUrl, buildTitleUrl, resolveTopicUrl } from '../src/rinlink/utils.js'

test('extractAppId pulls numeric app id from urls', () => {
    assert.equal(extractAppId('https://store.steampowered.com/app/730/'), '730')
    assert.equal(extractAppId('/app/440/'), '440')
    assert.equal(extractAppId('https://steamdb.info/app/1123450/'), '1123450')
    assert.equal(extractAppId('https://store.steampowered.com/app/730/?l=english'), '730')
    assert.equal(extractAppId('no id here'), null)
    assert.equal(extractAppId(''), null)
    assert.equal(extractAppId(null), null)
})

test('sanitiseKw passes pure digits through unchanged', () => {
    assert.equal(sanitiseKw('1234'), '1234')
})

test('sanitiseKw strips punctuation and collapses whitespace', () => {
    assert.equal(sanitiseKw('  Hello,  World!  '), 'Hello World')
    assert.equal(sanitiseKw('Grand Theft Auto: San Andreas'), 'Grand Theft Auto San Andreas')
})

test('sanitiseKw handles falsy input', () => {
    assert.equal(sanitiseKw(''), '')
    assert.equal(sanitiseKw(null), '')
})

test('buildSearchUrl encodes keywords and pins forum', () => {
    const url = buildSearchUrl('hello world')
    assert.ok(url.includes('keywords=hello%20world'))
    assert.ok(url.includes('fid%5B%5D=10'))
    assert.ok(url.includes('sr=topics'))
    assert.ok(url.includes('sf=firstpost'))
})

test('buildTitleUrl passes short keywords through with titleonly', () => {
    const url = buildTitleUrl('Counter-Strike Global Offensive')
    assert.ok(url.includes('keywords=Counter%20Strike%20Global%20Offensive'))
    assert.ok(url.includes('sf=titleonly'))
})

test('buildTitleUrl caps keywords to 10 words', () => {
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ')
    const url = buildTitleUrl(words)
    const kw = 'word0%20word1%20word2%20word3%20word4%20word5%20word6%20word7%20word8%20word9'
    assert.ok(url.includes(`keywords=${kw}`))
    assert.ok(!url.includes('word10'))
    assert.ok(url.includes('sf=titleonly'))
})

test('resolveTopicUrl: relative topic links resolve against base url', () => {
    assert.equal(resolveTopicUrl('viewtopic.php?t=123'), 'https://cs.rin.ru/forum/viewtopic.php?t=123')
    assert.equal(resolveTopicUrl('/viewtopic.php?t=456'), 'https://cs.rin.ru/forum/viewtopic.php?t=456')
    assert.equal(resolveTopicUrl('./viewtopic.php?t=1'), 'https://cs.rin.ru/forum/viewtopic.php?t=1')
})

test('resolveTopicUrl: absolute urls pass through and strip hilit', () => {
    assert.equal(resolveTopicUrl('https://cs.rin.ru/forum/viewtopic.php?t=789'), 'https://cs.rin.ru/forum/viewtopic.php?t=789')
    assert.equal(resolveTopicUrl('https://cs.rin.ru/forum/viewtopic.php?t=789&hilit=foo'), 'https://cs.rin.ru/forum/viewtopic.php?t=789')
})

test('resolveTopicUrl: falsy input falls back to create url', () => {
    assert.equal(resolveTopicUrl(null), 'https://cs.rin.ru/forum/posting.php?mode=post&f=10')
    assert.equal(resolveTopicUrl(''), 'https://cs.rin.ru/forum/posting.php?mode=post&f=10')
})
