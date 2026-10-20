import { log } from './logger.js'

const MAX_ATTEMPTS = 2

export function createBypass({ storage, cfg, openTab, xhr }) {
    const runBypass = (url, callback) => {
        let attempts = 0

        const attempt = () => {
            if (attempts >= MAX_ATTEMPTS) {
                log.warn('Bypass attempts exhausted — giving up.')
                callback([], false, false)
                return
            }
            attempts++
            const LOCK_TTL = 90_000
            const JITTER_MS = Math.floor(Math.random() * 600)

            setTimeout(() => {
                const lock = parseInt(storage.get('rin:bypass_lock', '0'), 10)
                const age = Date.now() - lock

                if (lock && age < LOCK_TTL) {
                    log.info(`Bypass lock held by another tab (${Math.round(age / 1000)}s) — waiting...`)
                    const waitStart = Date.now()
                    const waiter = setInterval(() => {
                        const nowLock = parseInt(storage.get('rin:bypass_lock', '0'), 10)
                        const lockReleased = !nowLock || Date.now() - nowLock >= LOCK_TTL
                        const waitedTooLong = Date.now() - waitStart >= LOCK_TTL

                        if (!lockReleased && !waitedTooLong) return
                        clearInterval(waiter)
                        log.info(lockReleased ? 'Bypass lock released — retrying XHR.' : 'Gave up waiting — retrying XHR anyway.')
                        xhr.request(url, (blocked, topics, _raw, _transport, guest) => {
                            if (!blocked) {
                                callback(topics, true, guest)
                                return
                            }
                            log.info('Still blocked after waiting — opening our own bypass tab.')
                            attempt()
                        })
                    }, cfg.BYPASS_POLL_MS)
                    return
                }

                storage.set('rin:bypass_lock', String(Date.now()))
                log.info('Opening bypass tab (lock claimed)...')
                const tab = openTab(cfg.BASE_URL + '?rin-bypass=1', { active: false, insert: true })

                const releaseLock = () => storage.set('rin:bypass_lock', '0')
                const sendStatus = (msg, done = false, ok = true) => {
                    try {
                        storage.set('rin:status', JSON.stringify({ message: msg, done, ok, t: Date.now() }))
                    } catch (_) {}
                }

                if (!tab) {
                    releaseLock()
                    log.warn('GM_openInTab failed.')
                    callback([], false, false)
                    return
                }

                sendStatus('Waiting for security check...')

                let done = false
                const started = Date.now()
                let polls = 0

                const finish = (ok, topics, guest = false) => {
                    if (done) return
                    done = true
                    clearInterval(poll)
                    releaseLock()
                    if (ok) {
                        log.info(`Bypass OK: ${((Date.now() - started) / 1000).toFixed(1)}s, ${topics.length} result(s)`)
                        sendStatus('Access verified — closing tab.', true, true)
                        setTimeout(() => {
                            try {
                                tab.close()
                            } catch (_) {}
                        }, 1000)
                        callback(topics, true, guest)
                    } else {
                        sendStatus('Verification failed.', true, false)
                        callback([], false, false)
                    }
                }

                const poll = setInterval(() => {
                    if (done) return

                    if (tab.closed) {
                        done = true
                        clearInterval(poll)
                        releaseLock()
                        log.warn('Bypass tab closed')
                        callback([], false, false)
                        return
                    }

                    if (Date.now() - started >= cfg.BYPASS_TIMEOUT) {
                        done = true
                        clearInterval(poll)
                        releaseLock()
                        sendStatus('Timed out.', true, false)
                        setTimeout(() => {
                            try {
                                tab.close()
                            } catch (_) {}
                        }, 3000)
                        log.warn('Bypass timed out')
                        callback([], false, false)
                        return
                    }

                    const clearedRaw = storage.get('rin:cleared', '')
                    const clearedTs = parseInt(clearedRaw, 10)
                    const cleared = clearedRaw && !Number.isNaN(clearedTs) && clearedTs >= started
                    polls++

                    if (!cleared && polls % 3 !== 0) return

                    xhr.request(url, (stillBlocked, topics, _raw, transport, guest) => {
                        if (done) return
                        if (transport) return
                        if (stillBlocked && !cleared) return
                        if (!stillBlocked) {
                            finish(true, topics, guest)
                        } else {
                            xhr.request(url, (b2, t2, _raw2, transport2, guest2) => {
                                if (transport2) return
                                if (!b2) finish(true, t2, guest2)
                                else {
                                    finish(false, [])
                                    log.warn('Still blocked after bypass')
                                }
                            })
                        }
                    })
                }, cfg.BYPASS_POLL_MS)
            }, JITTER_MS)
        }

        attempt()
    }

    return { run: runBypass }
}
