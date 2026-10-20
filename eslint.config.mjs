import js from '@eslint/js'
import globals from 'globals'

const gmGlobals = {
    GM_xmlhttpRequest: 'readonly',
    GM_openInTab: 'readonly',
    GM_setValue: 'readonly',
    GM_getValue: 'readonly',
    GM_deleteValue: 'readonly',
    GM_listValues: 'readonly',
    GM_addValueChangeListener: 'readonly',
    GM_removeValueChangeListener: 'readonly',
    GM_addStyle: 'readonly',
    GM_info: 'readonly',
    GM_log: 'readonly',
    GM_notification: 'readonly',
    GM_registerMenuCommand: 'readonly',
    GM_setClipboard: 'readonly',
    unsafeWindow: 'readonly',
}

const rules = {
    ...js.configs.recommended.rules,
    eqeqeq: ['error', 'always'],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
}

const languageOptions = {
    ecmaVersion: 'latest',
    sourceType: 'module',
}

export default [
    { ignores: ['dist/', 'node_modules/'] },
    {
        files: ['src/**/*.js'],
        languageOptions: { ...languageOptions, globals: { ...globals.browser, ...gmGlobals } },
        rules,
    },
    {
        files: ['scripts/**/*.mjs', 'test/**/*.js', '*.mjs'],
        languageOptions: { ...languageOptions, globals: globals.node },
        rules,
    },
]
