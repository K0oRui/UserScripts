import { CFG } from './config.js'

export const extractAppId = url => (url || '').match(/\/app\/(\d+)/)?.[1] ?? null

export const sanitiseKw = kw => {
    if (!kw) return ''
    if (/^\d+$/.test(kw)) return kw
    try {
        return kw
            .normalize('NFC')
            .replace(/[^\w\s]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    } catch {
        return String(kw)
            .replace(/[^\w\s]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }
}

export const buildSearchUrl = kw => `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(sanitiseKw(kw))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=firstpost`

export const buildTitleUrl = kw => {
    const words = sanitiseKw(kw).split(/\s+/).filter(Boolean).slice(0, 10)
    return `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(words.join(' '))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=titleonly`
}

export const resolveTopicUrl = href => {
    if (!href) return CFG.CREATE_URL
    const clean = href.split('&hilit')[0]
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean
    const rel = clean.startsWith('/') ? clean.slice(1) : clean.startsWith('./') ? clean.slice(2) : clean
    return CFG.BASE_URL + rel
}

export const tagColor = str => {
    let h = 0
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
    return `hsl(${Math.abs(h % 360)}, 70%, 60%)`
}
