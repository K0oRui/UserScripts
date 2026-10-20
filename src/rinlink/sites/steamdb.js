import { extractAppId } from '../utils.js'

export function createSteamDBHandler({ search, ui }) {
    return {
        id: 'SteamDB',
        match: () => location.hostname.includes('steamdb.info'),
        run() {
            const container = document.querySelector('nav.app-links')
            if (!container) return
            const btn = ui.createButton({ label: 'CS.RIN.RU', className: 'btn' })
            container.prepend(btn)
            const appId = extractAppId(location.pathname)
            const name = document.querySelector('h1')?.textContent?.trim()
            search.searchFor(appId, name, btn, null)
        },
    }
}
