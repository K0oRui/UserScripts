import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import prettier from 'prettier'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const DIST = path.join(ROOT, 'dist')

const DEBUG = process.argv.includes('--debug')

function readDir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return []
    }
}

function buildMeta(meta, debugSuffix) {
    let m = meta
    if (debugSuffix) {
        m = { ...meta, name: meta.name + ' Debug', description: meta.description + ' (debug build)' }
        for (const k of ['updateURL', 'downloadURL']) {
            if (typeof m[k] === 'string' && m[k].endsWith('.user.js')) m[k] = m[k].replace(/\.user\.js$/, '-debug.user.js')
        }
    }
    const keys = Object.keys(m)
    const maxLen = keys.reduce((mx, k) => Math.max(mx, k.length), 0)
    const pad = 2
    const lines = ['// ==UserScript==']
    for (const [key, value] of Object.entries(m)) {
        const space = ' '.repeat(maxLen - key.length + pad)
        if (Array.isArray(value)) {
            for (const item of value) lines.push(`// @${key}${space}${item}`)
        } else {
            lines.push(`// @${key}${space}${value}`)
        }
    }
    lines.push('// ==/UserScript==')
    return lines.join('\n')
}

async function bundleEntry(entry) {
    const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        treeShaking: true,
        legalComments: 'inline',
        charset: 'utf8',
        logLevel: 'info',
    })
    return result.outputFiles[0].text
}

async function formatCode(code, filepath) {
    const config = (await prettier.resolveConfig(ROOT)) ?? {}
    return prettier.format(code, { ...config, filepath })
}

async function writeScript(scriptDir, outName, meta, debug) {
    const debugEntry = path.join(scriptDir, 'main.debug.js')
    const entry = debug && fs.existsSync(debugEntry) ? debugEntry : path.join(scriptDir, 'main.js')

    const body = await bundleEntry(entry)
    const header = buildMeta(meta, debug)
    const output = await formatCode(header + '\n\n' + body, outName)

    const outPath = path.join(DIST, outName)
    fs.mkdirSync(DIST, { recursive: true })
    fs.writeFileSync(outPath, output, 'utf-8')
    console.log(`  built "${meta.name}${debug ? ' Debug' : ''}" → ${path.relative(process.cwd(), outPath)} (${output.length} bytes)`)
}

async function buildScript(scriptName) {
    const scriptDir = path.join(SRC, scriptName)
    const metaPath = path.join(scriptDir, 'meta.json')
    const entryPath = path.join(scriptDir, 'main.js')

    if (!fs.existsSync(metaPath)) {
        console.warn(`  skipping "${scriptName}" — no meta.json`)
        return
    }
    if (!fs.existsSync(entryPath)) {
        console.warn(`  skipping "${scriptName}" — no main.js`)
        return
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const baseName = meta.name?.toLowerCase().replace(/\s+/g, '-') ?? scriptName

    await writeScript(scriptDir, `${baseName}.user.js`, meta, false)
    if (DEBUG) return
    await writeScript(scriptDir, `${baseName}-debug.user.js`, meta, true)
}

async function buildAll() {
    console.log(`\n  building userscripts from ${path.relative(process.cwd(), SRC)}${DEBUG ? ' [DEBUG]' : ''}\n`)
    const entries = readDir(SRC)
    const scripts = entries.filter(e => e.isDirectory() && !e.name.startsWith('_'))
    for (const dir of scripts) await buildScript(dir.name)

    const docs = path.join(ROOT, 'docs')
    if (fs.existsSync(docs)) {
        fs.cpSync(docs, DIST, { recursive: true })
        console.log(`  copied static site files → ${path.relative(process.cwd(), DIST)}`)
    } else {
        console.warn('  no docs/ folder — static site files not regenerated')
    }
    console.log()
}

buildAll().catch(e => {
    console.error(e)
    process.exit(1)
})
