export const fileName = (kind, target) => {
    if (kind === 'achievements') return 'achievements.json'
    if (kind === 'languages') return target === 'star' ? 'languages.star' : 'supported_languages.txt'
    return null
}

export const downloadBlob = (name, blob) => {
    try {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return true
    } catch {
        return false
    }
}

export const downloadText = (name, text, type = 'text/plain') => downloadBlob(name, new Blob([text], { type }))

export const downloadBytes = (name, bytes, type = 'application/zip') => downloadBlob(name, new Blob([bytes], { type }))
