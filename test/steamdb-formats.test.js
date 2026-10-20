import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDlcGoldberg, formatDlcStar, formatDlcAli213, formatDlcAli213Numbered } from '../src/steamdb-emu-tools/dlc.js'
import { formatLangGoldberg, formatLangStar } from '../src/steamdb-emu-tools/langs.js'
import { askTarget, askDlcTarget, askAli213Layout, askOutput, askAchievementOutput } from '../src/steamdb-emu-tools/popup.js'

test('formatDlcGoldberg emits ID=NAME lines for configs.app.ini', () => {
    assert.equal(formatDlcGoldberg([{ id: '3279970', name: 'DAIMA PACK' }]), '3279970=DAIMA PACK')
})

test('formatDlcStar emits dlc.ID = Name lines for game.star', () => {
    assert.equal(formatDlcStar([{ id: '3279970', name: 'DAIMA PACK' }]), 'dlc.3279970 = DAIMA PACK')
})

test('formatDlcAli213 emits ID = Name lines', () => {
    assert.equal(
        formatDlcAli213([
            { id: '245620', name: 'Half-Life 2: Lost Coast' },
            { id: '245630', name: 'Half-Life 2: Episode One' },
        ]),
        '245620 = Half-Life 2: Lost Coast\n245630 = Half-Life 2: Episode One',
    )
})

test('formatDlcAli213Numbered emits numbered ID and Name pairs', () => {
    assert.equal(
        formatDlcAli213Numbered([
            { id: '245620', name: 'Half-Life 2: Lost Coast' },
            { id: '245630', name: 'Half-Life 2: Episode One' },
        ]),
        'DLC001 = 245620\nDLC001Name = Half-Life 2: Lost Coast\nDLC002 = 245630\nDLC002Name = Half-Life 2: Episode One',
    )
})

test('formatLangGoldberg emits one token per line for supported_languages.txt', () => {
    assert.equal(formatLangGoldberg(['english', 'schinese']), 'english\nschinese')
})

test('formatLangStar emits one token per line for languages.star', () => {
    assert.equal(formatLangStar(['english', 'schinese']), 'english\nschinese')
})

const makeEl = () => {
    const handlers = {}
    return {
        children: [],
        style: {},
        textContent: '',
        id: '',
        removed: false,
        appendChild(c) {
            this.children.push(c)
            return c
        },
        setAttribute(name, value) {
            this[name] = value
        },
        addEventListener(ev, fn) {
            handlers[ev] = handlers[ev] || []
            handlers[ev].push(fn)
        },
        removeEventListener(ev, fn) {
            handlers[ev] = (handlers[ev] || []).filter(h => h !== fn)
        },
        remove() {
            this.removed = true
        },
        fire(ev, arg) {
            for (const fn of handlers[ev] || []) fn(arg)
        },
    }
}

const withFakeDom = async fn => {
    const els = []
    const docHandlers = {}
    const prev = globalThis.document
    const doc = {
        createElement: () => {
            const el = makeEl()
            els.push(el)
            return el
        },
        body: makeEl(),
        addEventListener: (ev, fn2) => {
            docHandlers[ev] = docHandlers[ev] || []
            docHandlers[ev].push(fn2)
        },
        removeEventListener: (ev, fn2) => {
            docHandlers[ev] = (docHandlers[ev] || []).filter(h => h !== fn2)
        },
        fire: (ev, arg) => {
            for (const fn2 of docHandlers[ev] || []) fn2(arg)
        },
    }
    globalThis.document = doc
    try {
        await fn({ els, doc })
    } finally {
        globalThis.document = prev
    }
}

const findButton = (root, text) => {
    const stack = [root]
    while (stack.length > 0) {
        const el = stack.pop()
        if (el.textContent === text && typeof el.fire === 'function' && el !== root) return el
        stack.push(...el.children)
    }
    return null
}

test('askTarget resolves goldberg and removes the popup', async () => {
    await withFakeDom(async ({ els }) => {
        const pending = askTarget('Copy DLC list')
        const overlay = els[0]
        findButton(overlay, 'Goldberg').fire('click', {})
        assert.equal(await pending, 'goldberg')
        assert.equal(overlay.removed, true)
    })
})

test('askTarget resolves star and removes the popup', async () => {
    await withFakeDom(async ({ els }) => {
        const pending = askTarget('Copy languages')
        const overlay = els[0]
        findButton(overlay, 'STAR').fire('click', {})
        assert.equal(await pending, 'star')
        assert.equal(overlay.removed, true)
    })
})

test('askDlcTarget resolves ALI213', async () => {
    await withFakeDom(async ({ els }) => {
        const pending = askDlcTarget('Copy DLC list')
        findButton(els[0], 'ALI213').fire('click', {})
        assert.equal(await pending, 'ali213')
    })
})

test('askAli213Layout resolves plain and numbered', async () => {
    await withFakeDom(async ({ els }) => {
        const active = () => els.find(e => e.id === 'steamdb-copy-target-overlay' && !e.removed)

        const p1 = askAli213Layout('Copy DLC list')
        findButton(active(), 'Plain list').fire('click', {})
        assert.equal(await p1, 'plain')

        const p2 = askAli213Layout('Copy DLC list')
        findButton(active(), 'Numbered entries').fire('click', {})
        assert.equal(await p2, 'numbered')
    })
})

test('askTarget resolves null on escape, cancel, and outside click', async () => {
    await withFakeDom(async ({ els, doc }) => {
        const overlays = () => els.filter(e => e.id === 'steamdb-copy-target-overlay' && !e.removed)
        const p1 = askTarget('Copy DLC list')
        doc.fire('keydown', { key: 'Escape' })
        assert.equal(await p1, null)

        const p2 = askTarget('Copy DLC list')
        findButton(overlays().pop(), 'Cancel').fire('click', {})
        assert.equal(await p2, null)
    })
    await withFakeDom(async ({ els }) => {
        const pending = askTarget('Copy DLC list')
        const overlay = els[0]
        overlay.fire('click', { target: overlay })
        assert.equal(await pending, null)
        assert.equal(overlay.removed, true)
    })
})

test('askOutput resolves file and clipboard', async () => {
    await withFakeDom(async ({ els }) => {
        const p1 = askOutput('Copy languages')
        findButton(els[0], 'Download file').fire('click', {})
        assert.equal(await p1, 'file')

        const p2 = askOutput('Copy achievements')
        const overlay = els.find(e => e.id === 'steamdb-copy-target-overlay' && !e.removed)
        findButton(overlay, 'Copy to clipboard').fire('click', {})
        assert.equal(await p2, 'clipboard')
    })
})

test('askAchievementOutput resolves json, zip, and clipboard', async () => {
    await withFakeDom(async ({ els }) => {
        const active = () => els.find(e => e.id === 'steamdb-copy-target-overlay' && !e.removed)

        const p1 = askAchievementOutput('Copy achievements')
        findButton(active(), 'Download JSON').fire('click', {})
        assert.equal(await p1, 'json')

        const p2 = askAchievementOutput('Copy achievements')
        findButton(active(), 'Download with icons').fire('click', {})
        assert.equal(await p2, 'zip')

        const p3 = askAchievementOutput('Copy achievements')
        findButton(active(), 'Copy to clipboard').fire('click', {})
        assert.equal(await p3, 'clipboard')
    })
})
