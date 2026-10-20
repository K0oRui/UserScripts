// ==UserScript==
// @name         SteamDB Emu Tools
// @version      1.1.0
// @description  Adds copy controls to SteamDB DLC, language and achievement sections, with file downloads and achievement icon bundles in Goldberg and STAR formats.
// @author       K0oRui
// @namespace    K0oRui
// @run-at       document-idle
// @match        *://steamdb.info/app/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      cdn.steamstatic.com
// @homepage     https://github.com/K0oRui/UserScripts
// @homepageURL  https://github.com/K0oRui/UserScripts
// @supportURL   https://github.com/K0oRui/UserScripts/issues
// @updateURL    https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/steamdb-emu-tools.user.js
// @downloadURL  https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/steamdb-emu-tools.user.js
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
        const icongray = attr(find(".achievement_image_small"), "data-name");
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
        const icongray = attr(images[1], "data-name");
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
        icon: withDir("icons", e.icon),
        icongray: withDir("icons", e.icongray),
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
  var askAchievementOutput = (label) =>
    askChoice(label, "Download or copy?", [
      { value: "zip", label: "Download with icons" },
      { value: "json", label: "Download JSON" },
      { value: "clipboard", label: "Copy to clipboard" },
    ]);

  // src/steamdb-emu-tools/output.js
  var fileName = (kind, target) => {
    if (kind === "achievements") return "achievements.json";
    if (kind === "languages")
      return target === "star" ? "languages.star" : "supported_languages.txt";
    return null;
  };
  var downloadBlob = (name, blob) => {
    try {
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
  var downloadText = (name, text, type = "text/plain") =>
    downloadBlob(name, new Blob([text], { type }));
  var downloadBytes = (name, bytes, type = "application/zip") =>
    downloadBlob(name, new Blob([bytes], { type }));

  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0, /* unused */
    0, 0, /* impossible */
    0,
  ]);
  var fdeb = new u8([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13, /* unused */
    0, 0,
  ]);
  var clim = new u8([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ]);
  var freb = function (eb, start) {
    var b = new u16(31);
    for (var i2 = 0; i2 < 31; ++i2) {
      b[i2] = start += 1 << eb[i2 - 1];
    }
    var r = new i32(b[30]);
    for (var i2 = 1; i2 < 30; ++i2) {
      for (var j = b[i2]; j < b[i2 + 1]; ++j) {
        r[j] = ((j - b[i2]) << 5) | i2;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  ((fl[28] = 258), (revfl[258] = 28));
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = ((i & 43690) >> 1) | ((i & 21845) << 1);
    x = ((x & 52428) >> 2) | ((x & 13107) << 2);
    x = ((x & 61680) >> 4) | ((x & 3855) << 4);
    rev[i] = (((x & 65280) >> 8) | ((x & 255) << 8)) >> 1;
  }
  var x;
  var i;
  var hMap = function (cd, mb, r) {
    var s = cd.length;
    var i2 = 0;
    var l = new u16(mb);
    for (; i2 < s; ++i2) {
      if (cd[i2]) ++l[cd[i2] - 1];
    }
    var le = new u16(mb);
    for (i2 = 1; i2 < mb; ++i2) {
      le[i2] = (le[i2 - 1] + l[i2 - 1]) << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          var sv = (i2 << 4) | cd[i2];
          var r_1 = mb - cd[i2];
          var v = le[cd[i2] - 1]++ << r_1;
          for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          co[i2] = rev[le[cd[i2] - 1]++] >> (15 - cd[i2]);
        }
      }
    }
    return co;
  };
  var flt = new u8(288);
  for (i = 0; i < 144; ++i) flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i) flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i) flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i) flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i) fdt[i] = 5;
  var i;
  var flm = /* @__PURE__ */ hMap(flt, 9, 0);
  var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
  var shft = function (p) {
    return ((p + 7) / 8) | 0;
  };
  var slc = function (v, s, e) {
    if (s == null || s < 0) s = 0;
    if (e == null || e > v.length) e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    // determined by compression function
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data",
    // determined by unknown compression method
  ];
  var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace) Error.captureStackTrace(e, err);
    if (!nt) throw e;
    return e;
  };
  var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function (d, mb) {
    var t = [];
    for (var i2 = 0; i2 < d.length; ++i2) {
      if (d[i2]) t.push({ s: i2, f: d[i2] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s) return { t: et, l: 0 };
    if (s == 1) {
      var v = new u8(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function (a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0],
      r = t[1],
      i0 = 0,
      i1 = 1,
      i22 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i22].f ? i0++ : i22++];
      r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i2 = 1; i2 < s; ++i2) {
      if (t2[i2].s > maxSym) maxSym = t2[i2].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i2 = 0,
        dt = 0;
      var lft = mbt - mb,
        cst = 1 << lft;
      t2.sort(function (a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (; i2 < s; ++i2) {
        var i2_1 = t2[i2].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << (mbt - tr[i2_1]));
          tr[i2_1] = mb;
        } else break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i2].s;
        if (tr[i2_2] < mb) dt -= 1 << (mb - tr[i2_2]++ - 1);
        else ++i2;
      }
      for (; i2 >= 0 && dt; --i2) {
        var i2_3 = t2[i2].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
  };
  var ln = function (n, l, d) {
    return n.s == -1
      ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
      : (l[n.s] = d);
  };
  var lc = function (c) {
    var s = c.length;
    while (s && !c[--s]);
    var cl = new u16(++s);
    var cli = 0,
      cln = c[0],
      cls = 1;
    var w = function (v) {
      cl[cli++] = v;
    };
    for (var i2 = 1; i2 <= s; ++i2) {
      if (c[i2] == cln && i2 != s) ++cls;
      else {
        if (!cln && cls > 2) {
          for (; cls > 138; cls -= 138) w(32754);
          if (cls > 2) {
            w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          (w(cln), --cls);
          for (; cls > 6; cls -= 6) w(8304);
          if (cls > 2) (w(((cls - 3) << 5) | 8208), (cls = 0));
        }
        while (cls--) w(cln);
        cls = 1;
        cln = c[i2];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function (cf, cl) {
    var l = 0;
    for (var i2 = 0; i2 < cl.length; ++i2) l += cf[i2] * cl[i2];
    return l;
  };
  var wfblk = function (out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i2 = 0; i2 < s; ++i2) out[o + i2 + 4] = dat[i2];
    return (o + 4 + s) * 8;
  };
  var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a2 = hTree(lf, 15),
      dlt = _a2.t,
      mlb = _a2.l;
    var _b2 = hTree(df, 15),
      ddt = _b2.t,
      mdb = _b2.l;
    var _c = lc(dlt),
      lclt = _c.c,
      nlc = _c.n;
    var _d = lc(ddt),
      lcdt = _d.c,
      ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i2 = 0; i2 < lclt.length; ++i2) ++lcfreq[lclt[i2] & 31];
    for (var i2 = 0; i2 < lcdt.length; ++i2) ++lcfreq[lcdt[i2] & 31];
    var _e = hTree(lcfreq, 7),
      lct = _e.t,
      mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc);
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen =
      clen(lf, dlt) +
      clen(df, ddt) +
      eb +
      14 +
      3 * nlcc +
      clen(lcfreq, lct) +
      2 * lcfreq[16] +
      3 * lcfreq[17] +
      7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    (wbits(out, p, 1 + (dtlen < ftlen)), (p += 2));
    if (dtlen < ftlen) {
      ((lm = hMap(dlt, mlb, 0)),
        (ll = dlt),
        (dm = hMap(ddt, mdb, 0)),
        (dl = ddt));
      var llm = hMap(lct, mlcb, 0);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i2 = 0; i2 < nlcc; ++i2) wbits(out, p + 3 * i2, lct[clim[i2]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0; it < 2; ++it) {
        var clct = lcts[it];
        for (var i2 = 0; i2 < clct.length; ++i2) {
          var len = clct[i2] & 31;
          (wbits(out, p, llm[len]), (p += lct[len]));
          if (len > 15)
            (wbits(out, p, (clct[i2] >> 5) & 127), (p += clct[i2] >> 12));
        }
      }
    } else {
      ((lm = flm), (ll = flt), (dm = fdm), (dl = fdt));
    }
    for (var i2 = 0; i2 < li; ++i2) {
      var sym = syms[i2];
      if (sym > 255) {
        var len = (sym >> 18) & 31;
        (wbits16(out, p, lm[len + 257]), (p += ll[len + 257]));
        if (len > 7) (wbits(out, p, (sym >> 23) & 31), (p += fleb[len]));
        var dst = sym & 31;
        (wbits16(out, p, dm[dst]), (p += dl[dst]));
        if (dst > 3) (wbits16(out, p, (sym >> 5) & 8191), (p += fdeb[dst]));
      } else {
        (wbits16(out, p, lm[sym]), (p += ll[sym]));
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([
    65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632,
  ]);
  var et = /* @__PURE__ */ new u8(0);
  var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos) w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13,
        c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768),
        head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3),
        bs2_1 = 2 * bs1_1;
      var hsh = function (i3) {
        return (
          (dat[i3] ^ (dat[i3 + 1] << bs1_1) ^ (dat[i3 + 2] << bs2_1)) & msk_1
        );
      };
      var syms = new i32(25e3);
      var lf = new u16(288),
        df = new u16(32);
      var lc_1 = 0,
        eb = 0,
        i2 = st.i || 0,
        li = 0,
        wi = st.w || 0,
        bs = 0;
      for (; i2 + 2 < s; ++i2) {
        var hv = hsh(i2);
        var imod = i2 & 32767,
          pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i2) {
          var rem = s - i2;
          if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
            ((li = lc_1 = eb = 0), (bs = i2));
            for (var j = 0; j < 286; ++j) lf[j] = 0;
            for (var j = 0; j < 30; ++j) df[j] = 0;
          }
          var l = 2,
            d = 0,
            ch_1 = c,
            dif = (imod - pimod) & 32767;
          if (rem > 2 && hv == hsh(i2 - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i2);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i2 + l] == dat[i2 + l - dif]) {
                var nl = 0;
                for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl);
                if (nl > l) {
                  ((l = nl), (d = dif));
                  if (nl > maxn) break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0; j < mmd; ++j) {
                    var ti = (i2 - dif + j) & 32767;
                    var pti = prev[ti];
                    var cd = (ti - pti) & 32767;
                    if (cd > md) ((md = cd), (pimod = ti));
                  }
                }
              }
              ((imod = pimod), (pimod = prev[imod]));
              dif += (imod - pimod) & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
            var lin = revfl[l] & 31,
              din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i2 + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i2];
            ++lf[dat[i2]];
          }
        }
      }
      for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
        syms[li++] = dat[i2];
        ++lf[dat[i2]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
      if (!lst) {
        st.r = (pos & 7) | (w[(pos / 8) | 0] << 3);
        pos -= 7;
        ((st.h = head), (st.p = prev), (st.i = i2), (st.w = wi));
      }
    } else {
      for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
        var e = i2 + 65535;
        if (e >= s) {
          w[(pos / 8) | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i2, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
  };
  var crct = /* @__PURE__ */ (function () {
    var t = new Int32Array(256);
    for (var i2 = 0; i2 < 256; ++i2) {
      var c = i2,
        k = 9;
      while (--k) c = (c & 1 && -306674912) ^ (c >>> 1);
      t[i2] = c;
    }
    return t;
  })();
  var crc = function () {
    var c = -1;
    return {
      p: function (d) {
        var cr = c;
        for (var i2 = 0; i2 < d.length; ++i2)
          cr = crct[(cr & 255) ^ d[i2]] ^ (cr >>> 8);
        c = cr;
      },
      d: function () {
        return ~c;
      },
    };
  };
  var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u8(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(
      dat,
      opt.level == null ? 6 : opt.level,
      opt.mem == null
        ? st.l
          ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5)
          : 20
        : 12 + opt.mem,
      pre,
      post,
      st,
    );
  };
  var mrg = function (a, b) {
    var o = {};
    for (var k in a) o[k] = a[k];
    for (var k in b) o[k] = b[k];
    return o;
  };
  var wbytes = function (d, b, v) {
    for (; v; ++b) ((d[b] = v), (v >>>= 8));
  };
  function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
  }
  var fltn = function (d, p, t, o) {
    for (var k in d) {
      var val = d[k],
        n = p + k,
        op = o;
      if (Array.isArray(val)) ((op = mrg(o, val[1])), (val = val[0]));
      if (ArrayBuffer.isView(val)) t[n] = [val, op];
      else {
        t[(n += "/")] = [new u8(0), op];
        fltn(val, n, t, o);
      }
    }
  };
  var te =
    typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
  var td =
    typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {}
  function strToU8(str, latin1) {
    if (latin1) {
      var ar_1 = new u8(str.length);
      for (var i2 = 0; i2 < str.length; ++i2) ar_1[i2] = str.charCodeAt(i2);
      return ar_1;
    }
    if (te) return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function (v) {
      ar[ai++] = v;
    };
    for (var i2 = 0; i2 < l; ++i2) {
      if (ai + 5 > ar.length) {
        var n = new u8(ai + 8 + ((l - i2) << 1));
        n.set(ar);
        ar = n;
      }
      var c = str.charCodeAt(i2);
      if (c < 128 || latin1) w(c);
      else if (c < 2048) (w(192 | (c >> 6)), w(128 | (c & 63)));
      else if (c > 55295 && c < 57344)
        ((c = (65536 + (c & (1023 << 10))) | (str.charCodeAt(++i2) & 1023)),
          w(240 | (c >> 18)),
          w(128 | ((c >> 12) & 63)),
          w(128 | ((c >> 6) & 63)),
          w(128 | (c & 63)));
      else (w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63)));
    }
    return slc(ar, 0, ai);
  }
  var exfl = function (ex) {
    var le = 0;
    if (ex) {
      for (var k in ex) {
        var l = ex[k].length;
        if (l > 65535) err(9);
        le += l + 4;
      }
    }
    return le;
  };
  var wzh = function (d, b, f, fn, u, c, ce, co) {
    var fl2 = fn.length,
      ex = f.extra,
      col = co && co.length;
    var exl = exfl(ex);
    (wbytes(d, b, ce != null ? 33639248 : 67324752), (b += 4));
    if (ce != null) ((d[b++] = 20), (d[b++] = f.os));
    ((d[b] = 20), (b += 2));
    ((d[b++] = (f.flag << 1) | (c < 0 && 8)), (d[b++] = u && 8));
    ((d[b++] = f.compression & 255), (d[b++] = f.compression >> 8));
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime),
      y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119) err(10);
    (wbytes(
      d,
      b,
      (y << 25) |
        ((dt.getMonth() + 1) << 21) |
        (dt.getDate() << 16) |
        (dt.getHours() << 11) |
        (dt.getMinutes() << 5) |
        (dt.getSeconds() >> 1),
    ),
      (b += 4));
    if (c != -1) {
      wbytes(d, b, f.crc);
      wbytes(d, b + 4, c < 0 ? -c - 2 : c);
      wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl2);
    (wbytes(d, b + 14, exl), (b += 16));
    if (ce != null) {
      wbytes(d, b, col);
      wbytes(d, b + 6, f.attrs);
      (wbytes(d, b + 10, ce), (b += 14));
    }
    d.set(fn, b);
    b += fl2;
    if (exl) {
      for (var k in ex) {
        var exf = ex[k],
          l = exf.length;
        wbytes(d, b, +k);
        wbytes(d, b + 2, l);
        (d.set(exf, b + 4), (b += 4 + l));
      }
    }
    if (col) (d.set(co, b), (b += col));
    return b;
  };
  var wzf = function (o, b, c, d, e) {
    wbytes(o, b, 101010256);
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
  };
  function zipSync(data, opts) {
    if (!opts) opts = {};
    var r = {};
    var files = [];
    fltn(data, "", r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
      var _a2 = r[fn],
        file = _a2[0],
        p = _a2[1];
      var compression = p.level == 0 ? 0 : 8;
      var f = strToU8(fn),
        s = f.length;
      var com = p.comment,
        m = com && strToU8(com),
        ms = m && m.length;
      var exl = exfl(p.extra);
      if (s > 65535) err(11);
      var d = compression ? deflateSync(file, p) : file,
        l = d.length;
      var c = crc();
      c.p(file);
      files.push(
        mrg(p, {
          size: file.length,
          crc: c.d(),
          c: d,
          f,
          m,
          u: s != fn.length || (m && com.length != ms),
          o,
          compression,
        }),
      );
      o += 30 + s + exl + l;
      tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22),
      oe = o,
      cdl = tot - o;
    for (var i2 = 0; i2 < files.length; ++i2) {
      var f = files[i2];
      wzh(out, f.o, f, f.f, f.u, f.c.length);
      var badd = 30 + f.f.length + exfl(f.extra);
      out.set(f.c, f.o + badd);
      (wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m),
        (o += 16 + badd + (f.m ? f.m.length : 0)));
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
  }

  // src/steamdb-emu-tools/zip.js
  var encoder = new TextEncoder();
  var iconUrl = (appId, name) =>
    `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appId}/${encodeURIComponent(name)}`;
  var requestBytes = (url) =>
    new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          timeout: 2e4,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve(new Uint8Array(res.response));
              return;
            }
            reject(new Error(`HTTP ${res.status}`));
          },
          onerror: () => reject(new Error("Network error")),
          ontimeout: () => reject(new Error("Timed out")),
        });
        return;
      }
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buf) => resolve(new Uint8Array(buf)))
        .catch(reject);
    });
  var mapLimit = async (items, limit, fn) => {
    const results = new Array(items.length);
    let index = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (index < items.length) {
          const current = index++;
          results[current] = await fn(items[current]);
        }
      },
    );
    await Promise.all(workers);
    return results;
  };
  var iconName = (value) => (value || "").split("/").pop();
  var withoutMissingGrays = (json, missing) => {
    if (missing.size === 0) return json;
    try {
      const entries = JSON.parse(json);
      for (const entry of entries) {
        if (entry && missing.has(iconName(entry.icongray))) entry.icongray = "";
      }
      return JSON.stringify(entries, null, 2);
    } catch {
      return json;
    }
  };
  var appIdFromLocation = () =>
    location.pathname.match(/\/app\/(\d+)/)?.[1] ||
    document.querySelector(".scope-app")?.getAttribute("data-appid") ||
    "";
  var buildAchievementZip = async (target, json, entries, appId, fetchIcon) => {
    const root = target === "star" ? "STAR" : "steam_settings";
    const iconDir = target === "star" ? "icons" : "images";
    const mainNames = /* @__PURE__ */ new Set();
    const grayNames = /* @__PURE__ */ new Set();
    const names = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const icon = iconName(entry.icon);
      const gray = iconName(entry.icongray);
      if (icon) {
        mainNames.add(icon);
        names.add(icon);
      }
      if (gray) {
        grayNames.add(gray);
        names.add(gray);
      }
    }
    if (names.size > 0 && !appId) throw new Error("Missing app id");
    const getIcon = fetchIcon || ((name) => requestBytes(iconUrl(appId, name)));
    const fetched = /* @__PURE__ */ new Map();
    const failed = /* @__PURE__ */ new Map();
    await mapLimit([...names], 6, async (name) => {
      try {
        fetched.set(name, await getIcon(name));
      } catch (error) {
        failed.set(name, error);
      }
    });
    const missing = /* @__PURE__ */ new Set();
    for (const [name, error] of failed) {
      if (grayNames.has(name) && !mainNames.has(name)) {
        missing.add(name);
        continue;
      }
      throw error;
    }
    const zipJson = withoutMissingGrays(json, missing);
    const files = {
      [`${root}/`]: new Uint8Array(0),
      [`${root}/achievements.json`]: [encoder.encode(zipJson), { level: 6 }],
      [`${root}/${iconDir}/`]: new Uint8Array(0),
    };
    for (const [name, bytes] of fetched) {
      files[`${root}/${iconDir}/${name}`] = [bytes, { level: 0 }];
    }
    return zipSync(files);
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
  var flash = (btn, text, revert, ms = 2e3) => {
    const label = btn.querySelector(".steamdb-emu-tools-btn-label");
    if (label) label.textContent = text;
    else btn.textContent = text;
    clearTimeout(btn._steamdbEmuFlash);
    btn._steamdbEmuFlash = setTimeout(() => {
      if (label) label.textContent = revert;
      else btn.textContent = revert;
    }, ms);
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
      const output = await askAchievementOutput("Copy achievements");
      if (!output) return;
      const text =
        target === "star"
          ? formatAchievementsStar(entries)
          : formatAchievementsGoldberg(entries);
      if (output === "json") {
        const name = fileName("achievements", target);
        const ok2 = downloadText(name, text, "application/json");
        flash(
          btn,
          ok2 ? `Saved ${name}` : "Download failed",
          "Copy achievements",
        );
        return;
      }
      if (output === "zip") {
        flash(btn, "Bundling icons...", "Copy achievements", 3e5);
        try {
          const zip = await buildAchievementZip(
            target,
            text,
            entries,
            appIdFromLocation(),
          );
          const ok2 = downloadBytes("achievements.zip", zip);
          flash(
            btn,
            ok2 ? "Saved achievements.zip" : "Download failed",
            "Copy achievements",
          );
        } catch {
          flash(btn, "Icon download failed", "Copy achievements");
        }
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
