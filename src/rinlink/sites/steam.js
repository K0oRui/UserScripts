import { extractAppId } from '../utils.js'

export function createSteamHandler({ search, ui }) {
    return {
        id: 'Steam',
        match: () => location.hostname.includes('store.steampowered.com'),
        run() {
            const container = document.querySelector('.apphub_OtherSiteInfo')
            if (!container) return
            const btn = ui.createButton({ className: 'btnv6_blue_hoverfade btn_medium' })
            ui.css(btn, { marginRight: '4px' })
            container.prepend(btn)

            let appId = extractAppId(location.pathname)
            const dlc = document.querySelector('#dlc_browse_content .game_area_dlc_section .game_area_dlc_name a[href*="/app/"], a[href*="/app/"]')
            if (!appId && dlc) appId = extractAppId(dlc.href)

            const go = (tries = 0) => {
                const h1 = document.querySelector('#appHubAppName')
                const name = h1?.textContent?.trim() ?? document.title.split(' on Steam')[0]
                if ((!appId || !name) && tries < 10) {
                    setTimeout(() => go(tries + 1), 300)
                    return
                }
                if (!appId || !name) {
                    btn.remove()
                    return
                }
                search.searchFor(appId, name, btn, h1)
            }
            ui.setPending(btn)
            go()
        },
    }
}
