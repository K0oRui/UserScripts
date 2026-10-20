import { log } from './logger.js'

export function parseTopics(raw) {
    if (!raw) return []
    try {
        const doc = new DOMParser().parseFromString(raw, 'text/html')
        return [...doc.querySelectorAll('a[class~="topictitle"]')]
    } catch (e) {
        log.error('parseTopics:', e)
        return []
    }
}
