import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from 'fflate'
import { parseDlcRows, formatDlcGoldberg } from '../src/steamdb-emu-tools/dlc.js'
import { parseAchievementRows, formatAchievementsGoldberg, formatAchievementsStar } from '../src/steamdb-emu-tools/achievements.js'
import { buildAchievementZip } from '../src/steamdb-emu-tools/zip.js'
import { fileName } from '../src/steamdb-emu-tools/output.js'

const cell = text => ({ textContent: text })
const row = (appid, name, href) => ({
    getAttribute: n => (n === 'data-appid' ? appid : null),
    querySelector: sel => (sel.includes('a') ? { getAttribute: () => href, textContent: appid } : null),
    querySelectorAll: () => [cell(appid), cell(name)],
})

test('parseDlcRows extracts id and name from dlc rows', () => {
    const root = {
        querySelectorAll: () => [
            row('3279970', 'DRAGON BALL Z: KAKAROT - DAIMA PACK', '/app/3279970/'),
            row('3841290', 'SteamDB Unknown App 3841290', '/app/3841290/'),
        ],
    }
    assert.deepEqual(parseDlcRows(root), [
        { id: '3279970', name: 'DRAGON BALL Z: KAKAROT - DAIMA PACK' },
        { id: '3841290', name: 'SteamDB Unknown App 3841290' },
    ])
})

test('parseDlcRows falls back to href when data-appid is missing', () => {
    const root = { querySelectorAll: () => [row(null, 'Some DLC', '/app/123456/')] }
    assert.deepEqual(parseDlcRows(root), [{ id: '123456', name: 'Some DLC' }])
})

test('parseDlcRows skips rows without numeric id or name', () => {
    const root = { querySelectorAll: () => [row('abc', 'Bad', '/app/abc/'), row('123', '  ', '/app/123/')] }
    assert.deepEqual(parseDlcRows(root), [])
})

test('formatDlcGoldberg joins entries as ID=NAME lines', () => {
    assert.equal(
        formatDlcGoldberg([
            { id: '1', name: 'A' },
            { id: '2', name: 'B' },
        ]),
        '1=A\n2=B',
    )
    assert.equal(formatDlcGoldberg([]), '')
})

const textNode = value => ({ nodeType: 3, textContent: value })

const achievementRow = ({ name, displayName, description = '', hidden = false, icon = '', icongray = '' }) => {
    const pText = hidden ? `Hidden.${description ? ` ${description}` : ''}` : description
    const p = pText ? { textContent: pText } : null
    const cells = [
        { textContent: name },
        {
            textContent: `${displayName}${pText}`,
            childNodes: [textNode(displayName), ...(p ? [p] : [])],
            querySelector: sel => (sel === 'p' ? p : null),
        },
        {
            querySelectorAll: sel =>
                sel === 'img' ? [{ getAttribute: n => (n === 'data-name' ? icon : null) }, { getAttribute: n => (n === 'data-name' ? icongray : null) }] : [],
        },
    ]
    return { querySelectorAll: sel => (sel === 'td' ? cells : []) }
}

const legacyRoot = rows => ({
    querySelectorAll: sel => (sel === '#js-achievements table tbody tr' ? rows : []),
})

const achievementCard = ({ name, displayName, description = '', hidden = false, icon = '', icongray = '' }) => {
    const desc = {
        textContent: hidden ? `Hidden achievement: ${description}` : description,
        querySelector: sel => {
            if (sel === '.achievement_spoiler') return hidden ? { textContent: description } : null
            return null
        },
    }
    const nodes = {
        '.achievement_api': { textContent: name },
        '.achievement_name': { textContent: displayName },
        '.achievement_desc': desc,
        '.achievement_image': { getAttribute: n => (n === 'data-name' ? icon : null) },
        '.achievement_image_small': { getAttribute: n => (n === 'data-name' ? icongray : null) },
    }
    return { querySelector: sel => nodes[sel] || null }
}

const cardsRoot = cards => ({
    querySelectorAll: sel => (sel === '#js-achievements .achievement' ? cards : []),
})

test('parseAchievementRows reads the current achievement card layout', () => {
    const root = cardsRoot([
        achievementCard({
            name: 'PLAY_CS2',
            displayName: 'A New Beginning',
            description: 'This is Counter-Strike, too.',
            hidden: true,
            icon: 'f75dd04fa12445a8ec43be65fa16ff1b8d2bf82e.jpg',
            icongray: 'e7d79e52002c75f027a51e8eb05ab55416678f09.jpg',
        }),
        achievementCard({
            name: 'WIN_ROUND',
            displayName: 'Winner',
            description: 'Win a round.',
            icon: 'win.jpg',
            icongray: 'win_gray.jpg',
        }),
    ])
    assert.deepEqual(parseAchievementRows(root), [
        {
            name: 'PLAY_CS2',
            displayName: 'A New Beginning',
            description: 'This is Counter-Strike, too.',
            hidden: '1',
            icon: 'f75dd04fa12445a8ec43be65fa16ff1b8d2bf82e.jpg',
            icongray: 'e7d79e52002c75f027a51e8eb05ab55416678f09.jpg',
        },
        {
            name: 'WIN_ROUND',
            displayName: 'Winner',
            description: 'Win a round.',
            hidden: '0',
            icon: 'win.jpg',
            icongray: 'win_gray.jpg',
        },
    ])
})

test('parseAchievementRows extracts achievement fields', () => {
    const root = legacyRoot([
        achievementRow({
            name: 'Achievement_0',
            displayName: 'Tower Tussle',
            description: 'Complete Burning Paris on Survival Normal difficulty',
            icon: 'Achievement_0.jpg',
            icongray: 'Achievement_0_gray.jpg',
        }),
        achievementRow({
            name: 'Achievement_1',
            displayName: 'Seine Skirmish',
            description: 'Complete Burning Paris on Survival Hard difficulty',
            icon: 'Achievement_1.jpg',
            icongray: 'Achievement_1_gray.jpg',
        }),
    ])
    assert.deepEqual(parseAchievementRows(root), [
        {
            name: 'Achievement_0',
            displayName: 'Tower Tussle',
            description: 'Complete Burning Paris on Survival Normal difficulty',
            hidden: '0',
            icon: 'Achievement_0.jpg',
            icongray: 'Achievement_0_gray.jpg',
        },
        {
            name: 'Achievement_1',
            displayName: 'Seine Skirmish',
            description: 'Complete Burning Paris on Survival Hard difficulty',
            hidden: '0',
            icon: 'Achievement_1.jpg',
            icongray: 'Achievement_1_gray.jpg',
        },
    ])
})

test('parseAchievementRows leaves icongray empty when no gray icon is shown', () => {
    const root = cardsRoot([achievementCard({ name: 'NO_GRAY', displayName: 'No Gray', icon: 'main.jpg' })])
    assert.deepEqual(parseAchievementRows(root), [
        {
            name: 'NO_GRAY',
            displayName: 'No Gray',
            description: '',
            hidden: '0',
            icon: 'main.jpg',
            icongray: '',
        },
    ])
})

test('parseAchievementRows flags hidden rows and strips the marker', () => {
    const root = legacyRoot([
        achievementRow({
            name: 'SECRET',
            displayName: 'Secret',
            description: 'Find the hidden room',
            hidden: true,
            icon: 'secret.jpg',
            icongray: 'secret_gray.jpg',
        }),
    ])
    assert.deepEqual(parseAchievementRows(root), [
        {
            name: 'SECRET',
            displayName: 'Secret',
            description: 'Find the hidden room',
            hidden: '1',
            icon: 'secret.jpg',
            icongray: 'secret_gray.jpg',
        },
    ])
})

test('parseAchievementRows skips rows without a name or display name', () => {
    const root = legacyRoot([achievementRow({ name: '', displayName: 'No name' }), achievementRow({ name: 'NO_DISPLAY', displayName: '' })])
    assert.deepEqual(parseAchievementRows(root), [])
})

test('formatAchievementsGoldberg writes the Goldberg JSON shape', () => {
    const entries = [
        {
            name: 'Achievement_0',
            displayName: 'Tower Tussle',
            description: 'Complete Burning Paris on Survival Normal difficulty',
            hidden: '0',
            icon: 'Achievement_0.jpg',
            icongray: 'Achievement_0_gray.jpg',
        },
    ]
    assert.equal(
        formatAchievementsGoldberg(entries),
        `[
  {
    "description": "Complete Burning Paris on Survival Normal difficulty",
    "displayName": "Tower Tussle",
    "hidden": "0",
    "icon": "images/Achievement_0.jpg",
    "icongray": "images/Achievement_0_gray.jpg",
    "name": "Achievement_0"
  }
]`,
    )
})

test('formatAchievementsStar writes the STAR JSON shape', () => {
    const entries = [
        {
            name: 'ACH_WIN_ONE_GAME',
            displayName: 'Winner',
            description: 'Win your first game.',
            hidden: '0',
            icon: 'win.png',
            icongray: 'win_gray.png',
        },
    ]
    assert.equal(
        formatAchievementsStar(entries),
        `[
  {
    "name": "ACH_WIN_ONE_GAME",
    "displayName": "Winner",
    "description": "Win your first game.",
    "icon": "icons/win.png",
    "icongray": "icons/win_gray.png",
    "hidden": "0"
  }
]`,
    )
})

test('formatAchievementsGoldberg and Star return an empty array for no entries', () => {
    assert.equal(formatAchievementsGoldberg([]), '[]')
    assert.equal(formatAchievementsStar([]), '[]')
})

test('buildAchievementZip writes Goldberg JSON and icons under steam_settings', async () => {
    const entries = [
        { icon: 'win.jpg', icongray: 'win_gray.jpg' },
        { icon: 'win.jpg', icongray: 'win_gray.jpg' },
    ]
    const zip = await buildAchievementZip('goldberg', '{"ok":true}', entries, '730', async name => new TextEncoder().encode(name))
    const files = unzipSync(zip)

    assert.deepEqual(Object.keys(files).sort(), [
        'steam_settings/',
        'steam_settings/achievements.json',
        'steam_settings/images/',
        'steam_settings/images/win.jpg',
        'steam_settings/images/win_gray.jpg',
    ])
    assert.equal(new TextDecoder().decode(files['steam_settings/achievements.json']), '{"ok":true}')
    assert.equal(new TextDecoder().decode(files['steam_settings/images/win.jpg']), 'win.jpg')
})

test('buildAchievementZip writes STAR JSON and icons under STAR', async () => {
    const entries = [{ icon: 'win.png', icongray: 'win_gray.png' }]
    const zip = await buildAchievementZip('star', '[]', entries, '730', async name => new TextEncoder().encode(name))
    const files = unzipSync(zip)

    assert.deepEqual(Object.keys(files).sort(), ['STAR/', 'STAR/achievements.json', 'STAR/icons/', 'STAR/icons/win.png', 'STAR/icons/win_gray.png'])
    assert.equal(new TextDecoder().decode(files['STAR/icons/win_gray.png']), 'win_gray.png')
})

test('buildAchievementZip omits a gray icon that cannot be fetched', async () => {
    const entries = [
        {
            name: 'WIN',
            displayName: 'Winner',
            description: 'Win.',
            hidden: '0',
            icon: 'win.jpg',
            icongray: 'win_gray.jpg',
        },
    ]
    const zip = await buildAchievementZip('goldberg', formatAchievementsGoldberg(entries), entries, '730', async name => {
        if (name === 'win_gray.jpg') throw new Error('HTTP 404')
        return new TextEncoder().encode(name)
    })
    const files = unzipSync(zip)

    assert.deepEqual(Object.keys(files).sort(), [
        'steam_settings/',
        'steam_settings/achievements.json',
        'steam_settings/images/',
        'steam_settings/images/win.jpg',
    ])
    const written = JSON.parse(new TextDecoder().decode(files['steam_settings/achievements.json']))
    assert.equal(written[0].icon, 'images/win.jpg')
    assert.equal(written[0].icongray, '')
})

test('buildAchievementZip fails when a main icon cannot be fetched', async () => {
    const entries = [{ icon: 'win.jpg', icongray: '' }]
    await assert.rejects(
        buildAchievementZip('goldberg', '[]', entries, '730', async () => {
            throw new Error('HTTP 404')
        }),
        /HTTP 404/,
    )
})

test('buildAchievementZip skips icon downloads when entries have no icons', async () => {
    const entries = [{ icon: '', icongray: '' }]
    const zip = await buildAchievementZip('goldberg', '[]', entries, '', async () => {
        throw new Error('should not fetch')
    })
    const files = unzipSync(zip)

    assert.deepEqual(Object.keys(files).sort(), ['steam_settings/', 'steam_settings/achievements.json', 'steam_settings/images/'])
})

test('fileName returns the expected download names', () => {
    assert.equal(fileName('achievements', 'goldberg'), 'achievements.json')
    assert.equal(fileName('achievements', 'star'), 'achievements.json')
    assert.equal(fileName('languages', 'goldberg'), 'supported_languages.txt')
    assert.equal(fileName('languages', 'star'), 'languages.star')
    assert.equal(fileName('dlc', 'goldberg'), null)
})
