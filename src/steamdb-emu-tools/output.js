export const fileName = (kind, target) => {
    if (kind === 'achievements') return 'achievements.json'
    if (kind === 'languages') return target === 'star' ? 'languages.star' : 'supported_languages.txt'
    return null
}

export const downloadText = (name, text, type = 'text/plain') => {
    try {
        const blob = new Blob([text], { type })
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
