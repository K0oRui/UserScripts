import { mk } from '../core/dom.js'
import { log } from '../core/logger.js'

/* The bypass tab is styled like the project site so the step reads as part of
   RINLink, not a raw page on another origin. */

const STYLE_ID = 'rin-bypass-style'

const CSS = `
#rin-bypass-overlay {
    --bg: #0a0a0a;
    --panel: #101010;
    --bar: #161616;
    --line: #2a2a2a;
    --line-soft: #1e1e1e;
    --ink: #f4f4f4;
    --dim: #a3a3a3;
    --faint: #7f7f7f;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
    color: var(--ink);
    font: 14px/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
}
#rin-bypass-overlay *,
#rin-bypass-overlay *::before,
#rin-bypass-overlay *::after { box-sizing: border-box; }

.rb-panel {
    width: min(420px, 100%);
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.7),
        0 2px 8px rgba(0, 0, 0, 0.4);
}
.rb-head {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 16px;
    background: var(--bar);
    border-bottom: 1px solid var(--line);
    font: 600 11px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
}
.rb-mark { width: 8px; height: 8px; flex: none; border-radius: 2px; background: var(--ink); }
.rb-name { color: var(--ink); }
.rb-tag { margin-left: auto; color: var(--faint); }
.rb-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 28px 28px;
    text-align: center;
}
.rb-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--line);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: rin-spin 0.9s linear infinite;
}
.rb-title { font-size: 20px; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
.rb-status { min-height: 21px; max-width: 32ch; font-size: 13px; color: var(--dim); }
.rb-note {
    margin-top: 4px;
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
}
.rb-panel.is-done .rb-spinner {
    position: relative;
    border: 0;
    background: var(--ink);
    animation: none;
}
.rb-panel.is-done .rb-spinner::after {
    content: '';
    position: absolute;
    left: 11px;
    top: 6px;
    width: 8px;
    height: 14px;
    border-right: 2px solid var(--bg);
    border-bottom: 2px solid var(--bg);
    transform: rotate(45deg);
}
.rb-panel.is-error .rb-spinner { display: none; }
.rb-panel.is-error .rb-status {
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bar);
    color: var(--ink);
}
@keyframes rin-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .rb-spinner { animation: none; }
}
`

export function createCsRinOverlay({ storage }) {
    return {
        id: 'CsRinOverlay',
        match: () => location.hostname.includes('cs.rin.ru'),
        run() {
            const triggered = new URLSearchParams(location.search).get('rin-bypass') === '1' || sessionStorage.getItem('rin-bypass') === '1'
            if (!triggered) return
            sessionStorage.setItem('rin-bypass', '1')
            if (document.getElementById('rin-bypass-overlay')) return

            const overlay = mk('div')
            overlay.id = 'rin-bypass-overlay'
            overlay.setAttribute('role', 'status')
            overlay.setAttribute('aria-live', 'polite')
            overlay.setAttribute('aria-busy', 'true')

            const panel = mk('div', { className: 'rb-panel' })
            const head = mk('div', { className: 'rb-head' })
            head.append(
                mk('span', { className: 'rb-mark' }),
                mk('span', { className: 'rb-name', textContent: 'RINLink' }),
                mk('span', { className: 'rb-tag', textContent: 'bypass' }),
            )

            const body = mk('div', { className: 'rb-body' })
            const spinner = mk('div', { className: 'rb-spinner' })
            const title = mk('div', { className: 'rb-title', textContent: 'Verifying access' })
            const status = mk('div', { className: 'rb-status', id: 'rin-status', textContent: 'Waiting for the security check.' })
            const note = mk('div', { className: 'rb-note', textContent: 'This tab closes on its own.' })
            body.append(spinner, title, status, note)
            panel.append(head, body)
            overlay.append(panel)

            const style = mk('style', { id: STYLE_ID, textContent: CSS })
            document.head.append(style)
            document.documentElement.append(overlay)

            const isReady = () => {
                const hasMarkers = document.querySelector('#wrapheader, #menubar, #wrapcentre')
                const hasCookies = !!document.cookie.match(/(?:^|;\s*)securitytoken=/) && !!document.cookie.match(/(?:^|;\s*)securitytoken_expiration=/)
                return !!(hasMarkers || hasCookies)
            }

            let finished = false
            const stop = () => {
                finished = true
                clearInterval(poll)
                clearInterval(markerPoll)
            }
            const dismiss = () => {
                sessionStorage.removeItem('rin-bypass')
                overlay.remove()
                style.remove()
            }
            const finish = () => {
                if (finished) return
                stop()
                storage.set('rin:cleared', String(Date.now()))
                overlay.setAttribute('aria-busy', 'false')
                panel.classList.add('is-done')
                title.textContent = 'Access verified'
                status.textContent = 'Closing this tab.'
                try {
                    window.close()
                } catch (_) {}
                setTimeout(dismiss, 700)
            }
            const fail = message => {
                stop()
                overlay.setAttribute('aria-busy', 'false')
                panel.classList.add('is-error')
                title.textContent = 'Verification failed'
                status.textContent = !message || /verification failed/i.test(message) ? 'The security check did not complete. Reload and try again.' : message
                setTimeout(dismiss, 4000)
            }

            const markerPoll = setInterval(() => {
                if (isReady()) finish()
            }, 400)
            const poll = setInterval(() => {
                try {
                    const st = storage.get('rin:status', null)
                    if (!st) return
                    const j = typeof st === 'string' ? JSON.parse(st) : st
                    if (j.message && !j.done) status.textContent = j.message
                    if (j.done) {
                        if (j.ok) finish()
                        else fail(j.message)
                    }
                } catch (_) {}
            }, 300)
            log.info('Bypass overlay active')
        },
    }
}
