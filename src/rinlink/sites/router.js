import { log } from '../core/logger.js'

export function createRouter({ handlers }) {
    return {
        dispatch() {
            for (const h of handlers) {
                try {
                    if (h.match()) {
                        log.info(`Handler: ${h.id}`)
                        h.run()
                        return
                    }
                } catch (e) {
                    log.error(`Handler ${h.id}:`, e)
                }
            }
        },
    }
}
