const askChoice = (label, subtitleText, choices) =>
    new Promise(resolve => {
        const overlay = document.createElement('div')
        overlay.id = 'steamdb-copy-target-overlay'
        overlay.className = 'steamdb-emu-tools-overlay'

        const box = document.createElement('div')
        box.className = 'panel steamdb-emu-tools-dialog'
        box.setAttribute('role', 'dialog')
        box.setAttribute('aria-modal', 'true')
        box.setAttribute('aria-labelledby', 'steamdb-emu-tools-dialog-title')

        const title = document.createElement('div')
        title.id = 'steamdb-emu-tools-dialog-title'
        title.className = 'panel-heading'
        title.textContent = label

        const subtitle = document.createElement('p')
        subtitle.className = 'muted steamdb-emu-tools-dialog-subtitle'
        subtitle.textContent = subtitleText

        const actions = document.createElement('div')
        actions.className = 'steamdb-emu-tools-dialog-actions'

        const cleanup = () => {
            document.removeEventListener('keydown', onKey)
            overlay.remove()
        }
        const onKey = e => {
            if (e.key === 'Escape') {
                cleanup()
                resolve(null)
            }
        }

        const pick = choice => {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'btn'
            b.textContent = choice.label
            b.addEventListener('click', () => {
                cleanup()
                resolve(choice.value)
            })
            return b
        }

        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.className = 'btn btn-outline btn-block'
        cancel.textContent = 'Cancel'
        cancel.addEventListener('click', () => {
            cleanup()
            resolve(null)
        })

        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                cleanup()
                resolve(null)
            }
        })
        document.addEventListener('keydown', onKey)

        for (const choice of choices) actions.appendChild(pick(choice))
        actions.appendChild(cancel)
        box.appendChild(title)
        box.appendChild(subtitle)
        box.appendChild(actions)
        overlay.appendChild(box)
        document.body.appendChild(overlay)
        actions.querySelector?.('.btn')?.focus()
    })

export const askTarget = label =>
    askChoice(label, 'Goldberg or STAR?', [
        { value: 'goldberg', label: 'Goldberg' },
        { value: 'star', label: 'STAR' },
    ])

export const askDlcTarget = label =>
    askChoice(label, 'Goldberg, STAR, or ALI213?', [
        { value: 'goldberg', label: 'Goldberg' },
        { value: 'star', label: 'STAR' },
        { value: 'ali213', label: 'ALI213' },
    ])

export const askAli213Layout = label =>
    askChoice(label, 'Plain or numbered?', [
        { value: 'plain', label: 'Plain list' },
        { value: 'numbered', label: 'Numbered entries' },
    ])

export const askOutput = label =>
    askChoice(label, 'File or clipboard?', [
        { value: 'file', label: 'Download file' },
        { value: 'clipboard', label: 'Copy to clipboard' },
    ])

export const askAchievementOutput = label =>
    askChoice(label, 'Download or copy?', [
        { value: 'zip', label: 'Download with icons' },
        { value: 'json', label: 'Download JSON' },
        { value: 'clipboard', label: 'Copy to clipboard' },
    ])
