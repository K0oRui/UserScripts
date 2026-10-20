export function createStorage(backend) {
    const store = backend ?? {
        get: (key, def) => {
            try {
                return GM_getValue(key, def)
            } catch (_) {
                return def
            }
        },
        set: (key, value) => {
            try {
                GM_setValue(key, value)
            } catch (_) {}
        },
        delete: key => {
            try {
                GM_deleteValue(key)
            } catch (_) {}
        },
        keys: () => {
            try {
                return Array.from(GM_listValues())
            } catch (_) {
                return []
            }
        },
    }

    return {
        get: (key, def) => store.get(key, def),
        set: (key, value) => store.set(key, value),
        delete: key => store.delete(key),
        keys: () => store.keys?.() ?? [],
    }
}
