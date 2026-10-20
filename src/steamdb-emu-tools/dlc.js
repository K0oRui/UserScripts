export const parseDlcRows = root => {
    if (!root || typeof root.querySelectorAll !== 'function') return []
    const rows = root.querySelectorAll('#dlc tbody tr.app, #dlc tbody tr')
    return Array.from(rows)
        .map(tr => {
            const getAttr = name => (typeof tr.getAttribute === 'function' ? tr.getAttribute(name) : (tr.dataset?.[name.replace('data-', '')] ?? null))
            const fromData = getAttr('data-appid')
            const link = typeof tr.querySelector === 'function' ? tr.querySelector('td:first-child a[href*="/app/"]') : null
            const href = link?.getAttribute ? link.getAttribute('href') : (link?.href ?? '')
            const fromHref = (href || '').match(/\/app\/(\d+)/)?.[1] ?? null
            const id = (fromData || fromHref || link?.textContent?.trim() || '').trim()
            const cells = typeof tr.querySelectorAll === 'function' ? tr.querySelectorAll('td') : []
            const name = (cells[1]?.textContent || '').replace(/\s+/g, ' ').trim()
            if (!/^\d+$/.test(id || '') || !name) return null
            return { id, name }
        })
        .filter(Boolean)
}

export const formatDlcGoldberg = entries => entries.map(e => `${e.id}=${e.name}`).join('\n')

export const formatDlcStar = entries => entries.map(e => `dlc.${e.id} = ${e.name}`).join('\n')
