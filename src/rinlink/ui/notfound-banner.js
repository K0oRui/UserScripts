import { CFG } from '../config.js'
import { css, mk } from '../core/dom.js'
import { icon } from '../core/icons.js'
import { log } from '../core/logger.js'
import { sanitiseKw } from '../utils.js'
import { btnReset } from './button-states.js'

function steamBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
        display: 'inline-block',
        padding: '2px 15px',
        marginRight: '6px',
        verticalAlign: 'top',
        background: 'linear-gradient(135deg,rgba(26,42,58,.95),rgba(22,32,45,.95))',
        border: 'none',
        borderRadius: '2px',
        fontSize: '12px',
        color: '#8ba3b8',
        lineHeight: '28px',
        cursor: 'default',
        fontFamily: '"Motiva Sans",Arial,sans-serif',
        whiteSpace: 'nowrap',
    })
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, 'Create one', 'Search manually', 'color:#4ab3f4;text-decoration:none;border-bottom:1px solid rgba(74,179,244,.4)')}`
    btn.insertAdjacentElement('beforebegin', banner)
}

function steamdbBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
        display: 'block',
        width: '100%',
        padding: '6px 10px',
        boxSizing: 'border-box',
        background: '#273b4b',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#8ba3b8',
        lineHeight: '1.5',
        fontFamily: 'Inter,system-ui,sans-serif',
    })
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, 'Create one', 'Search manually', 'color:#67c1f5;text-decoration:none')}`
    btn.insertAdjacentElement('beforebegin', banner)
}

function pcgamingwikiBanner(banner, btn, { createUrl, searchUrl }) {
    const row = btn.closest('tr')
    if (!row) {
        btn.insertAdjacentElement('afterend', banner)
        return
    }
    css(banner, {
        padding: '5px 8px',
        borderLeft: '3px solid #3366cc',
        background: 'rgba(51,102,204,0.06)',
        fontSize: '12px',
        lineHeight: '1.5',
    })
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, 'Create one', 'Search manually')}`
    const td = mk('td', { colSpan: 2 })
    css(td, { padding: '4px 6px' })
    td.appendChild(banner)
    const newRow = mk('tr')
    newRow.appendChild(td)
    row.insertAdjacentElement('afterend', newRow)
}

function genericBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        marginTop: '6px',
        borderRadius: '6px',
        background: 'rgba(234,179,8,.1)',
        border: '1px solid rgba(234,179,8,.3)',
        fontSize: '12px',
        color: '#eab308',
        lineHeight: '1.4',
    })
    const ico = mk('span')
    ico.appendChild(icon('alertTriangle', 13, '#eab308'))
    css(ico, { display: 'flex', alignItems: 'center', flexShrink: '0' })
    const text = mk('span')
    text.innerHTML = `No CS.RIN.RU topic. <a href="${createUrl}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">Create one</a> or <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">search</a>.`
    banner.appendChild(ico)
    banner.appendChild(text)
    btn.insertAdjacentElement('beforebegin', banner)
}

const BANNERS = [
    { site: 'store.steampowered.com', render: steamBanner },
    { site: 'steamdb.info', render: steamdbBanner },
    { site: 'pcgamingwiki.com', render: pcgamingwikiBanner },
    { site: null, render: genericBanner },
]

function linksHtml(urls, createLabel, searchLabel, linkStyle) {
    const style = linkStyle ? ` style="${linkStyle}"` : ''
    return `<a href="${urls.createUrl}" target="_blank" rel="noopener noreferrer"${style}>${createLabel}</a> &middot; <a href="${urls.searchUrl}" target="_blank" rel="noopener noreferrer"${style}>${searchLabel}</a>`
}

export function showLoginBanner(btn, onRetry) {
    if (!btn || btn.dataset.rinLoginShown) return
    btn.dataset.rinLoginShown = 'true'

    const banner = mk('div')
    banner.setAttribute('data-rin-login', 'true')
    css(banner, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        marginTop: '6px',
        borderRadius: '6px',
        background: 'rgba(234,179,8,.1)',
        border: '1px solid rgba(234,179,8,.3)',
        fontSize: '12px',
        color: '#eab308',
        lineHeight: '1.4',
    })

    const ico = mk('span')
    ico.appendChild(icon('logIn', 13, '#eab308'))
    css(ico, { display: 'flex', alignItems: 'center', flexShrink: '0' })

    const text = mk('span')
    text.innerHTML = `No topic found. Guest search hides some topics. <a href="${CFG.LOGIN_URL}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">Log in</a> to CS.RIN.RU, then <a href="#" data-rin-retry style="color:#eab308;font-weight:600;text-decoration:underline">retry</a>.`

    banner.appendChild(ico)
    banner.appendChild(text)
    btn.insertAdjacentElement('beforebegin', banner)

    text.querySelector('[data-rin-retry]')?.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        banner.remove()
        btnReset(btn)
        onRetry?.(btn)
    })
}

export function showNotFoundBanner(btn, appName, appId, onRefetch) {
    if (btn?.dataset?.rinNotfoundShown) return
    if (btn) btn.dataset.rinNotfoundShown = 'true'

    const host = location.hostname
    const effName = appName && sanitiseKw(appName) ? appName : null
    const searchUrl = effName
        ? `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(sanitiseKw(effName))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=all&sk=r&sd=d`
        : CFG.BASE_URL
    const urls = { createUrl: CFG.CREATE_URL, searchUrl }

    const banner = mk('div')
    banner.setAttribute('data-rin-notfound', 'true')

    const def = BANNERS.find(b => b.site === null || host.includes(b.site))
    def.render(banner, btn, urls)

    if (appId && onRefetch) {
        btn.setAttribute('data-rin-notfound-btn', 'true')
        btn.title = 'No topic found — click to re-check'
        btn.setAttribute('data-tooltip-text', 'No topic found — click to re-check')
        btn.addEventListener(
            'click',
            e => {
                if (!btn.dataset.rinNotfoundShown) return
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                e.stopPropagation()
                log.info(`Refetch: appId ${appId}`)
                document.querySelectorAll('[data-rin-notfound]').forEach(el => el.remove())
                btn.removeAttribute('data-rin-notfound-btn')
                delete btn.dataset.rinNotfoundShown
                if (btn.dataset.rinOriginalHtml) {
                    btn.innerHTML = btn.dataset.rinOriginalHtml
                    delete btn.dataset.rinOriginalHtml
                }
                btn.title = CFG.LABEL
                btn.setAttribute('data-tooltip-text', CFG.LABEL)
                btn.target = '_blank'
                btn.rel = 'noopener noreferrer'
                css(btn, { opacity: '1', pointerEvents: 'auto', cursor: 'pointer' })
                onRefetch(appId, btn)
            },
            { once: true },
        )
    }
}
