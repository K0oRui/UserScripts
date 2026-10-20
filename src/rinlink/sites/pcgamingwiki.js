import { CFG } from '../config.js'
import { extractAppId } from '../utils.js'

export function createPcgamingwikiHandler({ search, ui }) {
    return {
        id: 'PCGamingWiki',
        match: () => location.hostname.includes('pcgamingwiki.com'),
        run() {
            const container = document.querySelector('.template-infobox-icons, .infobox-icons')
            if (!container) return
            const btn = ui.createButton({
                iconOnly: true,
                style: {
                    display: 'inline-block',
                    width: '24px',
                    height: '24px',
                    margin: '0 0 0 2px',
                    padding: '0 0 0 2px',
                    overflow: 'hidden',
                },
            })
            btn.title = CFG.LABEL
            btn.setAttribute('data-tooltip-text', CFG.LABEL)
            container.appendChild(btn)

            let appId = null
            const steampage = document.querySelector('a[href*="store.steampowered.com"]')
            if (steampage) appId = extractAppId(steampage.href)

            const name = document.querySelector('#firstHeading')?.textContent?.trim() || document.title.replace(/ - PCGamingWiki/, '')
            search.searchFor(appId, name, btn, null)
        },
    }
}
