import { CFG } from '../config.js'

const LOG_LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, none: 5 }
const _scriptStart = Date.now()
const _ring = Array.from({ length: 200 })
let _ringIdx = 0

function _ts() {
    const elapsed = Date.now() - _scriptStart
    return (elapsed / 1000).toFixed(1).padStart(5) + 's'
}

function _write(level, args) {
    const prefix = `[RIN] [${level}]`
    _ring[_ringIdx] = { level, ts: _ts(), msg: args.map(a => (typeof a === 'object' ? safeStr(a) : String(a))).join(' ') }
    _ringIdx = (_ringIdx + 1) % _ring.length
    switch (level) {
        case 'error':
            console.error(prefix, ...args)
            break
        case 'warn':
            console.warn(prefix, ...args)
            break
        default:
            console.log(prefix, ...args)
            break
    }
}

function safeStr(o) {
    if (o instanceof Error) return `${o.name}: ${o.message}${o.stack ? `\n${o.stack}` : ''}`
    try {
        return JSON.stringify(o)
    } catch {
        return String(o)
    }
}

export function readLogBuffer() {
    const entries = []
    for (let i = 0; i < _ring.length; i++) {
        const e = _ring[(_ringIdx + i) % _ring.length]
        if (e) entries.push(e)
    }
    return entries
}

export const log = {
    trace: (...a) => {
        if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.trace) _write('trace', a)
    },
    debug: (...a) => {
        if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.debug) _write('debug', a)
    },
    info: (...a) => {
        if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.info) _write('info', a)
    },
    warn: (...a) => {
        if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.warn) _write('warn', a)
    },
    error: (...a) => {
        if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.error) _write('error', a)
    },
    dump() {
        const entries = readLogBuffer()
        console.groupCollapsed('[RIN] log buffer (last ' + entries.length + ')')
        for (const e of entries) console.log(`[${e.level}] ${e.ts}  ${e.msg}`)
        console.groupEnd()
    },
}
