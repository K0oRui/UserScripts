import { parseDlcRows, formatDlcGoldberg, formatDlcStar } from './dlc.js'
import { parseLangRows, formatLangGoldberg, formatLangStar } from './langs.js'
import { parseAchievementRows, formatAchievementsGoldberg, formatAchievementsStar } from './achievements.js'
import { askTarget, askOutput } from './popup.js'
import { fileName, downloadText } from './output.js'
import { ensureStyles } from './styles.js'

const DLC_BUTTON_ID = 'steamdb-emu-tools-dlc-btn'
const LANG_BUTTON_ID = 'steamdb-emu-tools-lang-btn'
const ACH_BUTTON_ID = 'steamdb-emu-tools-ach-btn'

const copyText = async text => {
    try {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text)
            return true
        }
    } catch {}
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {}
    try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
    } catch {
        return false
    }
}

const COPY_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-copy" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>'

const makeButton = (id, label) => {
    const btn = document.createElement('button')
    btn.id = id
    btn.type = 'button'
    btn.className = 'btn btn-outline steamdb-emu-tools-btn'
    btn.innerHTML = `${COPY_ICON}<span class="steamdb-emu-tools-btn-label"></span>`
    btn.querySelector('.steamdb-emu-tools-btn-label').textContent = label
    return btn
}

const flash = (btn, text, revert) => {
    const label = btn.querySelector('.steamdb-emu-tools-btn-label')
    if (label) label.textContent = text
    else btn.textContent = text
    setTimeout(() => {
        if (label) label.textContent = revert
        else btn.textContent = revert
    }, 2000)
}

const mountDlcButton = () => {
    if (document.getElementById(DLC_BUTTON_ID)) return
    const heading = document.querySelector('#dlc h2')
    const table = document.querySelector('#dlc table')
    if (!heading || !table) return

    const btn = makeButton(DLC_BUTTON_ID, 'Copy DLC list')

    btn.addEventListener('click', async () => {
        const entries = parseDlcRows(document)
        if (entries.length === 0) {
            flash(btn, 'No DLC rows found', 'Copy DLC list')
            return
        }
        const target = await askTarget('Copy DLC list')
        if (!target) return
        const text = target === 'star' ? formatDlcStar(entries) : formatDlcGoldberg(entries)
        const ok = await copyText(text)
        flash(btn, ok ? `Copied ${entries.length} lines (${target})` : 'Copy failed', 'Copy DLC list')
    })

    heading.classList.add('steamdb-emu-tools-heading')
    heading.appendChild(btn)
}

const mountLangButton = () => {
    if (document.getElementById(LANG_BUTTON_ID)) return
    const heading = Array.from(document.querySelectorAll('h2')).find(h => /supported languages/i.test(h.textContent || ''))
    if (!heading) return
    let table = heading.nextElementSibling
    while (table && table.tagName !== 'TABLE') table = table.nextElementSibling
    if (!table) return

    const btn = makeButton(LANG_BUTTON_ID, 'Copy languages')

    btn.addEventListener('click', async () => {
        const langs = parseLangRows(document)
        if (langs.length === 0) {
            flash(btn, 'No languages found', 'Copy languages')
            return
        }
        const target = await askTarget('Copy languages')
        if (!target) return
        const output = await askOutput('Copy languages')
        if (!output) return
        const text = target === 'star' ? formatLangStar(langs) : formatLangGoldberg(langs)
        if (output === 'file') {
            const name = fileName('languages', target)
            const ok = downloadText(name, text, 'text/plain')
            flash(btn, ok ? `Saved ${name}` : 'Download failed', 'Copy languages')
            return
        }
        const ok = await copyText(text)
        flash(btn, ok ? `Copied ${langs.length} lines (${target})` : 'Copy failed', 'Copy languages')
    })

    heading.classList.add('steamdb-emu-tools-heading')
    heading.appendChild(btn)
}

const mountAchievementsButton = () => {
    if (document.getElementById(ACH_BUTTON_ID)) return
    const container = document.querySelector('#js-achievements')
    if (!container) return
    const heading = container.querySelector('h2') || container.previousElementSibling?.querySelector?.('h2') || container.parentElement?.querySelector?.('h2')
    if (!heading) return

    const btn = makeButton(ACH_BUTTON_ID, 'Copy achievements')

    btn.addEventListener('click', async () => {
        const entries = parseAchievementRows(document)
        if (entries.length === 0) {
            flash(btn, 'No achievements found', 'Copy achievements')
            return
        }
        const target = await askTarget('Copy achievements')
        if (!target) return
        const output = await askOutput('Copy achievements')
        if (!output) return
        const text = target === 'star' ? formatAchievementsStar(entries) : formatAchievementsGoldberg(entries)
        if (output === 'file') {
            const name = fileName('achievements', target)
            const ok = downloadText(name, text, 'application/json')
            flash(btn, ok ? `Saved ${name}` : 'Download failed', 'Copy achievements')
            return
        }
        const ok = await copyText(text)
        flash(btn, ok ? `Copied ${entries.length} achievements (${target})` : 'Copy failed', 'Copy achievements')
    })

    const header = heading.closest('.achievements-header')
    const group = header?.querySelector(':scope > div')
    if (group) {
        group.appendChild(btn)
    } else {
        heading.classList.add('steamdb-emu-tools-heading')
        heading.appendChild(btn)
    }
}

let achObserver = null

const watchAchievements = () => {
    const container = document.querySelector('#js-achievements')
    if (!container || achObserver) return
    achObserver = new MutationObserver(() => mountAchievementsButton())
    achObserver.observe(container, { childList: true, subtree: true })
}

const mountAll = () => {
    ensureStyles()
    mountDlcButton()
    mountLangButton()
    mountAchievementsButton()
    watchAchievements()
}

const hasTarget = () =>
    Boolean(
        document.querySelector('#dlc') ||
        document.querySelector('#js-achievements') ||
        Array.from(document.querySelectorAll('h2')).some(h => /supported languages/i.test(h.textContent || '')),
    )

if (hasTarget()) {
    mountAll()
} else {
    const observer = new MutationObserver(() => {
        if (hasTarget()) {
            mountAll()
            observer.disconnect()
        }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 10_000)
}
