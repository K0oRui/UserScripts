import { log } from './logger.js'
import { parseTopics } from './parsing.js'

export function detectBlocked(status, body, signals) {
    const text = body ?? ''
    if (status === 403 || status === 401) return true
    if (signals.some(s => text.toLowerCase().includes(s.toLowerCase()))) return true
    if (!text.includes('pagecontent') && !text.includes('wrapcentre')) return true
    return false
}

const RE_LOGIN_REQUIRED = /(?:must|need to|have to) (?:be )?log(?:ged)? ?in|only registered users|log(?:ged)? ?in to (?:search|view|access)/i

export function detectGuest(body) {
    const text = body ?? ''
    if (!text) return false
    if (RE_LOGIN_REQUIRED.test(text)) return true
    return /ucp\.php\?mode=login/i.test(text) && !/ucp\.php\?mode=logout/i.test(text)
}

export function createXhr(cfg) {
    let _active = 0
    const _queue = []

    const request = (url, callback) => {
        if (_active >= cfg.XHR_CONCURRENCY) {
            _queue.push({ url, callback })
            return
        }
        _active++
        const done = (blocked, topics, raw, transport = false, guest = false) => {
            _active--
            if (_queue.length) {
                const n = _queue.shift()
                request(n.url, n.callback)
            }
            callback(blocked, topics, raw, transport, guest)
        }

        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                withCredentials: true,
                timeout: cfg.XHR_TIMEOUT_MS,
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': navigator.language || 'en-US,en;q=0.5',
                    Referer: cfg.BASE_URL,
                    DNT: '1',
                    'Sec-GPC': '1',
                },
                ontimeout() {
                    log.warn('XHR timeout')
                    done(false, [], '', true)
                },
                onabort() {
                    done(false, [], '', true)
                },
                onload(r) {
                    const raw = r.responseText ?? ''
                    try {
                        const guest = detectGuest(raw)
                        if (detectBlocked(r.status, raw, cfg.BLOCK_SIGNALS)) {
                            done(true, [], raw, false, guest)
                            return
                        }
                        done(false, parseTopics(raw), raw, false, guest)
                    } catch (e) {
                        log.error('Parse error:', e)
                        done(false, [], raw)
                    }
                },
                onerror() {
                    log.warn('Network error')
                    done(false, [], '', true)
                },
            })
        } catch (e) {
            log.error('GM_xmlhttpRequest error:', e)
            done(false, [], '', true)
        }
    }

    return { request }
}
