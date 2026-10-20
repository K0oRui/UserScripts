import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTopic, pickBestTopic } from '../src/rinlink/core/scoring.js'

test('scoreTopic: exact match is 100', () => {
    assert.equal(scoreTopic('Grand Theft Auto V', 'Grand Theft Auto V'), 100)
    assert.equal(scoreTopic('Crysis', 'Crysis'), 100)
})

test('scoreTopic: plain prefix is 70 (brackets are stripped by normalise)', () => {
    assert.equal(scoreTopic('Grand Theft Auto V [FitGirl Repack]', 'Grand Theft Auto V'), 70)
    assert.equal(scoreTopic('Grand Theft Auto V Deluxe Edition', 'Grand Theft Auto V'), 70)
    assert.equal(scoreTopic('Crysis Warhead', 'Crysis'), 70)
})

test('scoreTopic: sequel suffix is 40', () => {
    assert.equal(scoreTopic('Grand Theft Auto V 2', 'Grand Theft Auto V'), 40)
    assert.equal(scoreTopic('Crysis II', 'Crysis'), 40)
})

test('scoreTopic: title contains app name', () => {
    assert.equal(scoreTopic('The Witcher 3: Wild Hunt', 'Witcher 3'), 65)
})

test('scoreTopic: unrelated title scores 0', () => {
    assert.equal(scoreTopic('Grand Theft Auto V', 'Microsoft Flight Simulator'), 0)
})

test('scoreTopic: empty app name scores 0', () => {
    assert.equal(scoreTopic('Grand Theft Auto V', ''), 0)
    assert.equal(scoreTopic('Grand Theft Auto V', null), 0)
})

test('pickBestTopic: returns best matching topic', () => {
    const topics = [{ textContent: 'Game Deluxe' }, { textContent: 'Game [Repack]' }, { textContent: 'Game' }]
    const best = pickBestTopic(topics, 'Game')
    assert.equal(best, topics[2])
})

test('pickBestTopic: rejects below threshold', () => {
    const topics = [{ textContent: 'Completely Unrelated Game' }]
    assert.equal(pickBestTopic(topics, 'Grand Theft Auto V'), null)
})

test('pickBestTopic: single appId search result short-circuits', () => {
    const topics = [{ textContent: 'totally unrelated single hit' }]
    assert.equal(pickBestTopic(topics, 'The Witcher 3', true), topics[0])
})

test('pickBestTopic: empty topics returns null', () => {
    assert.equal(pickBestTopic([], 'Game'), null)
})
