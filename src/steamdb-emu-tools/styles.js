const CSS = `
.steamdb-emu-tools-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.achievements-header > div > .steamdb-emu-tools-btn {
    margin-left: 5px;
}

.steamdb-emu-tools-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: #1c1e2ce5;
    backdrop-filter: blur(5px);
}

.steamdb-emu-tools-dialog {
    width: min(360px, 100%);
    margin: 0;
    background: var(--body-bg-color, #1b1e26);
    box-shadow: 0 8px 24px rgb(0 0 0 / 50%);
}

.steamdb-emu-tools-dialog .panel-heading {
    color: var(--contrast-color, #fff);
    font-weight: 700;
}

.steamdb-emu-tools-dialog .steamdb-emu-tools-dialog-subtitle {
    margin: 0 0 15px;
}

.steamdb-emu-tools-dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.steamdb-emu-tools-dialog-actions .btn {
    flex: 1 1 auto;
}

.steamdb-emu-tools-dialog-actions .btn-block {
    flex-basis: 100%;
}
`

export const ensureStyles = () => {
    if (document.getElementById('steamdb-emu-tools-style')) return
    const style = document.createElement('style')
    style.id = 'steamdb-emu-tools-style'
    style.textContent = CSS
    document.head.appendChild(style)
}
