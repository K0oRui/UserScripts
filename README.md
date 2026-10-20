# UserScripts

A collection of userscripts for various purposes. Fully compatible with Tampermonkey, Violentmonkey, and ScriptCat.

## Scripts

### RINLink

Adds CS.RIN.RU topic links to Steam, SteamDB and PCGamingWiki.

**Supported sites:** `store.steampowered.com/app/*`, `steamdb.info/app/*`, `pcgamingwiki.com/wiki/*`

[![Install](https://img.shields.io/badge/Install-RINLink-2ea44f?style=for-the-badge)](https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/rinlink.user.js)

**Credits:** K0oRui. Original project by Altansar69, Reddiepoint, and SubZeroPL.

### SteamDB Emu Tools

Adds copy buttons to the DLC, supported languages and achievements sections of SteamDB app pages. DLC supports Goldberg, STAR and two ALI213 layouts. Languages and achievements support Goldberg and STAR output. Languages can be downloaded as files, and achievements as JSON or as a ZIP with the icon files.

**Supported sites:** `steamdb.info/app/*`

[![Install](https://img.shields.io/badge/Install-SteamDB_Emu_Tools-2ea44f?style=for-the-badge)](https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/steamdb-emu-tools.user.js)

## Build

Source is written as ES modules in `src/<script>/`. `scripts/build.mjs` bundles each entry with esbuild, prepends the `meta.json` block, and formats the result with Prettier.

```bash
npm install
npm run build        # check + build
npm run build:fast   # build only
npm run build:debug  # debug variants only
```

Built scripts are written to `dist/` (`<name>.user.js` plus `<name>-debug.user.js`). The static site lives in `docs/` and is copied into `dist/` by the same build.

## Deploy

`dist/` is published to Cloudflare Pages (`wrangler.toml`). The landing page is a static catalog, and the scripts are plain public files that anyone can load directly. If they must stay private, restrict the deployment itself, for example with a Cloudflare Access policy on the `*.pages.dev` hostname.

## Development

```bash
npm run lint          # eslint
npm run format        # prettier --write .
npm run check         # format check + lint + tests
npm test              # unit tests (node --test)
```
