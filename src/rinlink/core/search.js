import { log } from './logger.js'
import { buildSearchUrl, buildTitleUrl, resolveTopicUrl } from '../utils.js'
import { pickBestTopic, scoreTopic } from './scoring.js'
import { getTopicText, normalise, sigWords } from './normalise.js'

const NOT_FOUND = 'NOT_FOUND'

const MAX_FLOOD_RETRIES = 3

const RE_SEARCH_UNAVAILABLE = /cannot make another search|try again in \d+ seconds?|search is currently unavailable/i

const buildSearches = (appId, appName) => [
    { url: buildSearchUrl(appId), appIdSearch: true },
    { url: buildTitleUrl(appName || appId), appIdSearch: false },
]

const _pageSnippet = raw => {
    const txt = (raw ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return txt.slice(0, 120)
}

const _emptyNote = raw => {
    const txt = raw ?? ''
    const markers = `pagecontent=${txt.includes('pagecontent') ? 'y' : 'n'},wrapcentre=${txt.includes('wrapcentre') ? 'y' : 'n'}`
    return `0 results (len=${txt.length},${markers},${_pageSnippet(raw)})`
}

/* One-word names are weak matches: many games share a name like "Drift". Confirm
   the candidate topic carries the app id in its Steam header image first. */
const _topicHasAppId = (raw, appId) => {
    if (!raw || !appId) return false
    const start = raw.indexOf('postbody')
    const scope = start >= 0 ? raw.slice(start, start + 40000) : raw
    const id = String(appId)
    return scope.includes(`/apps/${id}/`) || scope.includes(`/app/${id}`)
}

const _isSingleWordName = name => sigWords(normalise(name ?? '')).length === 1

const _needsTopicCheck = (appId, appName, topic) => {
    if (!appId || !topic || !_isSingleWordName(appName)) return false
    return scoreTopic(getTopicText(topic), appName) < 100
}

export function createSearchService({ cache, xhr, bypass, cfg, ui }) {
    const _resolvedUrls = new Map()
    const _inFlight = new Map()
    const _verifyPending = new Set()
    const _generation = new Map()

    const _cacheable = appId => appId !== null && appId !== undefined

    const _showVerify = (btn, onVerify) => {
        ui.showVerify(btn, onVerify, location.hostname.includes('pcgamingwiki.com'))
    }

    const _settle = (waiters, result) => {
        for (const w of waiters) if (w.resolve) w.resolve(result)
    }

    const _cancel = appId => {
        _generation.set(appId, (_generation.get(appId) ?? 0) + 1)
        const waiters = _inFlight.get(appId)
        if (!waiters) return
        _inFlight.delete(appId)
        _settle(waiters, { status: 'cancelled' })
    }

    const _refetch = (appId, btn, appName) => {
        cache.clear(appId)
        _resolvedUrls.delete(appId)
        _cancel(appId)
        _verifyPending.delete(appId)
        searchFor(appId, btn?.dataset?.rinAppname || appName, btn, null)
    }

    const _finish = (appId, appName, topic) => {
        log.info(`Finish: appId ${appId}`)
        const url = resolveTopicUrl(topic.getAttribute('href') || topic.href)
        const tags = ui.extractTags(topic)
        const entry = { exists: true, url, tags, ts: Date.now() }
        if (_cacheable(appId)) {
            cache.set(appId, entry)
            _resolvedUrls.set(appId, { url, tags })
        }

        const waiters = _inFlight.get(appId) ?? []
        _inFlight.delete(appId)
        _verifyPending.delete(appId)

        const result = { status: 'ready', url, tags }
        _settle(waiters, result)
        for (const w of waiters) {
            if (!w.btn) continue
            w.btn.href = url
            ui.setReady(w.btn)
            if (w.titleEl) ui.appendTags(tags, w.titleEl)
        }
        log.info(`  ✓ ${url}`)
    }

    const _diagnosticStop = (appId, status, reason = null) => {
        const waiters = _inFlight.get(appId) ?? []
        _inFlight.delete(appId)
        _verifyPending.delete(appId)
        _settle(waiters, reason ? { status, reason } : { status })
    }

    const _notFound = (appId, appName, btn) => {
        log.info(`Not found: appId ${appId}`)
        if (_cacheable(appId)) {
            cache.set(appId, { exists: false, ts: Date.now() })
            _resolvedUrls.set(appId, NOT_FOUND)
        }

        const waiters = _inFlight.get(appId) ?? []
        _inFlight.delete(appId)
        _verifyPending.delete(appId)

        const onRefetch = (_appId, b) => _refetch(appId, b, appName)

        _settle(waiters, { status: 'notfound' })

        const seen = new Set()
        for (const w of waiters) {
            if (!w.btn || seen.has(w.btn)) continue
            seen.add(w.btn)
            ui.setNotFound(w.btn)
            ui.showNotFoundBanner(w.btn, appName, appId, onRefetch)
        }
        if (btn && !seen.has(btn)) {
            ui.setNotFound(btn)
            ui.showNotFoundBanner(btn, appName, appId, onRefetch)
        }
    }

    const _loginRequired = (appId, appName, btn) => {
        log.info(`Login required: appId ${appId}`)
        if (_cacheable(appId)) {
            cache.clear(appId)
            _resolvedUrls.delete(appId)
        }

        const waiters = _inFlight.get(appId) ?? []
        _inFlight.delete(appId)
        _verifyPending.delete(appId)

        _settle(waiters, { status: 'login' })

        const onRetry = b => _refetch(appId, b, appName)
        const seen = new Set()
        for (const w of waiters) {
            if (!w.btn || seen.has(w.btn)) continue
            seen.add(w.btn)
            ui.setLoginRequired(w.btn)
            ui.showLoginBanner(w.btn, onRetry)
        }
        if (btn && !seen.has(btn)) {
            ui.setLoginRequired(btn)
            ui.showLoginBanner(btn, onRetry)
        }
    }

    const _applyCached = (cacheEntry, btn, appName, appId, titleEl) => {
        if (btn) {
            btn.dataset.rinAppid = appId
            if (appName) btn.dataset.rinAppname = appName
        }

        if (cacheEntry.exists) {
            if (btn) {
                btn.href = cacheEntry.url
                ui.setReady(btn)
            }
            if (titleEl && cacheEntry.tags) ui.appendTags(cacheEntry.tags, titleEl)
            return { status: 'ready', url: cacheEntry.url, tags: cacheEntry.tags }
        }

        if (btn) {
            ui.setNotFound(btn)
            ui.showNotFoundBanner(btn, appName, appId, () => _refetch(appId, btn, appName))
        }
        return { status: 'notfound' }
    }

    const _search = (appId, appName, { viaBypass, primaryBtn, force = null, diagnostic = false }) => {
        const label = force ? `Force ${force}` : viaBypass ? 'Retry' : 'Search'
        log.info(`${label}: appId ${appId}${appName ? ` "${appName}"` : ''}`)
        const [appIdSearch, titleSearch] = buildSearches(appId, appName)
        const generation = (_generation.get(appId) ?? 0) + 1
        _generation.set(appId, generation)
        let done = false
        let sawGuest = false

        const settle = fn => {
            if (done) return
            done = true
            if ((_generation.get(appId) ?? 0) !== generation) return
            fn()
        }

        const onBlocked = (reason = 'Blocked, verify needed') => {
            settle(() => {
                if (diagnostic) {
                    _diagnosticStop(appId, 'verify', 'blocked')
                    log.warn(reason)
                    return
                }
                _verifyPending.add(appId)
                const waiters = _inFlight.get(appId) ?? []
                _inFlight.delete(appId)
                _settle(waiters, { status: 'verify' })
                for (const w of waiters) {
                    if (w.btn) _showVerify(w.btn, () => retry(appId, appName, w.btn, w.titleEl))
                }
                log.warn(reason)
            })
        }

        if (viaBypass) {
            log.info(`  → (via bypass) ${appIdSearch.url}`)
            bypass.run(appIdSearch.url, (topics, ok, guest) => {
                if (done) return
                if (guest) sawGuest = true
                const best = topics.length ? pickBestTopic(topics, appName, appIdSearch.appIdSearch) : null
                if (best) {
                    settle(() => _finish(appId, appName, best))
                    return
                }
                if (ok === false) {
                    onBlocked('Bypass failed, verify needed')
                    return
                }
                settle(() => (sawGuest ? _loginRequired(appId, appName, primaryBtn) : _notFound(appId, appName, null)))
            })
            return
        }

        const checkTopic = (topic, cb) => {
            const url = resolveTopicUrl(topic.getAttribute('href') || topic.href)
            log.info(`  → check ${url}`)
            xhr.request(url, (isBlocked, _topics, raw, transport) => {
                if (isBlocked || transport) {
                    log.warn('  Topic check unavailable')
                    cb(false)
                    return
                }
                const ok = _topicHasAppId(raw, appId)
                log.info(`  ${ok ? '✓' : '✗'} Topic appId ${ok ? 'matches' : 'differs'}`)
                cb(ok)
            })
        }

        const runLeg = ({ url, appIdSearch: isAppIdSearch }) =>
            new Promise(resolve => {
                log.info(`  → ${url}`)
                xhr.request(url, (isBlocked, topics, raw, transport, guest) => {
                    if (guest) sawGuest = true
                    if (done) {
                        resolve()
                        return
                    }
                    if (isBlocked) {
                        onBlocked()
                        resolve()
                        return
                    }
                    if (transport) {
                        log.warn('  Transport failure — no clean read')
                        resolve('transport')
                        return
                    }
                    if (RE_SEARCH_UNAVAILABLE.test(raw ?? '')) {
                        log.warn('  Search unavailable — waiting before retry')
                        resolve('unavailable')
                        return
                    }
                    if (!topics.length) log.info(`  → ${_emptyNote(raw)}`)
                    const best = pickBestTopic(topics, appName, isAppIdSearch)
                    if (best) {
                        if (!isAppIdSearch && _needsTopicCheck(appId, appName, best)) {
                            checkTopic(best, ok => {
                                if (done) {
                                    resolve()
                                    return
                                }
                                if (ok) {
                                    settle(() => _finish(appId, appName, best))
                                    resolve()
                                    return
                                }
                                log.info('  ✗ Title candidate belongs to a different app')
                                resolve('fail')
                            })
                            return
                        }
                        settle(() => _finish(appId, appName, best))
                        resolve()
                        return
                    }
                    resolve('fail')
                })
            })

        const runForced = leg => {
            let attempts = 0
            const attempt = () => {
                if (done) return
                log.info(`  → (${force}) ${leg.url}`)
                xhr.request(leg.url, (isBlocked, topics, raw, transport, guest) => {
                    if (guest) sawGuest = true
                    if (done) return
                    if (isBlocked) {
                        settle(() => {
                            _diagnosticStop(appId, 'verify', 'blocked')
                            log.warn(`Forced ${force} search blocked`)
                        })
                        return
                    }
                    if (transport) {
                        settle(() => _diagnosticStop(appId, 'error', 'transport'))
                        return
                    }
                    if (RE_SEARCH_UNAVAILABLE.test(raw ?? '')) {
                        attempts++
                        if (attempts > MAX_FLOOD_RETRIES) {
                            settle(() => _diagnosticStop(appId, 'error', 'flood'))
                            return
                        }
                        log.warn('  Search unavailable — waiting before retry')
                        setTimeout(attempt, cfg.SEARCH_COOLDOWN_MS)
                        return
                    }
                    if (!topics.length) log.info(`  → ${_emptyNote(raw)}`)
                    const best = pickBestTopic(topics, appName, leg.appIdSearch)
                    if (best) {
                        if (!leg.appIdSearch && _needsTopicCheck(appId, appName, best)) {
                            checkTopic(best, ok => {
                                if (done) return
                                if (ok) {
                                    settle(() => _finish(appId, appName, best))
                                    return
                                }
                                settle(() => _diagnosticStop(appId, 'notfound', 'appid-mismatch'))
                            })
                            return
                        }
                        settle(() => _finish(appId, appName, best))
                        return
                    }
                    settle(() => _diagnosticStop(appId, sawGuest ? 'login' : 'notfound', sawGuest ? 'guest' : 'empty'))
                })
            }
            attempt()
        }

        const runFirstPass = async () => {
            if (done) return
            runFirstPass.attempts = (runFirstPass.attempts ?? 0) + 1
            const [a, b] = await Promise.all([runLeg(appIdSearch), runLeg(titleSearch)])
            if (done) return
            if (a === 'unavailable' || b === 'unavailable') {
                if (runFirstPass.attempts > MAX_FLOOD_RETRIES) {
                    onBlocked('Search unavailable, verify needed')
                    return
                }
                setTimeout(runFirstPass, cfg.SEARCH_COOLDOWN_MS)
                return
            }
            const inconclusive = [a, b].find(result => result === 'transport' || result === 'unavailable')
            if (inconclusive) {
                onBlocked(inconclusive === 'transport' ? 'Search failed, verify needed' : 'Search unavailable, verify needed')
                return
            }
            if (diagnostic) {
                settle(() => _diagnosticStop(appId, sawGuest ? 'login' : 'notfound', sawGuest ? 'guest' : 'empty'))
                return
            }
            settle(() => (sawGuest ? _loginRequired(appId, appName, primaryBtn) : _notFound(appId, appName, primaryBtn)))
        }

        if (force) {
            const leg = force === 'appId' ? appIdSearch : titleSearch
            runForced(leg)
            return
        }

        runFirstPass()
    }

    const retry = (appId, appName, btn, titleEl) => {
        log.info(`Retry: appId ${appId}`)
        _verifyPending.delete(appId)
        const existing = _inFlight.get(appId)
        if (existing) {
            if (btn && !existing.some(w => w.btn === btn)) existing.push({ btn, titleEl: titleEl ?? null })
            return
        }
        _inFlight.set(appId, btn ? [{ btn, titleEl: titleEl ?? null }] : [])
        _search(appId, appName, { viaBypass: true, primaryBtn: btn ?? null })
    }

    const _startSearch = (appId, appName, btn, titleEl, resolve) => {
        if (btn) {
            btn.dataset.rinAppid = appId
            if (appName) btn.dataset.rinAppname = appName
            ui.setPending(btn)
        }
        _inFlight.set(appId, [{ btn, titleEl, resolve }])
        _search(appId, appName, { viaBypass: false, primaryBtn: btn })
    }

    const searchFor = (appId, appName, btn, titleEl) =>
        new Promise(resolve => {
            if ((appId === null || appId === undefined) && !appName) {
                resolve({ status: 'notfound' })
                return
            }
            if (_cacheable(appId)) {
                const cached = _resolvedUrls.get(appId)
                if (cached !== undefined) {
                    if (cached === NOT_FOUND) {
                        resolve(_applyCached({ exists: false }, btn, appName, appId, titleEl))
                        return
                    }
                    resolve(_applyCached({ exists: true, url: cached.url, tags: cached.tags ?? [] }, btn, appName, appId, titleEl))
                    return
                }
                const stored = cache.get(appId)
                if (stored) {
                    resolve(_applyCached(stored, btn, appName, appId, titleEl))
                    return
                }
            }
            if (_verifyPending.has(appId)) {
                if (btn) _showVerify(btn, () => retry(appId, appName, btn, titleEl))
                resolve({ status: 'verify' })
                return
            }
            if (_inFlight.has(appId)) {
                _inFlight.get(appId).push({ btn, titleEl, resolve })
                return
            }
            _startSearch(appId, appName, btn, titleEl, resolve)
        })

    const forceSearch = (appId, appName, btn, mode = 'auto') =>
        new Promise(resolve => {
            if (!['auto', 'appId', 'title'].includes(mode)) {
                resolve({ status: 'error', reason: 'mode' })
                return
            }
            if ((appId === null || appId === undefined) && !appName) {
                resolve({ status: 'notfound', reason: 'no-target' })
                return
            }
            if (mode === 'appId' && (appId === null || appId === undefined)) {
                resolve({ status: 'error', reason: 'no-appid' })
                return
            }
            if (_inFlight.has(appId)) {
                resolve({ status: 'busy' })
                return
            }
            if (_cacheable(appId)) {
                cache.clear(appId)
                _resolvedUrls.delete(appId)
            }
            _verifyPending.delete(appId)
            _inFlight.set(appId, [{ btn, titleEl: null, resolve }])
            _search(appId, appName, {
                viaBypass: false,
                primaryBtn: btn ?? null,
                force: mode === 'auto' ? null : mode,
                diagnostic: true,
            })
        })

    return {
        searchFor,
        forceSearch,
        retry,
        getDebugState: () => ({
            resolved: _resolvedUrls.size,
            inFlight: _inFlight.size,
            verifyPending: _verifyPending.size,
        }),
        clearCache(appIds) {
            for (const id of appIds) cache.clear(id)
            for (const id of [..._inFlight.keys()]) _cancel(id)
            _resolvedUrls.clear()
            _verifyPending.clear()
        },
        refetchAll() {
            for (const id of [..._inFlight.keys()]) _cancel(id)
            _resolvedUrls.clear()
            _verifyPending.clear()
        },
        notFound: _notFound,
    }
}
