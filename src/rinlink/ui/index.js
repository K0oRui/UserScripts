import * as buttonStates from './button-states.js'
import * as tags from './tags.js'
import { showNotFoundBanner, showLoginBanner } from './notfound-banner.js'
import { css } from '../core/dom.js'

export function createUi() {
    return {
        createButton: buttonStates.createButton,
        setPending: buttonStates.btnSetPending,
        setReady: buttonStates.btnSetReady,
        setNotFound: buttonStates.btnSetNotFound,
        setLoginRequired: buttonStates.btnSetLogin,
        showVerify: buttonStates.showVerifyButton,
        extractTags: tags.extractTags,
        appendTags: tags.appendTags,
        showNotFoundBanner,
        showLoginBanner,
        css,
    }
}
