import { zipSync } from 'fflate'

const encoder = new TextEncoder()

const iconUrl = (appId, name) => `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appId}/${encodeURIComponent(name)}`

const requestBytes = url =>
    new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                timeout: 20_000,
                onload: res => {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(new Uint8Array(res.response))
                        return
                    }
                    reject(new Error(`HTTP ${res.status}`))
                },
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Timed out')),
            })
            return
        }
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.arrayBuffer()
            })
            .then(buf => resolve(new Uint8Array(buf)))
            .catch(reject)
    })

const mapLimit = async (items, limit, fn) => {
    const results = new Array(items.length)
    let index = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const current = index++
            results[current] = await fn(items[current])
        }
    })
    await Promise.all(workers)
    return results
}

const iconName = value => (value || '').split('/').pop()

const withoutMissingGrays = (json, missing) => {
    if (missing.size === 0) return json
    try {
        const entries = JSON.parse(json)
        for (const entry of entries) {
            if (entry && missing.has(iconName(entry.icongray))) entry.icongray = ''
        }
        return JSON.stringify(entries, null, 2)
    } catch {
        return json
    }
}

export const appIdFromLocation = () => location.pathname.match(/\/app\/(\d+)/)?.[1] || document.querySelector('.scope-app')?.getAttribute('data-appid') || ''

export const buildAchievementZip = async (target, json, entries, appId, fetchIcon) => {
    const root = target === 'star' ? 'STAR' : 'steam_settings'
    const iconDir = target === 'star' ? 'icons' : 'images'
    const mainNames = new Set()
    const grayNames = new Set()
    const names = new Set()

    for (const entry of entries) {
        const icon = iconName(entry.icon)
        const gray = iconName(entry.icongray)
        if (icon) {
            mainNames.add(icon)
            names.add(icon)
        }
        if (gray) {
            grayNames.add(gray)
            names.add(gray)
        }
    }

    if (names.size > 0 && !appId) throw new Error('Missing app id')

    const getIcon = fetchIcon || (name => requestBytes(iconUrl(appId, name)))
    const fetched = new Map()
    const failed = new Map()

    await mapLimit([...names], 6, async name => {
        try {
            fetched.set(name, await getIcon(name))
        } catch (error) {
            failed.set(name, error)
        }
    })

    const missing = new Set()
    for (const [name, error] of failed) {
        if (grayNames.has(name) && !mainNames.has(name)) {
            missing.add(name)
            continue
        }
        throw error
    }

    const zipJson = withoutMissingGrays(json, missing)
    const files = {
        [`${root}/`]: new Uint8Array(0),
        [`${root}/achievements.json`]: [encoder.encode(zipJson), { level: 6 }],
        [`${root}/${iconDir}/`]: new Uint8Array(0),
    }

    for (const [name, bytes] of fetched) {
        files[`${root}/${iconDir}/${name}`] = [bytes, { level: 0 }]
    }

    return zipSync(files)
}
