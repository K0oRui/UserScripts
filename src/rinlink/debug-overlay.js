import { log, readLogBuffer } from './core/logger.js'
import { createStorage } from './core/storage.js'
import { css, mk } from './core/dom.js'
import { extractAppId } from './utils.js'
import { app } from './main.js'

/* Every rule is scoped to #rin-debug because Steam, SteamDB and PCGamingWiki all
   ship aggressive global CSS. */

const STYLE_ID = 'rin-debug-style'
const PANEL_ID = 'rin-debug'
const UI_KEY = 'rin:debug:ui'
const MAX_ROWS = 80
const LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }
const FILTERS = [
    { id: 'all', label: 'all', min: 0 },
    { id: 'warn', label: 'warn', min: LEVELS.warn },
    { id: 'error', label: 'error', min: LEVELS.error },
]
const MODES = [
    { id: 'auto', label: 'Auto' },
    { id: 'appId', label: 'App ID' },
    { id: 'title', label: 'Title' },
]

const CSS = `
#rin-debug {
    --bg: #0a0a0a;
    --panel: #101010;
    --bar: #161616;
    --line: #2a2a2a;
    --line-soft: #1e1e1e;
    --ink: #f4f4f4;
    --dim: #a3a3a3;
    --faint: #7f7f7f;
    --hover: #e8e8e8;
    --active: #d6d6d6;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    width: 400px;
    max-height: calc(100vh - 32px);
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.7),
        0 2px 8px rgba(0, 0, 0, 0.4);
    font: 12px/1.5 var(--sans);
    font-variant-numeric: tabular-nums;
    text-align: left;
    -webkit-font-smoothing: antialiased;
    animation: rd-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
#rin-debug *,
#rin-debug *::before,
#rin-debug *::after { box-sizing: border-box; }
@keyframes rd-in { from { opacity: 0; transform: translateY(-4px); } }

.rd-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    height: 42px;
    padding: 0 8px 0 14px;
    background: var(--bar);
    border-bottom: 1px solid var(--line);
    cursor: grab;
    user-select: none;
}
.rd-head:active { cursor: grabbing; }
#rin-debug[data-collapsed='true'] .rd-head { border-bottom: 0; }
.rd-lamp { width: 8px; height: 8px; flex: none; border-radius: 2px; background: var(--ink); }
.rd-title {
    font: 600 11px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink);
    white-space: nowrap;
}
.rd-tag {
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
}
.rd-spacer { flex: 1; }
.rd-ibtn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-ibtn:hover { color: var(--ink); background: #1e1e1e; }
.rd-ibtn:active { background: #242424; }
.rd-ibtn:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.55); outline-offset: 1px; }
.rd-collapse svg { transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
#rin-debug[data-collapsed='true'] .rd-collapse svg { transform: rotate(180deg); }

#rin-debug[data-collapsed='true'] { width: 230px; }
#rin-debug[data-collapsed='true'] .rd-body { display: none; }

.rd-body { display: flex; flex-direction: column; min-height: 0; }

.rd-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
.rd-stat { padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 8px; background: var(--panel); }
.rd-stat b { display: block; font: 600 18px/1 var(--mono); letter-spacing: -0.02em; color: var(--ink); }
.rd-stat.is-hot { border-color: var(--line); background: var(--bar); }
.rd-stat.is-hot b::after {
    content: '';
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-left: 6px;
    border-radius: 1px;
    background: var(--ink);
    vertical-align: 3px;
}
.rd-stat span { display: block; margin-top: 6px; font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }

.rd-section { padding: 14px; border-bottom: 1px solid var(--line-soft); }
.rd-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.rd-section-title { font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.rd-app { display: flex; align-items: baseline; gap: 6px; min-width: 0; font: 11px/1.3 var(--mono); }
.rd-app b { flex: none; color: var(--dim); font-weight: 600; }
.rd-app span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); }

.rd-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.rd-modes button {
    padding: 6px 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-modes button:hover { color: var(--ink); }
.rd-modes button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.rd-modes button:disabled { opacity: 0.35; cursor: not-allowed; }
.rd-modes button:disabled:hover { color: var(--faint); }

.rd-run {
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--ink);
    border-radius: 8px;
    background: var(--ink);
    color: var(--bg);
    font: 600 12px/1 var(--sans);
    cursor: pointer;
    transition:
        background 0.12s ease,
        border-color 0.12s ease;
}
.rd-run:hover { background: var(--hover); border-color: var(--hover); }
.rd-run:active { background: var(--active); border-color: var(--active); }
.rd-run:disabled { opacity: 0.4; cursor: not-allowed; }

.rd-result {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--line-soft);
    border-radius: 8px;
    background: var(--panel);
    font: 11px/1.5 var(--mono);
    color: var(--dim);
    word-break: break-word;
}
.rd-result[data-state='ready'] { border-color: #3d3d3d; color: var(--ink); }
.rd-result[data-state='error'] { border-color: var(--line); color: var(--ink); }
.rd-result[data-state='pending'] { color: var(--faint); }

.rd-subacts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }

.rd-logbar { display: flex; align-items: center; gap: 8px; flex: none; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
.rd-label { font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.rd-seg { display: flex; gap: 2px; margin-left: auto; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.rd-seg button {
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-seg button:hover { color: var(--ink); }
.rd-seg button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.rd-copy {
    min-width: 52px;
    padding: 6px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        border-color 0.12s ease;
}
.rd-copy:hover { color: var(--ink); border-color: #3d3d3d; background: #141414; }
.rd-seg button:focus-visible,
.rd-modes button:focus-visible,
.rd-run:focus-visible,
.rd-copy:focus-visible,
.rd-act:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.55); outline-offset: 1px; }

.rd-log {
    flex: 0 1 170px;
    min-height: 96px;
    overflow-y: auto;
    padding: 8px 0;
    font: 11px/1.6 var(--mono);
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
}
.rd-row { display: grid; grid-template-columns: 42px 12px 1fr; gap: 8px; padding: 2px 14px 2px 12px; border-left: 2px solid transparent; }
.rd-row:hover { background: #141414; }
.rd-t { color: var(--faint); text-align: right; }
.rd-lv { font-weight: 700; text-align: center; color: var(--faint); }
.rd-msg { color: var(--dim); word-break: break-word; }
.rd-row[data-level='warn'] { border-left-color: var(--faint); }
.rd-row[data-level='warn'] .rd-lv,
.rd-row[data-level='warn'] .rd-msg { color: var(--ink); }
.rd-row[data-level='error'] { border-left-color: var(--ink); background: rgba(255, 255, 255, 0.03); }
.rd-row[data-level='error'] .rd-lv,
.rd-row[data-level='error'] .rd-msg { color: var(--ink); }
.rd-empty { padding: 12px 14px; color: var(--faint); }

.rd-page { padding: 12px 14px 14px; border-top: 1px solid var(--line-soft); }
.rd-page .rd-section-title { display: block; margin-bottom: 8px; }
.rd-page-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rd-act {
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    font: 600 11px/1.2 var(--sans);
    text-align: left;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        border-color 0.12s ease;
}
.rd-act:hover { color: var(--ink); border-color: #3d3d3d; background: #141414; }
.rd-act:active { background: var(--bar); }
.rd-wide { grid-column: 1 / -1; }

@media (max-width: 480px) {
    #rin-debug { top: 12px; right: 12px; width: calc(100vw - 24px); max-height: calc(100vh - 24px); }
    #rin-debug[data-collapsed='true'] { width: 230px; }
}
@media (prefers-reduced-motion: reduce) {
    #rin-debug { animation: none; }
    .rd-collapse svg { transition: none; }
}
`

const icon = path => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '13')
    svg.setAttribute('height', '13')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.5')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = path
    return svg
}

const copyText = async text => {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch (_) {}
    try {
        const area = mk('textarea', { value: text })
        css(area, { position: 'fixed', top: '0', left: '0', opacity: '0' })
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
    } catch (_) {
        return false
    }
}

const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return
    const style = mk('style', { id: STYLE_ID, textContent: CSS })
    document.head.appendChild(style)
}

const mount = () => {
    if (document.getElementById(PANEL_ID)) return

    const storage = createStorage()
    const saved = (() => {
        try {
            const raw = storage.get(UI_KEY, '')
            const value = typeof raw === 'string' ? JSON.parse(raw) : raw
            return value && typeof value === 'object' ? value : {}
        } catch (_) {
            return {}
        }
    })()
    let mode = MODES.some(entry => entry.id === saved.mode) ? saved.mode : 'auto'

    injectStyles()

    const panel = mk('div')
    panel.id = PANEL_ID
    panel.setAttribute('role', 'region')
    panel.setAttribute('aria-label', 'RINLink debug panel')

    const head = mk('div', { className: 'rd-head' })
    const lamp = mk('span', { className: 'rd-lamp' })
    const title = mk('span', { className: 'rd-title', textContent: 'RINLink' })
    const tag = mk('span', { className: 'rd-tag', textContent: 'debug' })
    const spacer = mk('span', { className: 'rd-spacer' })

    const iconButton = (label, path, extraClass) => {
        const button = mk('button', { type: 'button', className: extraClass ? `rd-ibtn ${extraClass}` : 'rd-ibtn' })
        button.setAttribute('aria-label', label)
        button.title = label
        button.appendChild(icon(path))
        return button
    }

    const collapseBtn = iconButton('Collapse panel', '<path d="M4 6l4 4 4-4"/>', 'rd-collapse')
    const closeBtn = iconButton('Close panel', '<path d="M4 4l8 8M12 4l-8 8"/>')
    head.append(lamp, title, tag, spacer, collapseBtn, closeBtn)

    const body = mk('div', { className: 'rd-body' })

    const stats = mk('div', { className: 'rd-stats' })
    const statCells = {}
    for (const [key, label] of [
        ['resolved', 'resolved'],
        ['inFlight', 'in flight'],
        ['verifyPending', 'verify'],
    ]) {
        const cell = mk('div', { className: 'rd-stat' })
        const value = mk('b', { textContent: '0' })
        cell.append(value, mk('span', { textContent: label }))
        stats.appendChild(cell)
        statCells[key] = { cell, value }
    }

    const searchSection = mk('div', { className: 'rd-section' })
    const searchHead = mk('div', { className: 'rd-section-head' })
    const appLine = mk('div', { className: 'rd-app' })
    const appIdEl = mk('b', { textContent: 'no app' })
    const appNameEl = mk('span', { textContent: '' })
    appLine.append(appIdEl, appNameEl)
    searchHead.append(mk('span', { className: 'rd-section-title', textContent: 'Search' }), appLine)

    const modes = mk('div', { className: 'rd-modes' })
    const modeButtons = MODES.map(entry => {
        const button = mk('button', { type: 'button', textContent: entry.label })
        button.setAttribute('aria-pressed', String(entry.id === mode))
        button.addEventListener('click', () => {
            mode = entry.id
            for (const item of modeButtons) item.button.setAttribute('aria-pressed', String(item.entry.id === mode))
            setResult(null)
            saveUi()
        })
        modes.appendChild(button)
        return { entry, button }
    })

    const runBtn = mk('button', { type: 'button', className: 'rd-run', textContent: 'Run search' })
    const result = mk('div', { className: 'rd-result', hidden: true })
    result.setAttribute('role', 'status')
    result.setAttribute('aria-live', 'polite')
    const subActs = mk('div', { className: 'rd-subacts' })

    searchSection.append(searchHead, modes, runBtn, result, subActs)

    const logbar = mk('div', { className: 'rd-logbar' })
    const segment = mk('div', { className: 'rd-seg' })
    let filter = FILTERS[0]
    const filterButtons = FILTERS.map(entry => {
        const button = mk('button', { type: 'button', textContent: entry.label })
        button.setAttribute('aria-pressed', String(entry === filter))
        button.addEventListener('click', () => {
            filter = entry
            for (const item of filterButtons) item.button.setAttribute('aria-pressed', String(item.entry === filter))
            renderLog(true)
        })
        segment.appendChild(button)
        return { entry, button }
    })

    const copyBtn = mk('button', { type: 'button', className: 'rd-copy', textContent: 'copy' })
    copyBtn.setAttribute('aria-label', 'Copy log to clipboard')
    logbar.append(mk('span', { className: 'rd-label', textContent: 'Log' }), segment, copyBtn)

    const logBox = mk('div', { className: 'rd-log' })
    let stick = true
    logBox.addEventListener('scroll', () => {
        stick = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 10
    })

    const pageSection = mk('div', { className: 'rd-page' })
    const pageActions = mk('div', { className: 'rd-page-actions' })
    pageSection.append(mk('div', { className: 'rd-section-title', textContent: 'Page' }), pageActions)

    const pageButtons = () => [...document.querySelectorAll('[data-rin-btn]')]
    const pageIds = () =>
        pageButtons()
            .map(button => button.dataset.rinAppid)
            .filter(Boolean)

    const appInfo = () => {
        const btn = pageButtons()[0] ?? null
        const appId = btn?.dataset.rinAppid || extractAppId(location.pathname) || null
        const heading = document.querySelector('h1')?.textContent?.trim() || ''
        const pageTitle = document.title
            .split('·')[0]
            .replace(/\s+on Steam$/i, '')
            .trim()
        const appName = btn?.dataset.rinAppname || heading || pageTitle || null
        return { btn, appId, appName }
    }

    let running = false
    const refreshApp = () => {
        const { appId, appName } = appInfo()
        appIdEl.textContent = appId ? `app ${appId}` : 'no app'
        appNameEl.textContent = appName ?? ''
        appNameEl.title = appName ?? ''
        runBtn.disabled = running || (!appId && !appName)
        const appIdMode = modeButtons.find(item => item.entry.id === 'appId')
        if (appIdMode) appIdMode.button.disabled = !appId
    }

    const setResult = (text, state = 'idle') => {
        if (!text) {
            result.hidden = true
            result.textContent = ''
            delete result.dataset.state
            return
        }
        result.hidden = false
        result.dataset.state = state
        result.textContent = text
    }

    const modeLabel = id => MODES.find(entry => entry.id === id)?.label ?? 'Auto'
    const describeResult = (chosen, res) => {
        const label = modeLabel(chosen)
        switch (res.status) {
            case 'ready':
                return `${label} search found a match.`
            case 'notfound':
                if (res.reason === 'appid-mismatch') return `${label} search found a same-name topic, but its post is for a different app.`
                return `${label} search found no matching topic.`
            case 'login':
                return `${label} search found no match as a guest. Some topics may be hidden.`
            case 'verify':
                return `${label} search was blocked. Verification is required.`
            case 'busy':
                return 'A search is already running.'
            case 'error':
                if (res.reason === 'transport') return `${label} search got no clean response.`
                if (res.reason === 'flood') return `${label} search was rate limited.`
                if (res.reason === 'no-appid') return 'No appId detected for an App ID search.'
                return `${label} search failed.`
            default:
                return `${label} search finished with status ${res.status}.`
        }
    }

    const runSearch = async () => {
        const { btn, appId, appName } = appInfo()
        if (!appId && !appName) {
            setResult('No app detected on this page.', 'error')
            return
        }
        if (mode === 'appId' && !appId) {
            setResult('No appId detected for an App ID search.', 'error')
            return
        }
        const chosen = mode
        running = true
        refreshApp()
        runBtn.textContent = 'Searching...'
        setResult(`${modeLabel(chosen)} search running.`, 'pending')
        try {
            const res = await app.search.forceSearch(appId, appName, btn, chosen)
            if (res.status === 'ready') {
                document.querySelectorAll('[data-rin-notfound], [data-rin-login]').forEach(node => node.remove())
                if (btn) {
                    delete btn.dataset.rinNotfoundShown
                    delete btn.dataset.rinLoginShown
                    btn.removeAttribute('data-rin-notfound-btn')
                }
            }
            setResult(describeResult(chosen, res), res.status === 'ready' ? 'ready' : res.status === 'busy' || res.status === 'error' ? 'error' : 'idle')
        } catch (e) {
            setResult(`Search failed: ${e.message}`, 'error')
        } finally {
            running = false
            runBtn.textContent = 'Run search'
            refreshApp()
            render()
        }
    }
    runBtn.addEventListener('click', runSearch)

    const subAction = (label, run) => {
        const button = mk('button', { type: 'button', className: 'rd-act', textContent: label })
        button.addEventListener('click', run)
        subActs.appendChild(button)
    }

    const pageAction = (label, run, wide) => {
        const button = mk('button', { type: 'button', className: wide ? 'rd-act rd-wide' : 'rd-act', textContent: label })
        button.addEventListener('click', run)
        pageActions.appendChild(button)
    }

    let lastEntry = null

    const renderStats = () => {
        const state = app.search.getDebugState()
        for (const [key, cell] of Object.entries(statCells)) {
            const value = state[key] ?? 0
            cell.value.textContent = String(value)
            cell.cell.classList.toggle('is-hot', key !== 'resolved' && value > 0)
        }
    }

    const renderLog = force => {
        const entries = readLogBuffer()
        const last = entries[entries.length - 1] ?? null
        if (!force && last === lastEntry) return
        lastEntry = last

        const rows = entries.filter(entry => (LEVELS[entry.level] ?? 0) >= filter.min).slice(-MAX_ROWS)
        if (!rows.length) {
            const message = filter.id === 'all' ? 'no entries yet' : `no ${filter.id} entries`
            logBox.replaceChildren(mk('div', { className: 'rd-empty', textContent: message }))
            return
        }

        logBox.replaceChildren(
            ...rows.map(entry => {
                const row = mk('div', { className: 'rd-row' })
                row.dataset.level = entry.level
                row.append(
                    mk('span', { className: 'rd-t', textContent: entry.ts }),
                    mk('span', { className: 'rd-lv', textContent: entry.level.charAt(0).toUpperCase() }),
                    mk('span', { className: 'rd-msg', textContent: entry.msg }),
                )
                return row
            }),
        )
        if (stick) logBox.scrollTop = logBox.scrollHeight
    }

    const render = () => {
        renderStats()
        renderLog(true)
        refreshApp()
    }

    subAction('Clear cache', () => {
        const ids = pageIds()
        const { appId } = appInfo()
        if (appId && !ids.includes(appId)) ids.push(appId)
        if (!ids.length) {
            setResult('No app to clear on this page.', 'error')
            return
        }
        app.search.clearCache(ids)
        log.info(`Debug: cache cleared for ${ids.join(', ')}`)
        setResult(`Cache cleared for ${ids.join(', ')}.`)
        render()
    })

    subAction('Force verify', () => {
        const { btn, appId, appName } = appInfo()
        if (!appId) {
            setResult('No appId to verify on this page.', 'error')
            return
        }
        app.search.retry(appId, btn?.dataset.rinAppname || appName, btn, null)
        setResult('Verification started.', 'pending')
        render()
    })

    pageAction('Mark not found', () => {
        const { btn, appId, appName } = appInfo()
        if (!appId) {
            setResult('No appId on this page.', 'error')
            return
        }
        app.search.notFound(appId, btn?.dataset.rinAppname || appName, btn)
        setResult('Marked as not found.')
        render()
    })

    pageAction('Refetch page', () => {
        const ids = pageIds()
        app.search.clearCache(ids)
        for (const button of pageButtons()) button.remove()
        document.querySelectorAll('[data-rin-notfound], [data-rin-login]').forEach(node => node.remove())
        app.search.refetchAll()
        app.router.dispatch()
        log.info('Debug: page refetched')
        setResult('Page refetched.')
        render()
    })

    pageAction(
        'Dump to console',
        () => {
            log.dump()
        },
        true,
    )

    body.append(stats, searchSection, logbar, logBox, pageSection)
    panel.append(head, body)

    let lastX = 0
    let lastY = 0

    const place = (x, y) => {
        const maxX = Math.max(4, window.innerWidth - panel.offsetWidth - 4)
        const maxY = Math.max(4, window.innerHeight - 40)
        lastX = Math.min(Math.max(4, Math.round(x)), maxX)
        lastY = Math.min(Math.max(4, Math.round(y)), maxY)
        panel.style.left = `${lastX}px`
        panel.style.top = `${lastY}px`
        panel.style.right = 'auto'
    }

    const saveUi = () => {
        storage.set(
            UI_KEY,
            JSON.stringify({
                x: lastX,
                y: lastY,
                collapsed: panel.dataset.collapsed === 'true',
                mode,
            }),
        )
    }

    const setCollapsed = collapsed => {
        panel.dataset.collapsed = String(collapsed)
        collapseBtn.setAttribute('aria-expanded', String(!collapsed))
        if (!collapsed) {
            place(lastX, lastY)
            render()
        }
        saveUi()
    }

    document.documentElement.appendChild(panel)
    panel.dataset.collapsed = String(saved.collapsed === true)
    collapseBtn.setAttribute('aria-expanded', String(saved.collapsed !== true))

    lastX = panel.offsetLeft
    lastY = panel.offsetTop
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(saved.x, saved.y)
    render()

    collapseBtn.addEventListener('click', () => setCollapsed(panel.dataset.collapsed !== 'true'))

    closeBtn.addEventListener('click', () => {
        clearInterval(timer)
        panel.remove()
        document.getElementById(STYLE_ID)?.remove()
    })

    panel.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || panel.dataset.collapsed === 'true') return
        event.stopPropagation()
        setCollapsed(true)
    })

    const drag = { on: false, dx: 0, dy: 0 }
    head.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return
        drag.on = true
        drag.dx = event.clientX - panel.offsetLeft
        drag.dy = event.clientY - panel.offsetTop
        head.setPointerCapture(event.pointerId)
        event.preventDefault()
    })
    head.addEventListener('pointermove', event => {
        if (!drag.on) return
        place(event.clientX - drag.dx, event.clientY - drag.dy)
    })
    const endDrag = event => {
        if (!drag.on) return
        drag.on = false
        try {
            head.releasePointerCapture(event.pointerId)
        } catch (_) {}
        saveUi()
    }
    head.addEventListener('pointerup', endDrag)
    head.addEventListener('pointercancel', endDrag)

    window.addEventListener('resize', () => {
        if (!panel.isConnected || !panel.style.left) return
        place(panel.offsetLeft, panel.offsetTop)
    })

    copyBtn.addEventListener('click', async () => {
        const text = readLogBuffer()
            .map(entry => `${entry.ts} ${entry.level.padEnd(5)} ${entry.msg}`)
            .join('\n')
        const ok = await copyText(text || 'RINLink debug log is empty')
        copyBtn.textContent = ok ? 'copied' : 'failed'
        setTimeout(() => (copyBtn.textContent = 'copy'), 1200)
    })

    const timer = setInterval(() => {
        if (!document.documentElement.contains(panel)) {
            clearInterval(timer)
            return
        }
        if (panel.dataset.collapsed === 'true') return
        renderStats()
        renderLog(false)
        refreshApp()
    }, 1000)

    log.info('Debug panel loaded.')
}

if (!location.hostname.includes('cs.rin.ru')) mount()
