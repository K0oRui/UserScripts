import { CFG } from '../config.js'
import { css, mk } from '../core/dom.js'
import { tagColor } from '../utils.js'

export function extractTags(anchor) {
    const text = (anchor.parentElement?.textContent || anchor.textContent) ?? ''
    const seen = new Set()
    return (text.match(/\[[^\]]+\]/g) ?? []).filter(tag => {
        const inner = tag.slice(1, -1).trim()
        if (CFG.TAG_BLACKLIST.test(inner) || seen.has(inner)) return false
        seen.add(inner)
        return true
    })
}

export function appendTags(tags, target) {
    if (!tags.length || target.dataset.rinTagged) return
    target.dataset.rinTagged = 'true'
    for (const node of [target, target.parentElement]) if (node) css(node, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'unset' })
    for (const tag of tags) {
        const span = mk('span', { textContent: tag })
        css(span, { color: tagColor(tag), fontWeight: 'bold', marginLeft: '5px', fontSize: '0.9em' })
        target.appendChild(span)
    }
}
