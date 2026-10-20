const clean = text => (text || '').replace(/\s+/g, ' ').trim()

const attr = (el, name) => (el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null) || ''

const withDir = (dir, file) => (file ? `${dir}/${file}` : '')

const directText = cell => {
    if (!cell) return ''
    const parts = []
    for (const node of cell.childNodes || []) {
        if (node.nodeType === 3) parts.push(node.textContent || '')
    }
    return clean(parts.join(' '))
}

const parseCards = root => {
    if (!root || typeof root.querySelectorAll !== 'function') return []
    const cards = root.querySelectorAll('#js-achievements .achievement')
    return Array.from(cards)
        .map(card => {
            const find = sel => (card && typeof card.querySelector === 'function' ? card.querySelector(sel) : null)
            const name = clean(find('.achievement_api')?.textContent)
            const displayName = clean(find('.achievement_name')?.textContent)
            const desc = find('.achievement_desc')
            const descText = clean(desc?.textContent)
            const marker = desc?.querySelector?.('i')
            const hidden = /hidden achievement/i.test(marker?.textContent || '') || /^hidden achievement/i.test(descText)
            const spoiler = clean(desc?.querySelector?.('.achievement_spoiler')?.textContent)
            const description = hidden ? spoiler || clean(descText.replace(/^hidden achievement:?\s*/i, '')) : descText
            const icon = attr(find('.achievement_image'), 'data-name')
            const icongray = attr(find('.achievement_image_small'), 'data-name')
            if (!name || !displayName) return null
            return { name, displayName, description, hidden: hidden ? '1' : '0', icon, icongray }
        })
        .filter(Boolean)
}

const parseTable = root => {
    if (!root || typeof root.querySelectorAll !== 'function') return []
    const rows = root.querySelectorAll('#js-achievements table tbody tr')
    return Array.from(rows)
        .map(tr => {
            const cells = typeof tr.querySelectorAll === 'function' ? tr.querySelectorAll('td') : []
            const name = clean(cells[0]?.textContent)
            const cell = cells[1]
            const p = cell && typeof cell.querySelector === 'function' ? cell.querySelector('p') : null
            const pText = clean(p?.textContent)
            const hiddenMatch = pText.match(/^hidden\.?\s*/i)
            const hidden = hiddenMatch ? '1' : '0'
            const description = hiddenMatch ? clean(pText.slice(hiddenMatch[0].length)) : pText
            const displayName = directText(cell) || clean((cell?.textContent || '').replace(pText, ''))
            const iconCell = cells[2]
            const images = iconCell && typeof iconCell.querySelectorAll === 'function' ? iconCell.querySelectorAll('img') : []
            const icon = attr(images[0], 'data-name')
            const icongray = attr(images[1], 'data-name')
            if (!name || !displayName || images.length === 0) return null
            return { name, displayName, description, hidden, icon, icongray }
        })
        .filter(Boolean)
}

export const parseAchievementRows = root => {
    const cards = parseCards(root)
    return cards.length > 0 ? cards : parseTable(root)
}

export const formatAchievementsGoldberg = entries =>
    JSON.stringify(
        entries.map(e => ({
            description: e.description,
            displayName: e.displayName,
            hidden: e.hidden,
            icon: withDir('images', e.icon),
            icongray: withDir('images', e.icongray),
            name: e.name,
        })),
        null,
        2,
    )

export const formatAchievementsStar = entries =>
    JSON.stringify(
        entries.map(e => ({
            name: e.name,
            displayName: e.displayName,
            description: e.description,
            icon: withDir('icons', e.icon),
            icongray: withDir('icons', e.icongray),
            hidden: e.hidden,
        })),
        null,
        2,
    )
