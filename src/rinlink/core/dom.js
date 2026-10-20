export const css = (el, props) => Object.assign(el.style, props)
export const mk = (tag, attrs = {}) => Object.assign(document.createElement(tag), attrs)
