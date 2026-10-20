import { CFG } from '../config.js'
import { css, mk } from '../core/dom.js'
import { icon } from '../core/icons.js'
import { log } from '../core/logger.js'

export function createButton(opts = {}) {
    const btn = mk('a', { href: '#', target: '_blank', rel: 'noopener noreferrer' })
    if (opts.iconOnly) {
        const img = mk('img', { src: CFG.IMAGE, alt: opts.label || CFG.LABEL, width: 24, height: 24 })
        css(img, { display: 'block', width: '24px', height: '24px' })
        btn.appendChild(img)
    } else {
        btn.appendChild(mk('span', { textContent: opts.label || CFG.LABEL }))
    }
    css(btn, { display: 'inline-flex', alignItems: 'center', gap: '6px', ...opts.style })
    if (opts.className) btn.className = opts.className
    if (opts.iconOnly) btn.dataset.rinIconOnly = 'true'
    btn.dataset.rinBtn = 'true'
    return btn
}

export function btnSetPending(btn) {
    btn.setAttribute('data-rin-pending', 'true')
    css(btn, { opacity: '0.45', pointerEvents: 'none', cursor: 'wait', transition: 'opacity .3s' })
}

export function btnSetReady(btn) {
    btn.removeAttribute('data-rin-pending')
    delete btn.dataset.rinFailed
    if (btn.dataset.rinOriginalHtml) {
        btn.innerHTML = btn.dataset.rinOriginalHtml
        delete btn.dataset.rinOriginalHtml
    }
    btn.target = '_blank'
    btn.rel = 'noopener noreferrer'
    btn.title = CFG.LABEL
    btn.setAttribute('data-tooltip-text', CFG.LABEL)
    css(btn, { opacity: '1', pointerEvents: 'auto', cursor: 'pointer', transition: 'opacity .3s' })
}

function btnSwapContent(btn, iconName, label) {
    if (!btn.dataset.rinOriginalHtml) btn.dataset.rinOriginalHtml = btn.innerHTML
    setBtnContent(btn, iconName, label, btn.dataset.rinIconOnly ? 24 : 16, btn.dataset.rinIconOnly ? 0 : 6)
}

function setBtnContent(btn, iconName, label, size, marginRight) {
    btn.innerHTML = ''
    const ico = icon(iconName, size, 'currentColor')
    if (btn.dataset.rinIconOnly || !label) {
        btn.appendChild(ico)
        return
    }
    css(ico, { verticalAlign: 'middle', marginRight: `${marginRight}px` })
    const wrap = mk('span')
    wrap.appendChild(ico)
    wrap.appendChild(document.createTextNode(label))
    btn.appendChild(wrap)
}

export function btnSetNotFound(btn) {
    btn.removeAttribute('data-rin-pending')
    /* Keep a miss from carrying the previous match's URL, which points at a topic
       the last search rejected. */
    btn.href = '#'
    btn.target = '_blank'
    btn.rel = 'noopener noreferrer'
    btnSwapContent(btn, 'refreshCw', 'Refetch')
    css(btn, { opacity: '0.7', pointerEvents: 'auto', cursor: 'pointer', transition: 'opacity .3s' })
}

export function btnSetLogin(btn) {
    if (!btn) return
    btn.removeAttribute('data-rin-pending')
    btn.href = CFG.LOGIN_URL
    btn.target = '_blank'
    btn.rel = 'noopener noreferrer'
    btnSwapContent(btn, 'logIn', 'Log in')
    btn.title = 'Sign in to CS.RIN.RU to search'
    btn.setAttribute('data-tooltip-text', btn.title)
    css(btn, { opacity: '0.85', pointerEvents: 'auto', cursor: 'pointer', transition: 'opacity .3s' })
}

export function btnReset(btn) {
    if (!btn) return
    if (btn.dataset.rinOriginalHtml) {
        btn.innerHTML = btn.dataset.rinOriginalHtml
        delete btn.dataset.rinOriginalHtml
    }
    delete btn.dataset.rinLoginShown
    btn.removeAttribute('data-rin-pending')
    btn.href = '#'
    btn.title = CFG.LABEL
    btn.setAttribute('data-tooltip-text', CFG.LABEL)
    css(btn, { opacity: '1', pointerEvents: 'auto', cursor: 'pointer' })
}

export function showVerifyButton(btn, onVerify, iconOnly) {
    if (!btn) return
    const origHref = btn.href
    const origTitle = btn.title
    const origHTML = btn.dataset.rinOriginalHtml || btn.innerHTML
    const origTooltipAttr = btn.getAttribute('data-tooltip-text')
    const origTarget = btn.target

    btn.removeAttribute('data-rin-pending')
    btn.href = '#'
    btn.removeAttribute('target')
    btn.title = 'Verify access on CS.RIN.RU'
    btn.setAttribute('data-tooltip-text', 'Verify access on CS.RIN.RU')
    setBtnContent(btn, 'shieldCheck', 'Verify', iconOnly ? 24 : 14, 4)
    css(btn, { opacity: '0.7', pointerEvents: 'auto', cursor: 'pointer', transition: 'opacity .3s' })

    const verifying = () => {
        setBtnContent(btn, 'lock', iconOnly ? '' : 'Verifying...', iconOnly ? 24 : 14, 4)
        css(btn, { opacity: '0.45', pointerEvents: 'none', cursor: 'wait' })
    }

    btn.addEventListener(
        'click',
        e => {
            e.preventDefault()
            e.stopPropagation()
            log.info(`Verify: appId ${btn.dataset.rinAppid ?? '?'}`)
            verifying()
            btn.dataset.rinOriginalHtml = origHTML
            btn.href = origHref || '#'
            btn.title = origTitle
            if (origTooltipAttr) btn.setAttribute('data-tooltip-text', origTooltipAttr)
            if (origTarget) btn.target = origTarget
            onVerify()
        },
        { once: true },
    )

    log.info('Verify mode')
}
