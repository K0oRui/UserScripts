export function normalise(str) {
    if (!str) return ''
    return str
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[\u00ae\u2122\u00a9]/g, '')
        .replace(/[\u0027\u2018\u2019\u02bc\u02b9\u0060\u00b4\uff07]/g, '')
        .replace(/[\u0022\u201c\u201d\u201e\u201f\u2010-\u2015\u2212\u002d]/g, ' ')
        .replace(/[|\\/#]/g, ' ')
        .replace(/[^a-z0-9 ]/gi, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\bver(sion)?\b/g, 'edition')
        .replace(/\bed\b/g, 'edition')
}

export const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'to', 'for', 'is', 'at'])
export const SEQUEL_NUMS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])
export const RE_DIGIT = /^\d+$/
const RE_CLEAN_SFX = /^[\s[]*(?:\[[^\]]*\][\s[]*)*$/
const RE_SEQUEL_SFX = /^\s+(?:\d+|[ivxlcdm]+)\s*$/i

export const sigWords = norm => norm.split(' ').filter(w => (w.length > 1 || RE_DIGIT.test(w)) && !STOP_WORDS.has(w))

export const isCleanSuffix = after => RE_CLEAN_SFX.test(after)
export const isSequelSuffix = after => {
    if (!RE_SEQUEL_SFX.test(after)) return false
    const t = after.trim().toLowerCase()
    return RE_DIGIT.test(t) || SEQUEL_NUMS.has(t)
}

export function getTopicText(el) {
    if (!el) return ''
    const direct = (el.textContent ?? '').trim()
    if (direct) return direct
    try {
        const parts = []
        ;(function walk(n) {
            if (n.nodeType === 3) parts.push(n.nodeValue)
            else if (n.nodeType === 1) for (const c of n.childNodes) walk(c)
        })(el)
        const w = parts.join('').trim()
        if (w) return w.replace(/\s+/g, ' ')
    } catch (_) {}
    return (el.innerHTML ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&(?:nbsp|#\d+|\w+);/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
