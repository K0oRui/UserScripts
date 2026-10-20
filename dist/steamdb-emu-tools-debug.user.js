// ==UserScript==
// @name         SteamDB Emu Tools Debug
// @version      1.0.0
// @description  Adds copy controls to SteamDB DLC, language and achievement sections, with file downloads for languages and achievements in Goldberg and STAR formats. (debug build)
// @author       K0oRui
// @namespace    K0oRui
// @run-at       document-idle
// @match        *://steamdb.info/app/*
// @grant        GM_setClipboard
// @homepage     https://github.com/K0oRui/UserScripts
// @homepageURL  https://github.com/K0oRui/UserScripts
// @supportURL   https://github.com/K0oRui/UserScripts/issues
// @updateURL    https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/steamdb-emu-tools-debug.user.js
// @downloadURL  https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/steamdb-emu-tools-debug.user.js
// ==/UserScript==

(() => {
  // src/steamdb-emu-tools/dlc.js
  var parseDlcRows = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    const rows = root.querySelectorAll("#dlc tbody tr.app, #dlc tbody tr");
    return Array.from(rows)
      .map((tr) => {
        const getAttr = (name2) =>
          typeof tr.getAttribute === "function"
            ? tr.getAttribute(name2)
            : (tr.dataset?.[name2.replace("data-", "")] ?? null);
        const fromData = getAttr("data-appid");
        const link =
          typeof tr.querySelector === "function"
            ? tr.querySelector('td:first-child a[href*="/app/"]')
            : null;
        const href = link?.getAttribute
          ? link.getAttribute("href")
          : (link?.href ?? "");
        const fromHref = (href || "").match(/\/app\/(\d+)/)?.[1] ?? null;
        const id = (
          fromData ||
          fromHref ||
          link?.textContent?.trim() ||
          ""
        ).trim();
        const cells =
          typeof tr.querySelectorAll === "function"
            ? tr.querySelectorAll("td")
            : [];
        const name = (cells[1]?.textContent || "").replace(/\s+/g, " ").trim();
        if (!/^\d+$/.test(id || "") || !name) return null;
        return { id, name };
      })
      .filter(Boolean);
  };
  var formatDlcGoldberg = (entries) =>
    entries.map((e) => `${e.id}=${e.name}`).join("\n");
  var formatDlcStar = (entries) =>
    entries.map((e) => `dlc.${e.id} = ${e.name}`).join("\n");

  // src/steamdb-emu-tools/langs.js
  var LANG_MAP = {
    english: "english",
    french: "french",
    italian: "italian",
    german: "german",
    "spanish - spain": "spanish",
    spanish: "spanish",
    japanese: "japanese",
    korean: "koreana",
    polish: "polish",
    "portuguese - brazil": "brazilian",
    "brazilian portuguese": "brazilian",
    portuguese: "portuguese",
    russian: "russian",
    "simplified chinese": "schinese",
    "spanish - latin america": "latam",
    thai: "thai",
    "traditional chinese": "tchinese",
    arabic: "arabic",
    dutch: "dutch",
    danish: "danish",
    finnish: "finnish",
    norwegian: "norwegian",
    swedish: "swedish",
    turkish: "turkish",
    ukrainian: "ukrainian",
    vietnamese: "vietnamese",
    indonesian: "indonesian",
    greek: "greek",
    czech: "czech",
    hungarian: "hungarian",
    romanian: "romanian",
    catalan: "catalan",
  };
  var normalizeLang = (name) => {
    const key = (name || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (LANG_MAP[key]) return LANG_MAP[key];
    return key.replace(/[^a-z]/g, "");
  };
  var parseLangRows = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    const heading = Array.from(root.querySelectorAll("h2")).find((h) =>
      /supported languages/i.test(h.textContent || ""),
    );
    if (!heading) return [];
    let table = heading.nextElementSibling;
    while (table && table.tagName !== "TABLE") table = table.nextElementSibling;
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr"))
      .map((tr) => {
        const first = tr.querySelector
          ? tr.querySelector("td")
          : tr.querySelectorAll?.()[0];
        const name = (first?.textContent || "").replace(/\s+/g, " ").trim();
        if (!name) return null;
        return normalizeLang(name);
      })
      .filter(Boolean);
  };
  var formatLangGoldberg = (langs) => langs.join("\n");
  var formatLangStar = formatLangGoldberg;

  // src/steamdb-emu-tools/achievements.js
  var clean = (text) => (text || "").replace(/\s+/g, " ").trim();
  var attr = (el, name) =>
    (el && typeof el.getAttribute === "function"
      ? el.getAttribute(name)
      : null) || "";
  var withDir = (dir, file) => (file ? `${dir}/${file}` : "");
  var directText = (cell) => {
    if (!cell) return "";
    const parts = [];
    for (const node of cell.childNodes || []) {
      if (node.nodeType === 3) parts.push(node.textContent || "");
    }
    return clean(parts.join(" "));
  };
  var grayName = (icon, gray) =>
    gray || (icon ? icon.replace(/(\.[^.]+)?$/, "_gray$1") : "");
  var parseCards = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    const cards = root.querySelectorAll("#js-achievements .achievement");
    return Array.from(cards)
      .map((card) => {
        const find = (sel) =>
          card && typeof card.querySelector === "function"
            ? card.querySelector(sel)
            : null;
        const name = clean(find(".achievement_api")?.textContent);
        const displayName = clean(find(".achievement_name")?.textContent);
        const desc = find(".achievement_desc");
        const descText = clean(desc?.textContent);
        const marker = desc?.querySelector?.("i");
        const hidden =
          /hidden achievement/i.test(marker?.textContent || "") ||
          /^hidden achievement/i.test(descText);
        const spoiler = clean(
          desc?.querySelector?.(".achievement_spoiler")?.textContent,
        );
        const description = hidden
          ? spoiler || clean(descText.replace(/^hidden achievement:?\s*/i, ""))
          : descText;
        const icon = attr(find(".achievement_image"), "data-name");
        const icongray = grayName(
          icon,
          attr(find(".achievement_image_small"), "data-name"),
        );
        if (!name || !displayName) return null;
        return {
          name,
          displayName,
          description,
          hidden: hidden ? "1" : "0",
          icon,
          icongray,
        };
      })
      .filter(Boolean);
  };
  var parseTable = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    const rows = root.querySelectorAll("#js-achievements table tbody tr");
    return Array.from(rows)
      .map((tr) => {
        const cells =
          typeof tr.querySelectorAll === "function"
            ? tr.querySelectorAll("td")
            : [];
        const name = clean(cells[0]?.textContent);
        const cell = cells[1];
        const p =
          cell && typeof cell.querySelector === "function"
            ? cell.querySelector("p")
            : null;
        const pText = clean(p?.textContent);
        const hiddenMatch = pText.match(/^hidden\.?\s*/i);
        const hidden = hiddenMatch ? "1" : "0";
        const description = hiddenMatch
          ? clean(pText.slice(hiddenMatch[0].length))
          : pText;
        const displayName =
          directText(cell) ||
          clean((cell?.textContent || "").replace(pText, ""));
        const iconCell = cells[2];
        const images =
          iconCell && typeof iconCell.querySelectorAll === "function"
            ? iconCell.querySelectorAll("img")
            : [];
        const icon = attr(images[0], "data-name");
        const icongray = grayName(icon, attr(images[1], "data-name"));
        if (!name || !displayName || images.length === 0) return null;
        return { name, displayName, description, hidden, icon, icongray };
      })
      .filter(Boolean);
  };
  var parseAchievementRows = (root) => {
    const cards = parseCards(root);
    return cards.length > 0 ? cards : parseTable(root);
  };
  var formatAchievementsGoldberg = (entries) =>
    JSON.stringify(
      entries.map((e) => ({
        description: e.description,
        displayName: e.displayName,
        hidden: e.hidden,
        icon: withDir("images", e.icon),
        icongray: withDir("images", e.icongray),
        name: e.name,
      })),
      null,
      2,
    );
  var formatAchievementsStar = (entries) =>
    JSON.stringify(
      entries.map((e) => ({
        name: e.name,
        displayName: e.displayName,
        description: e.description,
        icon: withDir("Icons", e.icon),
        icongray: withDir("Icons", e.icongray),
        hidden: e.hidden,
      })),
      null,
      2,
    );

  // src/steamdb-emu-tools/popup.js
  var askChoice = (label, subtitleText, choices) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "steamdb-copy-target-overlay";
      overlay.className = "steamdb-emu-tools-overlay";
      const box = document.createElement("div");
      box.className = "panel steamdb-emu-tools-dialog";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-labelledby", "steamdb-emu-tools-dialog-title");
      const title = document.createElement("div");
      title.id = "steamdb-emu-tools-dialog-title";
      title.className = "panel-heading";
      title.textContent = label;
      const subtitle = document.createElement("p");
      subtitle.className = "muted steamdb-emu-tools-dialog-subtitle";
      subtitle.textContent = subtitleText;
      const actions = document.createElement("div");
      actions.className = "steamdb-emu-tools-dialog-actions";
      const cleanup = () => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          cleanup();
          resolve(null);
        }
      };
      const pick = (choice) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn";
        b.textContent = choice.label;
        b.addEventListener("click", () => {
          cleanup();
          resolve(choice.value);
        });
        return b;
      };
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-outline btn-block";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        cleanup();
        resolve(null);
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });
      document.addEventListener("keydown", onKey);
      for (const choice of choices) actions.appendChild(pick(choice));
      actions.appendChild(cancel);
      box.appendChild(title);
      box.appendChild(subtitle);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      actions.querySelector?.(".btn")?.focus();
    });
  var askTarget = (label) =>
    askChoice(label, "Goldberg or STAR?", [
      { value: "goldberg", label: "Goldberg" },
      { value: "star", label: "STAR" },
    ]);
  var askOutput = (label) =>
    askChoice(label, "File or clipboard?", [
      { value: "file", label: "Download file" },
      { value: "clipboard", label: "Copy to clipboard" },
    ]);

  // src/steamdb-emu-tools/output.js
  var fileName = (kind, target) => {
    if (kind === "achievements") return "achievements.json";
    if (kind === "languages")
      return target === "star" ? "languages.star" : "supported_languages.txt";
    return null;
  };
  var downloadText = (name, text, type = "text/plain") => {
    try {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      return true;
    } catch {
      return false;
    }
  };

  // src/steamdb-emu-tools/styles.js
  var CSS = `
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
`;
  var ensureStyles = () => {
    if (document.getElementById("steamdb-emu-tools-style")) return;
    const style = document.createElement("style");
    style.id = "steamdb-emu-tools-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  };

  // src/steamdb-emu-tools/main.js
  var DLC_BUTTON_ID = "steamdb-emu-tools-dlc-btn";
  var LANG_BUTTON_ID = "steamdb-emu-tools-lang-btn";
  var ACH_BUTTON_ID = "steamdb-emu-tools-ach-btn";
  var copyText = async (text) => {
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text);
        return true;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  };
  var COPY_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-copy" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
  var makeButton = (id, label) => {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "btn btn-outline steamdb-emu-tools-btn";
    btn.innerHTML = `${COPY_ICON}<span class="steamdb-emu-tools-btn-label"></span>`;
    btn.querySelector(".steamdb-emu-tools-btn-label").textContent = label;
    return btn;
  };
  var flash = (btn, text, revert) => {
    const label = btn.querySelector(".steamdb-emu-tools-btn-label");
    if (label) label.textContent = text;
    else btn.textContent = text;
    setTimeout(() => {
      if (label) label.textContent = revert;
      else btn.textContent = revert;
    }, 2e3);
  };
  var mountDlcButton = () => {
    if (document.getElementById(DLC_BUTTON_ID)) return;
    const heading = document.querySelector("#dlc h2");
    const table = document.querySelector("#dlc table");
    if (!heading || !table) return;
    const btn = makeButton(DLC_BUTTON_ID, "Copy DLC list");
    btn.addEventListener("click", async () => {
      const entries = parseDlcRows(document);
      if (entries.length === 0) {
        flash(btn, "No DLC rows found", "Copy DLC list");
        return;
      }
      const target = await askTarget("Copy DLC list");
      if (!target) return;
      const text =
        target === "star" ? formatDlcStar(entries) : formatDlcGoldberg(entries);
      const ok = await copyText(text);
      flash(
        btn,
        ok ? `Copied ${entries.length} lines (${target})` : "Copy failed",
        "Copy DLC list",
      );
    });
    heading.classList.add("steamdb-emu-tools-heading");
    heading.appendChild(btn);
  };
  var mountLangButton = () => {
    if (document.getElementById(LANG_BUTTON_ID)) return;
    const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
      /supported languages/i.test(h.textContent || ""),
    );
    if (!heading) return;
    let table = heading.nextElementSibling;
    while (table && table.tagName !== "TABLE") table = table.nextElementSibling;
    if (!table) return;
    const btn = makeButton(LANG_BUTTON_ID, "Copy languages");
    btn.addEventListener("click", async () => {
      const langs = parseLangRows(document);
      if (langs.length === 0) {
        flash(btn, "No languages found", "Copy languages");
        return;
      }
      const target = await askTarget("Copy languages");
      if (!target) return;
      const output = await askOutput("Copy languages");
      if (!output) return;
      const text =
        target === "star" ? formatLangStar(langs) : formatLangGoldberg(langs);
      if (output === "file") {
        const name = fileName("languages", target);
        const ok2 = downloadText(name, text, "text/plain");
        flash(btn, ok2 ? `Saved ${name}` : "Download failed", "Copy languages");
        return;
      }
      const ok = await copyText(text);
      flash(
        btn,
        ok ? `Copied ${langs.length} lines (${target})` : "Copy failed",
        "Copy languages",
      );
    });
    heading.classList.add("steamdb-emu-tools-heading");
    heading.appendChild(btn);
  };
  var mountAchievementsButton = () => {
    if (document.getElementById(ACH_BUTTON_ID)) return;
    const container = document.querySelector("#js-achievements");
    if (!container) return;
    const heading =
      container.querySelector("h2") ||
      container.previousElementSibling?.querySelector?.("h2") ||
      container.parentElement?.querySelector?.("h2");
    if (!heading) return;
    const btn = makeButton(ACH_BUTTON_ID, "Copy achievements");
    btn.addEventListener("click", async () => {
      const entries = parseAchievementRows(document);
      if (entries.length === 0) {
        flash(btn, "No achievements found", "Copy achievements");
        return;
      }
      const target = await askTarget("Copy achievements");
      if (!target) return;
      const output = await askOutput("Copy achievements");
      if (!output) return;
      const text =
        target === "star"
          ? formatAchievementsStar(entries)
          : formatAchievementsGoldberg(entries);
      if (output === "file") {
        const name = fileName("achievements", target);
        const ok2 = downloadText(name, text, "application/json");
        flash(
          btn,
          ok2 ? `Saved ${name}` : "Download failed",
          "Copy achievements",
        );
        return;
      }
      const ok = await copyText(text);
      flash(
        btn,
        ok
          ? `Copied ${entries.length} achievements (${target})`
          : "Copy failed",
        "Copy achievements",
      );
    });
    const header = heading.closest(".achievements-header");
    const group = header?.querySelector(":scope > div");
    if (group) {
      group.appendChild(btn);
    } else {
      heading.classList.add("steamdb-emu-tools-heading");
      heading.appendChild(btn);
    }
  };
  var achObserver = null;
  var watchAchievements = () => {
    const container = document.querySelector("#js-achievements");
    if (!container || achObserver) return;
    achObserver = new MutationObserver(() => mountAchievementsButton());
    achObserver.observe(container, { childList: true, subtree: true });
  };
  var mountAll = () => {
    ensureStyles();
    mountDlcButton();
    mountLangButton();
    mountAchievementsButton();
    watchAchievements();
  };
  var hasTarget = () =>
    Boolean(
      document.querySelector("#dlc") ||
      document.querySelector("#js-achievements") ||
      Array.from(document.querySelectorAll("h2")).some((h) =>
        /supported languages/i.test(h.textContent || ""),
      ),
    );
  if (hasTarget()) {
    mountAll();
  } else {
    const observer = new MutationObserver(() => {
      if (hasTarget()) {
        mountAll();
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => observer.disconnect(), 1e4);
  }
})();
