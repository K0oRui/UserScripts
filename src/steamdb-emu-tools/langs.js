const LANG_MAP = {
    english: 'english',
    french: 'french',
    italian: 'italian',
    german: 'german',
    'spanish - spain': 'spanish',
    spanish: 'spanish',
    japanese: 'japanese',
    korean: 'koreana',
    polish: 'polish',
    'portuguese - brazil': 'brazilian',
    'brazilian portuguese': 'brazilian',
    portuguese: 'portuguese',
    russian: 'russian',
    'simplified chinese': 'schinese',
    'spanish - latin america': 'latam',
    thai: 'thai',
    'traditional chinese': 'tchinese',
    arabic: 'arabic',
    dutch: 'dutch',
    danish: 'danish',
    finnish: 'finnish',
    norwegian: 'norwegian',
    swedish: 'swedish',
    turkish: 'turkish',
    ukrainian: 'ukrainian',
    vietnamese: 'vietnamese',
    indonesian: 'indonesian',
    greek: 'greek',
    czech: 'czech',
    hungarian: 'hungarian',
    romanian: 'romanian',
    catalan: 'catalan',
}

export const normalizeLang = name => {
    const key = (name || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (LANG_MAP[key]) return LANG_MAP[key]
    return key.replace(/[^a-z]/g, '')
}

export const parseLangRows = root => {
    if (!root || typeof root.querySelectorAll !== 'function') return []
    const heading = Array.from(root.querySelectorAll('h2')).find(h => /supported languages/i.test(h.textContent || ''))
    if (!heading) return []
    let table = heading.nextElementSibling
    while (table && table.tagName !== 'TABLE') table = table.nextElementSibling
    if (!table) return []
    return Array.from(table.querySelectorAll('tbody tr'))
        .map(tr => {
            const first = tr.querySelector ? tr.querySelector('td') : tr.querySelectorAll?.()[0]
            const name = (first?.textContent || '').replace(/\s+/g, ' ').trim()
            if (!name) return null
            return normalizeLang(name)
        })
        .filter(Boolean)
}

export const formatLangGoldberg = langs => langs.join('\n')

export const formatLangStar = formatLangGoldberg
