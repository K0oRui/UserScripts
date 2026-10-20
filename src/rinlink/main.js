import { CFG } from './config.js'
import { log } from './core/logger.js'
import { createStorage } from './core/storage.js'
import { createCache } from './core/cache.js'
import { createXhr } from './core/xhr.js'
import { createBypass } from './core/bypass.js'
import { createSearchService } from './core/search.js'
import { createUi } from './ui/index.js'
import { createRouter } from './sites/router.js'
import { createSteamHandler } from './sites/steam.js'
import { createSteamDBHandler } from './sites/steamdb.js'
import { createPcgamingwikiHandler } from './sites/pcgamingwiki.js'
import { createCsRinOverlay } from './sites/csrin-overlay.js'

const storage = createStorage()
const openTab = (url, opts) => GM_openInTab(url, opts)

const cache = createCache({ storage, cfg: CFG })
cache.prune()

const xhr = createXhr(CFG)
const bypass = createBypass({ storage, cfg: CFG, openTab, xhr })

const ui = createUi()
const search = createSearchService({ cache, xhr, bypass, cfg: CFG, ui })

const handlers = [createSteamHandler({ search, ui }), createSteamDBHandler({ search, ui }), createPcgamingwikiHandler({ search, ui })]
const router = createRouter({ handlers })
const csrin = createCsRinOverlay({ storage })

export const app = { search, router }

if (csrin.match()) {
    csrin.run()
} else {
    router.dispatch()
}

log.info('Initialised.')
