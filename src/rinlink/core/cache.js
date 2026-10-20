/* Bump when a cached entry's meaning changes. Version 2 marks matches verified
   against the app id; older entries may point at a same-name game. */
const CACHE_VERSION = 2

export function createCache({ storage, cfg }) {
    const read = key => {
        const raw = storage.get(key, null)
        if (!raw) return null
        return typeof raw === 'string' ? JSON.parse(raw) : raw
    }

    return {
        get(appId) {
            try {
                const key = cfg.CACHE_KEY(appId)
                const entry = read(key)
                if (!entry) return null
                if (entry.v !== CACHE_VERSION || Date.now() - (entry.ts || 0) > cfg.CACHE_TTL) {
                    storage.delete(key)
                    return null
                }
                return entry
            } catch (_) {
                return null
            }
        },
        set(appId, data) {
            try {
                storage.set(cfg.CACHE_KEY(appId), JSON.stringify({ ...data, v: CACHE_VERSION, ts: Date.now() }))
            } catch (_) {}
        },
        clear(appId) {
            try {
                storage.delete(cfg.CACHE_KEY(appId))
            } catch (_) {}
        },
        prune() {
            const prefix = cfg.CACHE_KEY('')
            try {
                for (const key of storage.keys()) {
                    if (!key?.startsWith(prefix)) continue
                    const entry = read(key)
                    if (entry?.v !== CACHE_VERSION || Date.now() - (entry?.ts || 0) > cfg.CACHE_TTL) storage.delete(key)
                }
            } catch (_) {}
        },
    }
}
