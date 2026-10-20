import { normalise, sigWords, isCleanSuffix, isSequelSuffix, getTopicText, STOP_WORDS, RE_DIGIT, SEQUEL_NUMS } from './normalise.js'
import { log } from './logger.js'

export function scoreTopic(topicTitle, appName, _normName) {
    if (!appName) return 0
    const normTitle = normalise(topicTitle)
    const normName = _normName ?? normalise(appName)
    if (!normName) return 0

    if (normTitle === normName) return 100

    if (normTitle.startsWith(normName)) {
        const sfx = normTitle.slice(normName.length)
        if (isCleanSuffix(sfx)) return 80
        if (isSequelSuffix(sfx)) return 40
        return 70
    }

    if (normTitle.includes(normName)) {
        const startIdx = normTitle.indexOf(normName)
        const before = normTitle.slice(0, startIdx).trim()
        const sfx = normTitle.slice(startIdx + normName.length)
        const beforeSig = sigWords(before).filter(w => w !== 'info')

        const nameSigCount = sigWords(normName).length
        if (nameSigCount >= 2 || beforeSig.length === 0) {
            if (isCleanSuffix(sfx)) return 78
            if (isSequelSuffix(sfx)) return 40
            return 65
        }
    }

    const nameWords = sigWords(normName)
    if (!nameWords.length) return 0

    const titleArr = normTitle.split(' ')
    const hasWord = titleArr.length > 10 ? w => new Set(titleArr).has(w) : w => titleArr.includes(w)

    const matched = nameWords.filter(hasWord)
    const matchCount = matched.length
    const ratio = matchCount / nameWords.length

    const titleSig = sigWords(normTitle).filter(w => w !== 'info')
    if (titleSig.length >= 2 && titleSig.every((w, i) => nameWords[i] === w)) {
        const extra = nameWords.slice(titleSig.length)
        if (!extra.some(w => RE_DIGIT.test(w) || SEQUEL_NUMS.has(w))) return 65
    }

    if (ratio === 1) {
        if (nameWords.length === 1) {
            const titleSigCount = (titleArr.length > 10 ? [...new Set(titleArr)] : titleArr).filter(
                w => (w.length > 1 || RE_DIGIT.test(w)) && !STOP_WORDS.has(w) && w !== 'info',
            ).length
            return titleSigCount <= 2 ? 60 : 20
        }
        return 60
    }
    if (ratio >= 0.75 && matchCount >= 2) return 45
    if (ratio >= 0.5 && matchCount >= 3) return 30
    if (nameWords.length === 1 && matchCount === 1 && nameWords[0].length >= 5) return 20
    return 0
}

export function pickBestTopic(topics, appName, isAppIdSearch = false) {
    if (!topics.length) return null

    if (isAppIdSearch && topics.length === 1) {
        const text = getTopicText(topics[0])
        log.info(`✓ Single:${text ? ` "${text.slice(0, 60)}"` : ' (empty)'}`)
        return topics[0]
    }

    const normName = normalise(appName ?? '')
    let best = null,
        bestScore = 0

    for (const t of topics) {
        const text = getTopicText(t)
        if (!text) continue
        const score = scoreTopic(text, appName, normName)
        if (score > bestScore) {
            best = t
            bestScore = score
        }
    }

    if (!best || bestScore < 45) {
        log.info(`✗ No match (best ${bestScore})`)
        return null
    }

    log.info(`✓ Score ${bestScore}: "${getTopicText(best).slice(0, 60)}"`)
    return best
}
