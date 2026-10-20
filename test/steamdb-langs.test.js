import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLang, parseLangRows, formatLangGoldberg } from '../src/steamdb-emu-tools/langs.js'

const langRow = name => ({ querySelector: () => ({ textContent: name }) })

const langRoot = names => ({
    querySelectorAll: sel => {
        if (sel === 'h2') return [{ textContent: 'Supported Languages', nextElementSibling: { tagName: 'TABLE', querySelectorAll: () => names.map(langRow) } }]
        return []
    },
})

test('normalizeLang maps SteamDB display names to short tokens', () => {
    assert.equal(normalizeLang('English'), 'english')
    assert.equal(normalizeLang('Spanish - Spain'), 'spanish')
    assert.equal(normalizeLang('Japanese'), 'japanese')
    assert.equal(normalizeLang('Korean'), 'koreana')
    assert.equal(normalizeLang('Portuguese - Brazil'), 'brazilian')
    assert.equal(normalizeLang('Simplified Chinese'), 'schinese')
    assert.equal(normalizeLang('Spanish - Latin America'), 'latam')
    assert.equal(normalizeLang('Traditional Chinese'), 'tchinese')
    assert.equal(normalizeLang('Arabic'), 'arabic')
})

test('parseLangRows extracts Elden Ring languages in table order', () => {
    const names = [
        'English',
        'French',
        'Italian',
        'German',
        'Spanish - Spain',
        'Japanese',
        'Korean',
        'Polish',
        'Portuguese - Brazil',
        'Russian',
        'Simplified Chinese',
        'Spanish - Latin America',
        'Thai',
        'Traditional Chinese',
        'Arabic',
    ]
    assert.deepEqual(parseLangRows(langRoot(names)), [
        'english',
        'french',
        'italian',
        'german',
        'spanish',
        'japanese',
        'koreana',
        'polish',
        'brazilian',
        'russian',
        'schinese',
        'latam',
        'thai',
        'tchinese',
        'arabic',
    ])
})

test('parseLangRows returns empty when the heading is missing', () => {
    assert.deepEqual(parseLangRows({ querySelectorAll: () => [] }), [])
})

test('formatLangGoldberg joins tokens one per line', () => {
    assert.equal(formatLangGoldberg(['english', 'french']), 'english\nfrench')
    assert.equal(formatLangGoldberg([]), '')
})
