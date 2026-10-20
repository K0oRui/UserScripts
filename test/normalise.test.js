import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise, sigWords, isCleanSuffix, isSequelSuffix } from '../src/rinlink/core/normalise.js'

test('normalise strips punctuation and lowercases', () => {
    assert.equal(normalise('The Witcher 3: Wild Hunt'), 'the witcher 3 wild hunt')
    assert.equal(normalise('Half-Life 2'), 'half life 2')
    assert.equal(normalise('Grand Theft Auto V'), 'grand theft auto v')
    assert.equal(normalise('Crysis (2013)'), 'crysis 2013')
})

test('normalise handles unicode combining marks', () => {
    assert.equal(normalise('Édition Spéciale'), 'edition speciale')
})

test('normalise strips trademark/copyright marks', () => {
    assert.equal(normalise('Star Wars™'), 'star wars')
    assert.equal(normalise('© 2024'), '2024')
})

test('normalise handles apostrophes and slashes', () => {
    assert.equal(normalise("Tom Clancy's"), 'tom clancys')
    assert.equal(normalise("The Legend of Zelda: Link's Awakening"), 'the legend of zelda links awakening')
    assert.equal(normalise('A/B Test'), 'a b test')
})

test('normalise converts version/ver and ed to edition', () => {
    assert.equal(normalise('Game of the Year Edition'), 'game of the year edition')
    assert.equal(normalise('Crysis - Version 2'), 'crysis edition 2')
    assert.equal(normalise('Crysis - Ver 2'), 'crysis edition 2')
    assert.equal(normalise('Standard Ed'), 'standard edition')
})

test('normalise returns empty string for falsy input', () => {
    assert.equal(normalise(''), '')
    assert.equal(normalise(null), '')
    assert.equal(normalise(undefined), '')
})

test('sigWords drops stop words and single non-digit chars', () => {
    assert.deepEqual(sigWords('grand theft auto v'), ['grand', 'theft', 'auto'])
    assert.deepEqual(sigWords('resident evil 2'), ['resident', 'evil', '2'])
    assert.deepEqual(sigWords('the witcher 3'), ['witcher', '3'])
})

test('isCleanSuffix accepts empty/space/bracketed suffixes only', () => {
    assert.equal(isCleanSuffix(''), true)
    assert.equal(isCleanSuffix(' '), true)
    assert.equal(isCleanSuffix(' [FitGirl Repack]'), true)
    assert.equal(isCleanSuffix(' [] [Update] '), true)
    assert.equal(isCleanSuffix(' Gold Edition'), false)
    assert.equal(isCleanSuffix(' 2'), false)
})

test('isSequelSuffix accepts numbers and roman numerals', () => {
    assert.equal(isSequelSuffix(' 2'), true)
    assert.equal(isSequelSuffix(' II'), true)
    assert.equal(isSequelSuffix(' Ii'), true)
    assert.equal(isSequelSuffix(' Remaster'), false)
    assert.equal(isSequelSuffix(' 2020'), true)
})
