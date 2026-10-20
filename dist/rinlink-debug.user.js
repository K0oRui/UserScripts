// ==UserScript==
// @name         RINLink Debug
// @version      1.0.0
// @description  Adds CS.RIN.RU topic links to Steam, SteamDB and PCGamingWiki. (debug build)
// @author       K0oRui
// @namespace    K0oRui
// @run-at       document-idle
// @match        *://store.steampowered.com/app/*
// @match        *://steamdb.info/app/*
// @match        *://www.pcgamingwiki.com/wiki/*
// @match        *://cs.rin.ru/*
// @icon         https://i.ibb.co/p1k6cq6/image.png
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @homepage     https://github.com/K0oRui/UserScripts
// @homepageURL  https://github.com/K0oRui/UserScripts
// @supportURL   https://github.com/K0oRui/UserScripts/issues
// @updateURL    https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/rinlink-debug.user.js
// @downloadURL  https://github.com/K0oRui/UserScripts/raw/refs/heads/master/dist/rinlink-debug.user.js
// @connect      cs.rin.ru
// ==/UserScript==

(() => {
  // src/rinlink/config.js
  var CFG = {
    IMAGE: "https://i.ibb.co/p1k6cq6/image.png",
    LABEL: "View on CS.RIN.RU",
    BASE_URL: "https://cs.rin.ru/forum/",
    LOGIN_URL: "https://cs.rin.ru/forum/ucp.php?mode=login",
    FORUM_ID: 10,
    BLOCK_SIGNALS: [
      "Security check",
      "CS RIN - Security check",
      "CS RIN - Unauthorized",
      "securitytoken_expiration",
      "Just a moment...",
      "Checking your browser",
      "cf-browser-verification",
      "challenge-platform",
    ],
    TAG_BLACKLIST: /^(go to page.*|info|locked|\d+)$/i,
    BYPASS_POLL_MS: 500,
    BYPASS_TIMEOUT: 6e4,
    CREATE_URL: "https://cs.rin.ru/forum/posting.php?mode=post&f=10",
    LOG_LEVEL: "info",
    XHR_TIMEOUT_MS: 8e3,
    XHR_CONCURRENCY: 6,
    SEARCH_COOLDOWN_MS: 4e3,
    CACHE_TTL: 24 * 60 * 60 * 1e3,
    CACHE_KEY: (id) => `rin:cache:${id}`,
  };

  // src/rinlink/core/logger.js
  var LOG_LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, none: 5 };
  var _scriptStart = Date.now();
  var _ring = Array.from({ length: 200 });
  var _ringIdx = 0;
  function _ts() {
    const elapsed = Date.now() - _scriptStart;
    return (elapsed / 1e3).toFixed(1).padStart(5) + "s";
  }
  function _write(level, args) {
    const prefix = `[RIN] [${level}]`;
    _ring[_ringIdx] = {
      level,
      ts: _ts(),
      msg: args
        .map((a) => (typeof a === "object" ? safeStr(a) : String(a)))
        .join(" "),
    };
    _ringIdx = (_ringIdx + 1) % _ring.length;
    switch (level) {
      case "error":
        console.error(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      default:
        console.log(prefix, ...args);
        break;
    }
  }
  function safeStr(o) {
    if (o instanceof Error)
      return `${o.name}: ${o.message}${
        o.stack
          ? `
${o.stack}`
          : ""
      }`;
    try {
      return JSON.stringify(o);
    } catch {
      return String(o);
    }
  }
  function readLogBuffer() {
    const entries = [];
    for (let i = 0; i < _ring.length; i++) {
      const e = _ring[(_ringIdx + i) % _ring.length];
      if (e) entries.push(e);
    }
    return entries;
  }
  var log = {
    trace: (...a) => {
      if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.trace) _write("trace", a);
    },
    debug: (...a) => {
      if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.debug) _write("debug", a);
    },
    info: (...a) => {
      if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.info) _write("info", a);
    },
    warn: (...a) => {
      if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.warn) _write("warn", a);
    },
    error: (...a) => {
      if (LOG_LEVELS[CFG.LOG_LEVEL] <= LOG_LEVELS.error) _write("error", a);
    },
    dump() {
      const entries = readLogBuffer();
      console.groupCollapsed("[RIN] log buffer (last " + entries.length + ")");
      for (const e of entries) console.log(`[${e.level}] ${e.ts}  ${e.msg}`);
      console.groupEnd();
    },
  };

  // src/rinlink/core/storage.js
  function createStorage(backend) {
    const store = backend ?? {
      get: (key, def) => {
        try {
          return GM_getValue(key, def);
        } catch (_) {
          return def;
        }
      },
      set: (key, value) => {
        try {
          GM_setValue(key, value);
        } catch (_) {}
      },
      delete: (key) => {
        try {
          GM_deleteValue(key);
        } catch (_) {}
      },
      keys: () => {
        try {
          return Array.from(GM_listValues());
        } catch (_) {
          return [];
        }
      },
    };
    return {
      get: (key, def) => store.get(key, def),
      set: (key, value) => store.set(key, value),
      delete: (key) => store.delete(key),
      keys: () => store.keys?.() ?? [],
    };
  }

  // src/rinlink/core/cache.js
  var CACHE_VERSION = 2;
  function createCache({ storage: storage2, cfg }) {
    const read = (key) => {
      const raw = storage2.get(key, null);
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    };
    return {
      get(appId) {
        try {
          const key = cfg.CACHE_KEY(appId);
          const entry = read(key);
          if (!entry) return null;
          if (
            entry.v !== CACHE_VERSION ||
            Date.now() - (entry.ts || 0) > cfg.CACHE_TTL
          ) {
            storage2.delete(key);
            return null;
          }
          return entry;
        } catch (_) {
          return null;
        }
      },
      set(appId, data) {
        try {
          storage2.set(
            cfg.CACHE_KEY(appId),
            JSON.stringify({ ...data, v: CACHE_VERSION, ts: Date.now() }),
          );
        } catch (_) {}
      },
      clear(appId) {
        try {
          storage2.delete(cfg.CACHE_KEY(appId));
        } catch (_) {}
      },
      prune() {
        const prefix = cfg.CACHE_KEY("");
        try {
          for (const key of storage2.keys()) {
            if (!key?.startsWith(prefix)) continue;
            const entry = read(key);
            if (
              entry?.v !== CACHE_VERSION ||
              Date.now() - (entry?.ts || 0) > cfg.CACHE_TTL
            )
              storage2.delete(key);
          }
        } catch (_) {}
      },
    };
  }

  // src/rinlink/core/parsing.js
  function parseTopics(raw) {
    if (!raw) return [];
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      return [...doc.querySelectorAll('a[class~="topictitle"]')];
    } catch (e) {
      log.error("parseTopics:", e);
      return [];
    }
  }

  // src/rinlink/core/xhr.js
  function detectBlocked(status, body, signals) {
    const text = body ?? "";
    if (status === 403 || status === 401) return true;
    if (signals.some((s) => text.toLowerCase().includes(s.toLowerCase())))
      return true;
    if (!text.includes("pagecontent") && !text.includes("wrapcentre"))
      return true;
    return false;
  }
  var RE_LOGIN_REQUIRED =
    /(?:must|need to|have to) (?:be )?log(?:ged)? ?in|only registered users|log(?:ged)? ?in to (?:search|view|access)/i;
  function detectGuest(body) {
    const text = body ?? "";
    if (!text) return false;
    if (RE_LOGIN_REQUIRED.test(text)) return true;
    return (
      /ucp\.php\?mode=login/i.test(text) && !/ucp\.php\?mode=logout/i.test(text)
    );
  }
  function createXhr(cfg) {
    let _active = 0;
    const _queue = [];
    const request = (url, callback) => {
      if (_active >= cfg.XHR_CONCURRENCY) {
        _queue.push({ url, callback });
        return;
      }
      _active++;
      const done = (blocked, topics, raw, transport = false, guest = false) => {
        _active--;
        if (_queue.length) {
          const n = _queue.shift();
          request(n.url, n.callback);
        }
        callback(blocked, topics, raw, transport, guest);
      };
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          withCredentials: true,
          timeout: cfg.XHR_TIMEOUT_MS,
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": navigator.language || "en-US,en;q=0.5",
            Referer: cfg.BASE_URL,
            DNT: "1",
            "Sec-GPC": "1",
          },
          ontimeout() {
            log.warn("XHR timeout");
            done(false, [], "", true);
          },
          onabort() {
            done(false, [], "", true);
          },
          onload(r) {
            const raw = r.responseText ?? "";
            try {
              const guest = detectGuest(raw);
              if (detectBlocked(r.status, raw, cfg.BLOCK_SIGNALS)) {
                done(true, [], raw, false, guest);
                return;
              }
              done(false, parseTopics(raw), raw, false, guest);
            } catch (e) {
              log.error("Parse error:", e);
              done(false, [], raw);
            }
          },
          onerror() {
            log.warn("Network error");
            done(false, [], "", true);
          },
        });
      } catch (e) {
        log.error("GM_xmlhttpRequest error:", e);
        done(false, [], "", true);
      }
    };
    return { request };
  }

  // src/rinlink/core/bypass.js
  var MAX_ATTEMPTS = 2;
  function createBypass({
    storage: storage2,
    cfg,
    openTab: openTab2,
    xhr: xhr2,
  }) {
    const runBypass = (url, callback) => {
      let attempts = 0;
      const attempt = () => {
        if (attempts >= MAX_ATTEMPTS) {
          log.warn("Bypass attempts exhausted — giving up.");
          callback([], false, false);
          return;
        }
        attempts++;
        const LOCK_TTL = 9e4;
        const JITTER_MS = Math.floor(Math.random() * 600);
        setTimeout(() => {
          const lock = parseInt(storage2.get("rin:bypass_lock", "0"), 10);
          const age = Date.now() - lock;
          if (lock && age < LOCK_TTL) {
            log.info(
              `Bypass lock held by another tab (${Math.round(age / 1e3)}s) — waiting...`,
            );
            const waitStart = Date.now();
            const waiter = setInterval(() => {
              const nowLock = parseInt(
                storage2.get("rin:bypass_lock", "0"),
                10,
              );
              const lockReleased = !nowLock || Date.now() - nowLock >= LOCK_TTL;
              const waitedTooLong = Date.now() - waitStart >= LOCK_TTL;
              if (!lockReleased && !waitedTooLong) return;
              clearInterval(waiter);
              log.info(
                lockReleased
                  ? "Bypass lock released — retrying XHR."
                  : "Gave up waiting — retrying XHR anyway.",
              );
              xhr2.request(url, (blocked, topics, _raw, _transport, guest) => {
                if (!blocked) {
                  callback(topics, true, guest);
                  return;
                }
                log.info(
                  "Still blocked after waiting — opening our own bypass tab.",
                );
                attempt();
              });
            }, cfg.BYPASS_POLL_MS);
            return;
          }
          storage2.set("rin:bypass_lock", String(Date.now()));
          log.info("Opening bypass tab (lock claimed)...");
          const tab = openTab2(cfg.BASE_URL + "?rin-bypass=1", {
            active: false,
            insert: true,
          });
          const releaseLock = () => storage2.set("rin:bypass_lock", "0");
          const sendStatus = (msg, done2 = false, ok = true) => {
            try {
              storage2.set(
                "rin:status",
                JSON.stringify({
                  message: msg,
                  done: done2,
                  ok,
                  t: Date.now(),
                }),
              );
            } catch (_) {}
          };
          if (!tab) {
            releaseLock();
            log.warn("GM_openInTab failed.");
            callback([], false, false);
            return;
          }
          sendStatus("Waiting for security check...");
          let done = false;
          const started = Date.now();
          let polls = 0;
          const finish = (ok, topics, guest = false) => {
            if (done) return;
            done = true;
            clearInterval(poll);
            releaseLock();
            if (ok) {
              log.info(
                `Bypass OK: ${((Date.now() - started) / 1e3).toFixed(1)}s, ${topics.length} result(s)`,
              );
              sendStatus("Access verified — closing tab.", true, true);
              setTimeout(() => {
                try {
                  tab.close();
                } catch (_) {}
              }, 1e3);
              callback(topics, true, guest);
            } else {
              sendStatus("Verification failed.", true, false);
              callback([], false, false);
            }
          };
          const poll = setInterval(() => {
            if (done) return;
            if (tab.closed) {
              done = true;
              clearInterval(poll);
              releaseLock();
              log.warn("Bypass tab closed");
              callback([], false, false);
              return;
            }
            if (Date.now() - started >= cfg.BYPASS_TIMEOUT) {
              done = true;
              clearInterval(poll);
              releaseLock();
              sendStatus("Timed out.", true, false);
              setTimeout(() => {
                try {
                  tab.close();
                } catch (_) {}
              }, 3e3);
              log.warn("Bypass timed out");
              callback([], false, false);
              return;
            }
            const clearedRaw = storage2.get("rin:cleared", "");
            const clearedTs = parseInt(clearedRaw, 10);
            const cleared =
              clearedRaw && !Number.isNaN(clearedTs) && clearedTs >= started;
            polls++;
            if (!cleared && polls % 3 !== 0) return;
            xhr2.request(
              url,
              (stillBlocked, topics, _raw, transport, guest) => {
                if (done) return;
                if (transport) return;
                if (stillBlocked && !cleared) return;
                if (!stillBlocked) {
                  finish(true, topics, guest);
                } else {
                  xhr2.request(url, (b2, t2, _raw2, transport2, guest2) => {
                    if (transport2) return;
                    if (!b2) finish(true, t2, guest2);
                    else {
                      finish(false, []);
                      log.warn("Still blocked after bypass");
                    }
                  });
                }
              },
            );
          }, cfg.BYPASS_POLL_MS);
        }, JITTER_MS);
      };
      attempt();
    };
    return { run: runBypass };
  }

  // src/rinlink/utils.js
  var extractAppId = (url) => (url || "").match(/\/app\/(\d+)/)?.[1] ?? null;
  var sanitiseKw = (kw) => {
    if (!kw) return "";
    if (/^\d+$/.test(kw)) return kw;
    try {
      return kw
        .normalize("NFC")
        .replace(/[^\w\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return String(kw)
        .replace(/[^\w\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  };
  var buildSearchUrl = (kw) =>
    `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(sanitiseKw(kw))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=firstpost`;
  var buildTitleUrl = (kw) => {
    const words = sanitiseKw(kw).split(/\s+/).filter(Boolean).slice(0, 10);
    return `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(words.join(" "))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=titleonly`;
  };
  var resolveTopicUrl = (href) => {
    if (!href) return CFG.CREATE_URL;
    const clean = href.split("&hilit")[0];
    if (clean.startsWith("http://") || clean.startsWith("https://"))
      return clean;
    const rel = clean.startsWith("/")
      ? clean.slice(1)
      : clean.startsWith("./")
        ? clean.slice(2)
        : clean;
    return CFG.BASE_URL + rel;
  };
  var tagColor = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${Math.abs(h % 360)}, 70%, 60%)`;
  };

  // src/rinlink/core/normalise.js
  function normalise(str) {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u00ae\u2122\u00a9]/g, "")
      .replace(/[\u0027\u2018\u2019\u02bc\u02b9\u0060\u00b4\uff07]/g, "")
      .replace(
        /[\u0022\u201c\u201d\u201e\u201f\u2010-\u2015\u2212\u002d]/g,
        " ",
      )
      .replace(/[|\\/#]/g, " ")
      .replace(/[^a-z0-9 ]/gi, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\bver(sion)?\b/g, "edition")
      .replace(/\bed\b/g, "edition");
  }
  var STOP_WORDS = /* @__PURE__ */ new Set([
    "the",
    "a",
    "an",
    "of",
    "in",
    "on",
    "and",
    "or",
    "to",
    "for",
    "is",
    "at",
  ]);
  var SEQUEL_NUMS = /* @__PURE__ */ new Set([
    "ii",
    "iii",
    "iv",
    "vi",
    "vii",
    "viii",
    "ix",
    "xi",
    "xii",
  ]);
  var RE_DIGIT = /^\d+$/;
  var RE_CLEAN_SFX = /^[\s[]*(?:\[[^\]]*\][\s[]*)*$/;
  var RE_SEQUEL_SFX = /^\s+(?:\d+|[ivxlcdm]+)\s*$/i;
  var sigWords = (norm) =>
    norm
      .split(" ")
      .filter((w) => (w.length > 1 || RE_DIGIT.test(w)) && !STOP_WORDS.has(w));
  var isCleanSuffix = (after) => RE_CLEAN_SFX.test(after);
  var isSequelSuffix = (after) => {
    if (!RE_SEQUEL_SFX.test(after)) return false;
    const t = after.trim().toLowerCase();
    return RE_DIGIT.test(t) || SEQUEL_NUMS.has(t);
  };
  function getTopicText(el) {
    if (!el) return "";
    const direct = (el.textContent ?? "").trim();
    if (direct) return direct;
    try {
      const parts = [];
      (function walk(n) {
        if (n.nodeType === 3) parts.push(n.nodeValue);
        else if (n.nodeType === 1) for (const c of n.childNodes) walk(c);
      })(el);
      const w = parts.join("").trim();
      if (w) return w.replace(/\s+/g, " ");
    } catch (_) {}
    return (el.innerHTML ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&(?:nbsp|#\d+|\w+);/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // src/rinlink/core/scoring.js
  function scoreTopic(topicTitle, appName, _normName) {
    if (!appName) return 0;
    const normTitle = normalise(topicTitle);
    const normName = _normName ?? normalise(appName);
    if (!normName) return 0;
    if (normTitle === normName) return 100;
    if (normTitle.startsWith(normName)) {
      const sfx = normTitle.slice(normName.length);
      if (isCleanSuffix(sfx)) return 80;
      if (isSequelSuffix(sfx)) return 40;
      return 70;
    }
    if (normTitle.includes(normName)) {
      const startIdx = normTitle.indexOf(normName);
      const before = normTitle.slice(0, startIdx).trim();
      const sfx = normTitle.slice(startIdx + normName.length);
      const beforeSig = sigWords(before).filter((w) => w !== "info");
      const nameSigCount = sigWords(normName).length;
      if (nameSigCount >= 2 || beforeSig.length === 0) {
        if (isCleanSuffix(sfx)) return 78;
        if (isSequelSuffix(sfx)) return 40;
        return 65;
      }
    }
    const nameWords = sigWords(normName);
    if (!nameWords.length) return 0;
    const titleArr = normTitle.split(" ");
    const hasWord =
      titleArr.length > 10
        ? (w) => new Set(titleArr).has(w)
        : (w) => titleArr.includes(w);
    const matched = nameWords.filter(hasWord);
    const matchCount = matched.length;
    const ratio = matchCount / nameWords.length;
    const titleSig = sigWords(normTitle).filter((w) => w !== "info");
    if (titleSig.length >= 2 && titleSig.every((w, i) => nameWords[i] === w)) {
      const extra = nameWords.slice(titleSig.length);
      if (!extra.some((w) => RE_DIGIT.test(w) || SEQUEL_NUMS.has(w))) return 65;
    }
    if (ratio === 1) {
      if (nameWords.length === 1) {
        const titleSigCount = (
          titleArr.length > 10 ? [...new Set(titleArr)] : titleArr
        ).filter(
          (w) =>
            (w.length > 1 || RE_DIGIT.test(w)) &&
            !STOP_WORDS.has(w) &&
            w !== "info",
        ).length;
        return titleSigCount <= 2 ? 60 : 20;
      }
      return 60;
    }
    if (ratio >= 0.75 && matchCount >= 2) return 45;
    if (ratio >= 0.5 && matchCount >= 3) return 30;
    if (nameWords.length === 1 && matchCount === 1 && nameWords[0].length >= 5)
      return 20;
    return 0;
  }
  function pickBestTopic(topics, appName, isAppIdSearch = false) {
    if (!topics.length) return null;
    if (isAppIdSearch && topics.length === 1) {
      const text = getTopicText(topics[0]);
      log.info(`✓ Single:${text ? ` "${text.slice(0, 60)}"` : " (empty)"}`);
      return topics[0];
    }
    const normName = normalise(appName ?? "");
    let best = null,
      bestScore = 0;
    for (const t of topics) {
      const text = getTopicText(t);
      if (!text) continue;
      const score = scoreTopic(text, appName, normName);
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (!best || bestScore < 45) {
      log.info(`✗ No match (best ${bestScore})`);
      return null;
    }
    log.info(`✓ Score ${bestScore}: "${getTopicText(best).slice(0, 60)}"`);
    return best;
  }

  // src/rinlink/core/search.js
  var NOT_FOUND = "NOT_FOUND";
  var MAX_FLOOD_RETRIES = 3;
  var RE_SEARCH_UNAVAILABLE =
    /cannot make another search|try again in \d+ seconds?|search is currently unavailable/i;
  var buildSearches = (appId, appName) => [
    { url: buildSearchUrl(appId), appIdSearch: true },
    { url: buildTitleUrl(appName || appId), appIdSearch: false },
  ];
  var _pageSnippet = (raw) => {
    const txt = (raw ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return txt.slice(0, 120);
  };
  var _emptyNote = (raw) => {
    const txt = raw ?? "";
    const markers = `pagecontent=${txt.includes("pagecontent") ? "y" : "n"},wrapcentre=${txt.includes("wrapcentre") ? "y" : "n"}`;
    return `0 results (len=${txt.length},${markers},${_pageSnippet(raw)})`;
  };
  var _topicHasAppId = (raw, appId) => {
    if (!raw || !appId) return false;
    const start = raw.indexOf("postbody");
    const scope = start >= 0 ? raw.slice(start, start + 4e4) : raw;
    const id = String(appId);
    return scope.includes(`/apps/${id}/`) || scope.includes(`/app/${id}`);
  };
  var _isSingleWordName = (name) =>
    sigWords(normalise(name ?? "")).length === 1;
  var _needsTopicCheck = (appId, appName, topic) => {
    if (!appId || !topic || !_isSingleWordName(appName)) return false;
    return scoreTopic(getTopicText(topic), appName) < 100;
  };
  function createSearchService({
    cache: cache2,
    xhr: xhr2,
    bypass: bypass2,
    cfg,
    ui: ui2,
  }) {
    const _resolvedUrls = /* @__PURE__ */ new Map();
    const _inFlight = /* @__PURE__ */ new Map();
    const _verifyPending = /* @__PURE__ */ new Set();
    const _generation = /* @__PURE__ */ new Map();
    const _cacheable = (appId) => appId !== null && appId !== void 0;
    const _showVerify = (btn, onVerify) => {
      ui2.showVerify(
        btn,
        onVerify,
        location.hostname.includes("pcgamingwiki.com"),
      );
    };
    const _settle = (waiters, result) => {
      for (const w of waiters) if (w.resolve) w.resolve(result);
    };
    const _cancel = (appId) => {
      _generation.set(appId, (_generation.get(appId) ?? 0) + 1);
      const waiters = _inFlight.get(appId);
      if (!waiters) return;
      _inFlight.delete(appId);
      _settle(waiters, { status: "cancelled" });
    };
    const _refetch = (appId, btn, appName) => {
      cache2.clear(appId);
      _resolvedUrls.delete(appId);
      _cancel(appId);
      _verifyPending.delete(appId);
      searchFor(appId, btn?.dataset?.rinAppname || appName, btn, null);
    };
    const _finish = (appId, appName, topic) => {
      log.info(`Finish: appId ${appId}`);
      const url = resolveTopicUrl(topic.getAttribute("href") || topic.href);
      const tags = ui2.extractTags(topic);
      const entry = { exists: true, url, tags, ts: Date.now() };
      if (_cacheable(appId)) {
        cache2.set(appId, entry);
        _resolvedUrls.set(appId, { url, tags });
      }
      const waiters = _inFlight.get(appId) ?? [];
      _inFlight.delete(appId);
      _verifyPending.delete(appId);
      const result = { status: "ready", url, tags };
      _settle(waiters, result);
      for (const w of waiters) {
        if (!w.btn) continue;
        w.btn.href = url;
        ui2.setReady(w.btn);
        if (w.titleEl) ui2.appendTags(tags, w.titleEl);
      }
      log.info(`  ✓ ${url}`);
    };
    const _diagnosticStop = (appId, status, reason = null) => {
      const waiters = _inFlight.get(appId) ?? [];
      _inFlight.delete(appId);
      _verifyPending.delete(appId);
      _settle(waiters, reason ? { status, reason } : { status });
    };
    const _notFound = (appId, appName, btn) => {
      log.info(`Not found: appId ${appId}`);
      if (_cacheable(appId)) {
        cache2.set(appId, { exists: false, ts: Date.now() });
        _resolvedUrls.set(appId, NOT_FOUND);
      }
      const waiters = _inFlight.get(appId) ?? [];
      _inFlight.delete(appId);
      _verifyPending.delete(appId);
      const onRefetch = (_appId, b) => _refetch(appId, b, appName);
      _settle(waiters, { status: "notfound" });
      const seen = /* @__PURE__ */ new Set();
      for (const w of waiters) {
        if (!w.btn || seen.has(w.btn)) continue;
        seen.add(w.btn);
        ui2.setNotFound(w.btn);
        ui2.showNotFoundBanner(w.btn, appName, appId, onRefetch);
      }
      if (btn && !seen.has(btn)) {
        ui2.setNotFound(btn);
        ui2.showNotFoundBanner(btn, appName, appId, onRefetch);
      }
    };
    const _loginRequired = (appId, appName, btn) => {
      log.info(`Login required: appId ${appId}`);
      if (_cacheable(appId)) {
        cache2.clear(appId);
        _resolvedUrls.delete(appId);
      }
      const waiters = _inFlight.get(appId) ?? [];
      _inFlight.delete(appId);
      _verifyPending.delete(appId);
      _settle(waiters, { status: "login" });
      const onRetry = (b) => _refetch(appId, b, appName);
      const seen = /* @__PURE__ */ new Set();
      for (const w of waiters) {
        if (!w.btn || seen.has(w.btn)) continue;
        seen.add(w.btn);
        ui2.setLoginRequired(w.btn);
        ui2.showLoginBanner(w.btn, onRetry);
      }
      if (btn && !seen.has(btn)) {
        ui2.setLoginRequired(btn);
        ui2.showLoginBanner(btn, onRetry);
      }
    };
    const _applyCached = (cacheEntry, btn, appName, appId, titleEl) => {
      if (btn) {
        btn.dataset.rinAppid = appId;
        if (appName) btn.dataset.rinAppname = appName;
      }
      if (cacheEntry.exists) {
        if (btn) {
          btn.href = cacheEntry.url;
          ui2.setReady(btn);
        }
        if (titleEl && cacheEntry.tags)
          ui2.appendTags(cacheEntry.tags, titleEl);
        return { status: "ready", url: cacheEntry.url, tags: cacheEntry.tags };
      }
      if (btn) {
        ui2.setNotFound(btn);
        ui2.showNotFoundBanner(btn, appName, appId, () =>
          _refetch(appId, btn, appName),
        );
      }
      return { status: "notfound" };
    };
    const _search = (
      appId,
      appName,
      { viaBypass, primaryBtn, force = null, diagnostic = false },
    ) => {
      const label = force ? `Force ${force}` : viaBypass ? "Retry" : "Search";
      log.info(`${label}: appId ${appId}${appName ? ` "${appName}"` : ""}`);
      const [appIdSearch, titleSearch] = buildSearches(appId, appName);
      const generation = (_generation.get(appId) ?? 0) + 1;
      _generation.set(appId, generation);
      let done = false;
      let sawGuest = false;
      const settle = (fn) => {
        if (done) return;
        done = true;
        if ((_generation.get(appId) ?? 0) !== generation) return;
        fn();
      };
      const onBlocked = (reason = "Blocked, verify needed") => {
        settle(() => {
          if (diagnostic) {
            _diagnosticStop(appId, "verify", "blocked");
            log.warn(reason);
            return;
          }
          _verifyPending.add(appId);
          const waiters = _inFlight.get(appId) ?? [];
          _inFlight.delete(appId);
          _settle(waiters, { status: "verify" });
          for (const w of waiters) {
            if (w.btn)
              _showVerify(w.btn, () => retry(appId, appName, w.btn, w.titleEl));
          }
          log.warn(reason);
        });
      };
      if (viaBypass) {
        log.info(`  → (via bypass) ${appIdSearch.url}`);
        bypass2.run(appIdSearch.url, (topics, ok, guest) => {
          if (done) return;
          if (guest) sawGuest = true;
          const best = topics.length
            ? pickBestTopic(topics, appName, appIdSearch.appIdSearch)
            : null;
          if (best) {
            settle(() => _finish(appId, appName, best));
            return;
          }
          if (ok === false) {
            onBlocked("Bypass failed, verify needed");
            return;
          }
          settle(() =>
            sawGuest
              ? _loginRequired(appId, appName, primaryBtn)
              : _notFound(appId, appName, null),
          );
        });
        return;
      }
      const checkTopic = (topic, cb) => {
        const url = resolveTopicUrl(topic.getAttribute("href") || topic.href);
        log.info(`  → check ${url}`);
        xhr2.request(url, (isBlocked, _topics, raw, transport) => {
          if (isBlocked || transport) {
            log.warn("  Topic check unavailable");
            cb(false);
            return;
          }
          const ok = _topicHasAppId(raw, appId);
          log.info(
            `  ${ok ? "✓" : "✗"} Topic appId ${ok ? "matches" : "differs"}`,
          );
          cb(ok);
        });
      };
      const runLeg = ({ url, appIdSearch: isAppIdSearch }) =>
        new Promise((resolve) => {
          log.info(`  → ${url}`);
          xhr2.request(url, (isBlocked, topics, raw, transport, guest) => {
            if (guest) sawGuest = true;
            if (done) {
              resolve();
              return;
            }
            if (isBlocked) {
              onBlocked();
              resolve();
              return;
            }
            if (transport) {
              log.warn("  Transport failure — no clean read");
              resolve("transport");
              return;
            }
            if (RE_SEARCH_UNAVAILABLE.test(raw ?? "")) {
              log.warn("  Search unavailable — waiting before retry");
              resolve("unavailable");
              return;
            }
            if (!topics.length) log.info(`  → ${_emptyNote(raw)}`);
            const best = pickBestTopic(topics, appName, isAppIdSearch);
            if (best) {
              if (!isAppIdSearch && _needsTopicCheck(appId, appName, best)) {
                checkTopic(best, (ok) => {
                  if (done) {
                    resolve();
                    return;
                  }
                  if (ok) {
                    settle(() => _finish(appId, appName, best));
                    resolve();
                    return;
                  }
                  log.info("  ✗ Title candidate belongs to a different app");
                  resolve("fail");
                });
                return;
              }
              settle(() => _finish(appId, appName, best));
              resolve();
              return;
            }
            resolve("fail");
          });
        });
      const runForced = (leg) => {
        let attempts = 0;
        const attempt = () => {
          if (done) return;
          log.info(`  → (${force}) ${leg.url}`);
          xhr2.request(leg.url, (isBlocked, topics, raw, transport, guest) => {
            if (guest) sawGuest = true;
            if (done) return;
            if (isBlocked) {
              settle(() => {
                _diagnosticStop(appId, "verify", "blocked");
                log.warn(`Forced ${force} search blocked`);
              });
              return;
            }
            if (transport) {
              settle(() => _diagnosticStop(appId, "error", "transport"));
              return;
            }
            if (RE_SEARCH_UNAVAILABLE.test(raw ?? "")) {
              attempts++;
              if (attempts > MAX_FLOOD_RETRIES) {
                settle(() => _diagnosticStop(appId, "error", "flood"));
                return;
              }
              log.warn("  Search unavailable — waiting before retry");
              setTimeout(attempt, cfg.SEARCH_COOLDOWN_MS);
              return;
            }
            if (!topics.length) log.info(`  → ${_emptyNote(raw)}`);
            const best = pickBestTopic(topics, appName, leg.appIdSearch);
            if (best) {
              if (!leg.appIdSearch && _needsTopicCheck(appId, appName, best)) {
                checkTopic(best, (ok) => {
                  if (done) return;
                  if (ok) {
                    settle(() => _finish(appId, appName, best));
                    return;
                  }
                  settle(() =>
                    _diagnosticStop(appId, "notfound", "appid-mismatch"),
                  );
                });
                return;
              }
              settle(() => _finish(appId, appName, best));
              return;
            }
            settle(() =>
              _diagnosticStop(
                appId,
                sawGuest ? "login" : "notfound",
                sawGuest ? "guest" : "empty",
              ),
            );
          });
        };
        attempt();
      };
      const runFirstPass = async () => {
        if (done) return;
        runFirstPass.attempts = (runFirstPass.attempts ?? 0) + 1;
        const [a, b] = await Promise.all([
          runLeg(appIdSearch),
          runLeg(titleSearch),
        ]);
        if (done) return;
        if (a === "unavailable" || b === "unavailable") {
          if (runFirstPass.attempts > MAX_FLOOD_RETRIES) {
            onBlocked("Search unavailable, verify needed");
            return;
          }
          setTimeout(runFirstPass, cfg.SEARCH_COOLDOWN_MS);
          return;
        }
        const inconclusive = [a, b].find(
          (result) => result === "transport" || result === "unavailable",
        );
        if (inconclusive) {
          onBlocked(
            inconclusive === "transport"
              ? "Search failed, verify needed"
              : "Search unavailable, verify needed",
          );
          return;
        }
        if (diagnostic) {
          settle(() =>
            _diagnosticStop(
              appId,
              sawGuest ? "login" : "notfound",
              sawGuest ? "guest" : "empty",
            ),
          );
          return;
        }
        settle(() =>
          sawGuest
            ? _loginRequired(appId, appName, primaryBtn)
            : _notFound(appId, appName, primaryBtn),
        );
      };
      if (force) {
        const leg = force === "appId" ? appIdSearch : titleSearch;
        runForced(leg);
        return;
      }
      runFirstPass();
    };
    const retry = (appId, appName, btn, titleEl) => {
      log.info(`Retry: appId ${appId}`);
      _verifyPending.delete(appId);
      const existing = _inFlight.get(appId);
      if (existing) {
        if (btn && !existing.some((w) => w.btn === btn))
          existing.push({ btn, titleEl: titleEl ?? null });
        return;
      }
      _inFlight.set(appId, btn ? [{ btn, titleEl: titleEl ?? null }] : []);
      _search(appId, appName, { viaBypass: true, primaryBtn: btn ?? null });
    };
    const _startSearch = (appId, appName, btn, titleEl, resolve) => {
      if (btn) {
        btn.dataset.rinAppid = appId;
        if (appName) btn.dataset.rinAppname = appName;
        ui2.setPending(btn);
      }
      _inFlight.set(appId, [{ btn, titleEl, resolve }]);
      _search(appId, appName, { viaBypass: false, primaryBtn: btn });
    };
    const searchFor = (appId, appName, btn, titleEl) =>
      new Promise((resolve) => {
        if ((appId === null || appId === void 0) && !appName) {
          resolve({ status: "notfound" });
          return;
        }
        if (_cacheable(appId)) {
          const cached = _resolvedUrls.get(appId);
          if (cached !== void 0) {
            if (cached === NOT_FOUND) {
              resolve(
                _applyCached({ exists: false }, btn, appName, appId, titleEl),
              );
              return;
            }
            resolve(
              _applyCached(
                { exists: true, url: cached.url, tags: cached.tags ?? [] },
                btn,
                appName,
                appId,
                titleEl,
              ),
            );
            return;
          }
          const stored = cache2.get(appId);
          if (stored) {
            resolve(_applyCached(stored, btn, appName, appId, titleEl));
            return;
          }
        }
        if (_verifyPending.has(appId)) {
          if (btn) _showVerify(btn, () => retry(appId, appName, btn, titleEl));
          resolve({ status: "verify" });
          return;
        }
        if (_inFlight.has(appId)) {
          _inFlight.get(appId).push({ btn, titleEl, resolve });
          return;
        }
        _startSearch(appId, appName, btn, titleEl, resolve);
      });
    const forceSearch = (appId, appName, btn, mode = "auto") =>
      new Promise((resolve) => {
        if (!["auto", "appId", "title"].includes(mode)) {
          resolve({ status: "error", reason: "mode" });
          return;
        }
        if ((appId === null || appId === void 0) && !appName) {
          resolve({ status: "notfound", reason: "no-target" });
          return;
        }
        if (mode === "appId" && (appId === null || appId === void 0)) {
          resolve({ status: "error", reason: "no-appid" });
          return;
        }
        if (_inFlight.has(appId)) {
          resolve({ status: "busy" });
          return;
        }
        if (_cacheable(appId)) {
          cache2.clear(appId);
          _resolvedUrls.delete(appId);
        }
        _verifyPending.delete(appId);
        _inFlight.set(appId, [{ btn, titleEl: null, resolve }]);
        _search(appId, appName, {
          viaBypass: false,
          primaryBtn: btn ?? null,
          force: mode === "auto" ? null : mode,
          diagnostic: true,
        });
      });
    return {
      searchFor,
      forceSearch,
      retry,
      getDebugState: () => ({
        resolved: _resolvedUrls.size,
        inFlight: _inFlight.size,
        verifyPending: _verifyPending.size,
      }),
      clearCache(appIds) {
        for (const id of appIds) cache2.clear(id);
        for (const id of [..._inFlight.keys()]) _cancel(id);
        _resolvedUrls.clear();
        _verifyPending.clear();
      },
      refetchAll() {
        for (const id of [..._inFlight.keys()]) _cancel(id);
        _resolvedUrls.clear();
        _verifyPending.clear();
      },
      notFound: _notFound,
    };
  }

  // src/rinlink/core/dom.js
  var css = (el, props) => Object.assign(el.style, props);
  var mk = (tag, attrs = {}) =>
    Object.assign(document.createElement(tag), attrs);

  // src/rinlink/core/icons.js
  var ICONS = {
    alertTriangle:
      '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><path d="m10.29 3.86-8 13.86A2 2 0 0 0 4 21h16a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    shieldCheck:
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logIn:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    refreshCw:
      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  };
  function icon(name, size = 16, color = "currentColor") {
    const paths = ICONS[name];
    if (!paths) {
      log.warn("Icon not found:", name);
      return document.createTextNode("");
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.flexShrink = "0";
    svg.innerHTML = paths;
    return svg;
  }

  // src/rinlink/ui/button-states.js
  function createButton(opts = {}) {
    const btn = mk("a", {
      href: "#",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    if (opts.iconOnly) {
      const img = mk("img", {
        src: CFG.IMAGE,
        alt: opts.label || CFG.LABEL,
        width: 24,
        height: 24,
      });
      css(img, { display: "block", width: "24px", height: "24px" });
      btn.appendChild(img);
    } else {
      btn.appendChild(mk("span", { textContent: opts.label || CFG.LABEL }));
    }
    css(btn, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      ...opts.style,
    });
    if (opts.className) btn.className = opts.className;
    if (opts.iconOnly) btn.dataset.rinIconOnly = "true";
    btn.dataset.rinBtn = "true";
    return btn;
  }
  function btnSetPending(btn) {
    btn.setAttribute("data-rin-pending", "true");
    css(btn, {
      opacity: "0.45",
      pointerEvents: "none",
      cursor: "wait",
      transition: "opacity .3s",
    });
  }
  function btnSetReady(btn) {
    btn.removeAttribute("data-rin-pending");
    delete btn.dataset.rinFailed;
    if (btn.dataset.rinOriginalHtml) {
      btn.innerHTML = btn.dataset.rinOriginalHtml;
      delete btn.dataset.rinOriginalHtml;
    }
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.title = CFG.LABEL;
    btn.setAttribute("data-tooltip-text", CFG.LABEL);
    css(btn, {
      opacity: "1",
      pointerEvents: "auto",
      cursor: "pointer",
      transition: "opacity .3s",
    });
  }
  function btnSwapContent(btn, iconName, label) {
    if (!btn.dataset.rinOriginalHtml)
      btn.dataset.rinOriginalHtml = btn.innerHTML;
    setBtnContent(
      btn,
      iconName,
      label,
      btn.dataset.rinIconOnly ? 24 : 16,
      btn.dataset.rinIconOnly ? 0 : 6,
    );
  }
  function setBtnContent(btn, iconName, label, size, marginRight) {
    btn.innerHTML = "";
    const ico = icon(iconName, size, "currentColor");
    if (btn.dataset.rinIconOnly || !label) {
      btn.appendChild(ico);
      return;
    }
    css(ico, { verticalAlign: "middle", marginRight: `${marginRight}px` });
    const wrap = mk("span");
    wrap.appendChild(ico);
    wrap.appendChild(document.createTextNode(label));
    btn.appendChild(wrap);
  }
  function btnSetNotFound(btn) {
    btn.removeAttribute("data-rin-pending");
    btn.href = "#";
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btnSwapContent(btn, "refreshCw", "Refetch");
    css(btn, {
      opacity: "0.7",
      pointerEvents: "auto",
      cursor: "pointer",
      transition: "opacity .3s",
    });
  }
  function btnSetLogin(btn) {
    if (!btn) return;
    btn.removeAttribute("data-rin-pending");
    btn.href = CFG.LOGIN_URL;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btnSwapContent(btn, "logIn", "Log in");
    btn.title = "Sign in to CS.RIN.RU to search";
    btn.setAttribute("data-tooltip-text", btn.title);
    css(btn, {
      opacity: "0.85",
      pointerEvents: "auto",
      cursor: "pointer",
      transition: "opacity .3s",
    });
  }
  function btnReset(btn) {
    if (!btn) return;
    if (btn.dataset.rinOriginalHtml) {
      btn.innerHTML = btn.dataset.rinOriginalHtml;
      delete btn.dataset.rinOriginalHtml;
    }
    delete btn.dataset.rinLoginShown;
    btn.removeAttribute("data-rin-pending");
    btn.href = "#";
    btn.title = CFG.LABEL;
    btn.setAttribute("data-tooltip-text", CFG.LABEL);
    css(btn, { opacity: "1", pointerEvents: "auto", cursor: "pointer" });
  }
  function showVerifyButton(btn, onVerify, iconOnly) {
    if (!btn) return;
    const origHref = btn.href;
    const origTitle = btn.title;
    const origHTML = btn.dataset.rinOriginalHtml || btn.innerHTML;
    const origTooltipAttr = btn.getAttribute("data-tooltip-text");
    const origTarget = btn.target;
    btn.removeAttribute("data-rin-pending");
    btn.href = "#";
    btn.removeAttribute("target");
    btn.title = "Verify access on CS.RIN.RU";
    btn.setAttribute("data-tooltip-text", "Verify access on CS.RIN.RU");
    setBtnContent(btn, "shieldCheck", "Verify", iconOnly ? 24 : 14, 4);
    css(btn, {
      opacity: "0.7",
      pointerEvents: "auto",
      cursor: "pointer",
      transition: "opacity .3s",
    });
    const verifying = () => {
      setBtnContent(
        btn,
        "lock",
        iconOnly ? "" : "Verifying...",
        iconOnly ? 24 : 14,
        4,
      );
      css(btn, { opacity: "0.45", pointerEvents: "none", cursor: "wait" });
    };
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        log.info(`Verify: appId ${btn.dataset.rinAppid ?? "?"}`);
        verifying();
        btn.dataset.rinOriginalHtml = origHTML;
        btn.href = origHref || "#";
        btn.title = origTitle;
        if (origTooltipAttr)
          btn.setAttribute("data-tooltip-text", origTooltipAttr);
        if (origTarget) btn.target = origTarget;
        onVerify();
      },
      { once: true },
    );
    log.info("Verify mode");
  }

  // src/rinlink/ui/tags.js
  function extractTags(anchor) {
    const text =
      (anchor.parentElement?.textContent || anchor.textContent) ?? "";
    const seen = /* @__PURE__ */ new Set();
    return (text.match(/\[[^\]]+\]/g) ?? []).filter((tag) => {
      const inner = tag.slice(1, -1).trim();
      if (CFG.TAG_BLACKLIST.test(inner) || seen.has(inner)) return false;
      seen.add(inner);
      return true;
    });
  }
  function appendTags(tags, target) {
    if (!tags.length || target.dataset.rinTagged) return;
    target.dataset.rinTagged = "true";
    for (const node of [target, target.parentElement])
      if (node)
        css(node, {
          whiteSpace: "normal",
          overflow: "visible",
          textOverflow: "unset",
        });
    for (const tag of tags) {
      const span = mk("span", { textContent: tag });
      css(span, {
        color: tagColor(tag),
        fontWeight: "bold",
        marginLeft: "5px",
        fontSize: "0.9em",
      });
      target.appendChild(span);
    }
  }

  // src/rinlink/ui/notfound-banner.js
  function steamBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
      display: "inline-block",
      padding: "2px 15px",
      marginRight: "6px",
      verticalAlign: "top",
      background:
        "linear-gradient(135deg,rgba(26,42,58,.95),rgba(22,32,45,.95))",
      border: "none",
      borderRadius: "2px",
      fontSize: "12px",
      color: "#8ba3b8",
      lineHeight: "28px",
      cursor: "default",
      fontFamily: '"Motiva Sans",Arial,sans-serif',
      whiteSpace: "nowrap",
    });
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, "Create one", "Search manually", "color:#4ab3f4;text-decoration:none;border-bottom:1px solid rgba(74,179,244,.4)")}`;
    btn.insertAdjacentElement("beforebegin", banner);
  }
  function steamdbBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
      display: "block",
      width: "100%",
      padding: "6px 10px",
      boxSizing: "border-box",
      background: "#273b4b",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "6px",
      fontSize: "13px",
      color: "#8ba3b8",
      lineHeight: "1.5",
      fontFamily: "Inter,system-ui,sans-serif",
    });
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, "Create one", "Search manually", "color:#67c1f5;text-decoration:none")}`;
    btn.insertAdjacentElement("beforebegin", banner);
  }
  function pcgamingwikiBanner(banner, btn, { createUrl, searchUrl }) {
    const row = btn.closest("tr");
    if (!row) {
      btn.insertAdjacentElement("afterend", banner);
      return;
    }
    css(banner, {
      padding: "5px 8px",
      borderLeft: "3px solid #3366cc",
      background: "rgba(51,102,204,0.06)",
      fontSize: "12px",
      lineHeight: "1.5",
    });
    banner.innerHTML = `No matching topic. ${linksHtml({ createUrl, searchUrl }, "Create one", "Search manually")}`;
    const td = mk("td", { colSpan: 2 });
    css(td, { padding: "4px 6px" });
    td.appendChild(banner);
    const newRow = mk("tr");
    newRow.appendChild(td);
    row.insertAdjacentElement("afterend", newRow);
  }
  function genericBanner(banner, btn, { createUrl, searchUrl }) {
    css(banner, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      marginTop: "6px",
      borderRadius: "6px",
      background: "rgba(234,179,8,.1)",
      border: "1px solid rgba(234,179,8,.3)",
      fontSize: "12px",
      color: "#eab308",
      lineHeight: "1.4",
    });
    const ico = mk("span");
    ico.appendChild(icon("alertTriangle", 13, "#eab308"));
    css(ico, { display: "flex", alignItems: "center", flexShrink: "0" });
    const text = mk("span");
    text.innerHTML = `No CS.RIN.RU topic. <a href="${createUrl}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">Create one</a> or <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">search</a>.`;
    banner.appendChild(ico);
    banner.appendChild(text);
    btn.insertAdjacentElement("beforebegin", banner);
  }
  var BANNERS = [
    { site: "store.steampowered.com", render: steamBanner },
    { site: "steamdb.info", render: steamdbBanner },
    { site: "pcgamingwiki.com", render: pcgamingwikiBanner },
    { site: null, render: genericBanner },
  ];
  function linksHtml(urls, createLabel, searchLabel, linkStyle) {
    const style = linkStyle ? ` style="${linkStyle}"` : "";
    return `<a href="${urls.createUrl}" target="_blank" rel="noopener noreferrer"${style}>${createLabel}</a> &middot; <a href="${urls.searchUrl}" target="_blank" rel="noopener noreferrer"${style}>${searchLabel}</a>`;
  }
  function showLoginBanner(btn, onRetry) {
    if (!btn || btn.dataset.rinLoginShown) return;
    btn.dataset.rinLoginShown = "true";
    const banner = mk("div");
    banner.setAttribute("data-rin-login", "true");
    css(banner, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      marginTop: "6px",
      borderRadius: "6px",
      background: "rgba(234,179,8,.1)",
      border: "1px solid rgba(234,179,8,.3)",
      fontSize: "12px",
      color: "#eab308",
      lineHeight: "1.4",
    });
    const ico = mk("span");
    ico.appendChild(icon("logIn", 13, "#eab308"));
    css(ico, { display: "flex", alignItems: "center", flexShrink: "0" });
    const text = mk("span");
    text.innerHTML = `No topic found. Guest search hides some topics. <a href="${CFG.LOGIN_URL}" target="_blank" rel="noopener noreferrer" style="color:#eab308;font-weight:600;text-decoration:underline">Log in</a> to CS.RIN.RU, then <a href="#" data-rin-retry style="color:#eab308;font-weight:600;text-decoration:underline">retry</a>.`;
    banner.appendChild(ico);
    banner.appendChild(text);
    btn.insertAdjacentElement("beforebegin", banner);
    text.querySelector("[data-rin-retry]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      banner.remove();
      btnReset(btn);
      onRetry?.(btn);
    });
  }
  function showNotFoundBanner(btn, appName, appId, onRefetch) {
    if (btn?.dataset?.rinNotfoundShown) return;
    if (btn) btn.dataset.rinNotfoundShown = "true";
    const host = location.hostname;
    const effName = appName && sanitiseKw(appName) ? appName : null;
    const searchUrl = effName
      ? `${CFG.BASE_URL}search.php?keywords=${encodeURIComponent(sanitiseKw(effName))}&fid%5B%5D=${CFG.FORUM_ID}&sr=topics&sf=all&sk=r&sd=d`
      : CFG.BASE_URL;
    const urls = { createUrl: CFG.CREATE_URL, searchUrl };
    const banner = mk("div");
    banner.setAttribute("data-rin-notfound", "true");
    const def = BANNERS.find((b) => b.site === null || host.includes(b.site));
    def.render(banner, btn, urls);
    if (appId && onRefetch) {
      btn.setAttribute("data-rin-notfound-btn", "true");
      btn.title = "No topic found — click to re-check";
      btn.setAttribute(
        "data-tooltip-text",
        "No topic found — click to re-check",
      );
      btn.addEventListener(
        "click",
        (e) => {
          if (!btn.dataset.rinNotfoundShown) return;
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          log.info(`Refetch: appId ${appId}`);
          document
            .querySelectorAll("[data-rin-notfound]")
            .forEach((el) => el.remove());
          btn.removeAttribute("data-rin-notfound-btn");
          delete btn.dataset.rinNotfoundShown;
          if (btn.dataset.rinOriginalHtml) {
            btn.innerHTML = btn.dataset.rinOriginalHtml;
            delete btn.dataset.rinOriginalHtml;
          }
          btn.title = CFG.LABEL;
          btn.setAttribute("data-tooltip-text", CFG.LABEL);
          btn.target = "_blank";
          btn.rel = "noopener noreferrer";
          css(btn, { opacity: "1", pointerEvents: "auto", cursor: "pointer" });
          onRefetch(appId, btn);
        },
        { once: true },
      );
    }
  }

  // src/rinlink/ui/index.js
  function createUi() {
    return {
      createButton,
      setPending: btnSetPending,
      setReady: btnSetReady,
      setNotFound: btnSetNotFound,
      setLoginRequired: btnSetLogin,
      showVerify: showVerifyButton,
      extractTags,
      appendTags,
      showNotFoundBanner,
      showLoginBanner,
      css,
    };
  }

  // src/rinlink/sites/router.js
  function createRouter({ handlers: handlers2 }) {
    return {
      dispatch() {
        for (const h of handlers2) {
          try {
            if (h.match()) {
              log.info(`Handler: ${h.id}`);
              h.run();
              return;
            }
          } catch (e) {
            log.error(`Handler ${h.id}:`, e);
          }
        }
      },
    };
  }

  // src/rinlink/sites/steam.js
  function createSteamHandler({ search: search2, ui: ui2 }) {
    return {
      id: "Steam",
      match: () => location.hostname.includes("store.steampowered.com"),
      run() {
        const container = document.querySelector(".apphub_OtherSiteInfo");
        if (!container) return;
        const btn = ui2.createButton({
          className: "btnv6_blue_hoverfade btn_medium",
        });
        ui2.css(btn, { marginRight: "4px" });
        container.prepend(btn);
        let appId = extractAppId(location.pathname);
        const dlc = document.querySelector(
          '#dlc_browse_content .game_area_dlc_section .game_area_dlc_name a[href*="/app/"], a[href*="/app/"]',
        );
        if (!appId && dlc) appId = extractAppId(dlc.href);
        const go = (tries = 0) => {
          const h1 = document.querySelector("#appHubAppName");
          const name =
            h1?.textContent?.trim() ?? document.title.split(" on Steam")[0];
          if ((!appId || !name) && tries < 10) {
            setTimeout(() => go(tries + 1), 300);
            return;
          }
          if (!appId || !name) {
            btn.remove();
            return;
          }
          search2.searchFor(appId, name, btn, h1);
        };
        ui2.setPending(btn);
        go();
      },
    };
  }

  // src/rinlink/sites/steamdb.js
  function createSteamDBHandler({ search: search2, ui: ui2 }) {
    return {
      id: "SteamDB",
      match: () => location.hostname.includes("steamdb.info"),
      run() {
        const container = document.querySelector("nav.app-links");
        if (!container) return;
        const btn = ui2.createButton({ label: "CS.RIN.RU", className: "btn" });
        container.prepend(btn);
        const appId = extractAppId(location.pathname);
        const name = document.querySelector("h1")?.textContent?.trim();
        search2.searchFor(appId, name, btn, null);
      },
    };
  }

  // src/rinlink/sites/pcgamingwiki.js
  function createPcgamingwikiHandler({ search: search2, ui: ui2 }) {
    return {
      id: "PCGamingWiki",
      match: () => location.hostname.includes("pcgamingwiki.com"),
      run() {
        const container = document.querySelector(
          ".template-infobox-icons, .infobox-icons",
        );
        if (!container) return;
        const btn = ui2.createButton({
          iconOnly: true,
          style: {
            display: "inline-block",
            width: "24px",
            height: "24px",
            margin: "0 0 0 2px",
            padding: "0 0 0 2px",
            overflow: "hidden",
          },
        });
        btn.title = CFG.LABEL;
        btn.setAttribute("data-tooltip-text", CFG.LABEL);
        container.appendChild(btn);
        let appId = null;
        const steampage = document.querySelector(
          'a[href*="store.steampowered.com"]',
        );
        if (steampage) appId = extractAppId(steampage.href);
        const name =
          document.querySelector("#firstHeading")?.textContent?.trim() ||
          document.title.replace(/ - PCGamingWiki/, "");
        search2.searchFor(appId, name, btn, null);
      },
    };
  }

  // src/rinlink/sites/csrin-overlay.js
  var STYLE_ID = "rin-bypass-style";
  var CSS = `
#rin-bypass-overlay {
    --bg: #0a0a0a;
    --panel: #101010;
    --bar: #161616;
    --line: #2a2a2a;
    --line-soft: #1e1e1e;
    --ink: #f4f4f4;
    --dim: #a3a3a3;
    --faint: #7f7f7f;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
    color: var(--ink);
    font: 14px/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
}
#rin-bypass-overlay *,
#rin-bypass-overlay *::before,
#rin-bypass-overlay *::after { box-sizing: border-box; }

.rb-panel {
    width: min(420px, 100%);
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.7),
        0 2px 8px rgba(0, 0, 0, 0.4);
}
.rb-head {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 16px;
    background: var(--bar);
    border-bottom: 1px solid var(--line);
    font: 600 11px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
}
.rb-mark { width: 8px; height: 8px; flex: none; border-radius: 2px; background: var(--ink); }
.rb-name { color: var(--ink); }
.rb-tag { margin-left: auto; color: var(--faint); }
.rb-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 28px 28px;
    text-align: center;
}
.rb-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--line);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: rin-spin 0.9s linear infinite;
}
.rb-title { font-size: 20px; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
.rb-status { min-height: 21px; max-width: 32ch; font-size: 13px; color: var(--dim); }
.rb-note {
    margin-top: 4px;
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
}
.rb-panel.is-done .rb-spinner {
    position: relative;
    border: 0;
    background: var(--ink);
    animation: none;
}
.rb-panel.is-done .rb-spinner::after {
    content: '';
    position: absolute;
    left: 11px;
    top: 6px;
    width: 8px;
    height: 14px;
    border-right: 2px solid var(--bg);
    border-bottom: 2px solid var(--bg);
    transform: rotate(45deg);
}
.rb-panel.is-error .rb-spinner { display: none; }
.rb-panel.is-error .rb-status {
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bar);
    color: var(--ink);
}
@keyframes rin-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .rb-spinner { animation: none; }
}
`;
  function createCsRinOverlay({ storage: storage2 }) {
    return {
      id: "CsRinOverlay",
      match: () => location.hostname.includes("cs.rin.ru"),
      run() {
        const triggered =
          new URLSearchParams(location.search).get("rin-bypass") === "1" ||
          sessionStorage.getItem("rin-bypass") === "1";
        if (!triggered) return;
        sessionStorage.setItem("rin-bypass", "1");
        if (document.getElementById("rin-bypass-overlay")) return;
        const overlay = mk("div");
        overlay.id = "rin-bypass-overlay";
        overlay.setAttribute("role", "status");
        overlay.setAttribute("aria-live", "polite");
        overlay.setAttribute("aria-busy", "true");
        const panel = mk("div", { className: "rb-panel" });
        const head = mk("div", { className: "rb-head" });
        head.append(
          mk("span", { className: "rb-mark" }),
          mk("span", { className: "rb-name", textContent: "RINLink" }),
          mk("span", { className: "rb-tag", textContent: "bypass" }),
        );
        const body = mk("div", { className: "rb-body" });
        const spinner = mk("div", { className: "rb-spinner" });
        const title = mk("div", {
          className: "rb-title",
          textContent: "Verifying access",
        });
        const status = mk("div", {
          className: "rb-status",
          id: "rin-status",
          textContent: "Waiting for the security check.",
        });
        const note = mk("div", {
          className: "rb-note",
          textContent: "This tab closes on its own.",
        });
        body.append(spinner, title, status, note);
        panel.append(head, body);
        overlay.append(panel);
        const style = mk("style", { id: STYLE_ID, textContent: CSS });
        document.head.append(style);
        document.documentElement.append(overlay);
        const isReady = () => {
          const hasMarkers = document.querySelector(
            "#wrapheader, #menubar, #wrapcentre",
          );
          const hasCookies =
            !!document.cookie.match(/(?:^|;\s*)securitytoken=/) &&
            !!document.cookie.match(/(?:^|;\s*)securitytoken_expiration=/);
          return !!(hasMarkers || hasCookies);
        };
        let finished = false;
        const stop = () => {
          finished = true;
          clearInterval(poll);
          clearInterval(markerPoll);
        };
        const dismiss = () => {
          sessionStorage.removeItem("rin-bypass");
          overlay.remove();
          style.remove();
        };
        const finish = () => {
          if (finished) return;
          stop();
          storage2.set("rin:cleared", String(Date.now()));
          overlay.setAttribute("aria-busy", "false");
          panel.classList.add("is-done");
          title.textContent = "Access verified";
          status.textContent = "Closing this tab.";
          try {
            window.close();
          } catch (_) {}
          setTimeout(dismiss, 700);
        };
        const fail = (message) => {
          stop();
          overlay.setAttribute("aria-busy", "false");
          panel.classList.add("is-error");
          title.textContent = "Verification failed";
          status.textContent =
            !message || /verification failed/i.test(message)
              ? "The security check did not complete. Reload and try again."
              : message;
          setTimeout(dismiss, 4e3);
        };
        const markerPoll = setInterval(() => {
          if (isReady()) finish();
        }, 400);
        const poll = setInterval(() => {
          try {
            const st = storage2.get("rin:status", null);
            if (!st) return;
            const j = typeof st === "string" ? JSON.parse(st) : st;
            if (j.message && !j.done) status.textContent = j.message;
            if (j.done) {
              if (j.ok) finish();
              else fail(j.message);
            }
          } catch (_) {}
        }, 300);
        log.info("Bypass overlay active");
      },
    };
  }

  // src/rinlink/main.js
  var storage = createStorage();
  var openTab = (url, opts) => GM_openInTab(url, opts);
  var cache = createCache({ storage, cfg: CFG });
  cache.prune();
  var xhr = createXhr(CFG);
  var bypass = createBypass({ storage, cfg: CFG, openTab, xhr });
  var ui = createUi();
  var search = createSearchService({ cache, xhr, bypass, cfg: CFG, ui });
  var handlers = [
    createSteamHandler({ search, ui }),
    createSteamDBHandler({ search, ui }),
    createPcgamingwikiHandler({ search, ui }),
  ];
  var router = createRouter({ handlers });
  var csrin = createCsRinOverlay({ storage });
  var app = { search, router };
  if (csrin.match()) {
    csrin.run();
  } else {
    router.dispatch();
  }
  log.info("Initialised.");

  // src/rinlink/debug-overlay.js
  var STYLE_ID2 = "rin-debug-style";
  var PANEL_ID = "rin-debug";
  var UI_KEY = "rin:debug:ui";
  var MAX_ROWS = 80;
  var LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
  var FILTERS = [
    { id: "all", label: "all", min: 0 },
    { id: "warn", label: "warn", min: LEVELS.warn },
    { id: "error", label: "error", min: LEVELS.error },
  ];
  var MODES = [
    { id: "auto", label: "Auto" },
    { id: "appId", label: "App ID" },
    { id: "title", label: "Title" },
  ];
  var CSS2 = `
#rin-debug {
    --bg: #0a0a0a;
    --panel: #101010;
    --bar: #161616;
    --line: #2a2a2a;
    --line-soft: #1e1e1e;
    --ink: #f4f4f4;
    --dim: #a3a3a3;
    --faint: #7f7f7f;
    --hover: #e8e8e8;
    --active: #d6d6d6;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    width: 400px;
    max-height: calc(100vh - 32px);
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.7),
        0 2px 8px rgba(0, 0, 0, 0.4);
    font: 12px/1.5 var(--sans);
    font-variant-numeric: tabular-nums;
    text-align: left;
    -webkit-font-smoothing: antialiased;
    animation: rd-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
#rin-debug *,
#rin-debug *::before,
#rin-debug *::after { box-sizing: border-box; }
@keyframes rd-in { from { opacity: 0; transform: translateY(-4px); } }

.rd-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    height: 42px;
    padding: 0 8px 0 14px;
    background: var(--bar);
    border-bottom: 1px solid var(--line);
    cursor: grab;
    user-select: none;
}
.rd-head:active { cursor: grabbing; }
#rin-debug[data-collapsed='true'] .rd-head { border-bottom: 0; }
.rd-lamp { width: 8px; height: 8px; flex: none; border-radius: 2px; background: var(--ink); }
.rd-title {
    font: 600 11px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink);
    white-space: nowrap;
}
.rd-tag {
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
}
.rd-spacer { flex: 1; }
.rd-ibtn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-ibtn:hover { color: var(--ink); background: #1e1e1e; }
.rd-ibtn:active { background: #242424; }
.rd-ibtn:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.55); outline-offset: 1px; }
.rd-collapse svg { transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
#rin-debug[data-collapsed='true'] .rd-collapse svg { transform: rotate(180deg); }

#rin-debug[data-collapsed='true'] { width: 230px; }
#rin-debug[data-collapsed='true'] .rd-body { display: none; }

.rd-body { display: flex; flex-direction: column; min-height: 0; }

.rd-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
.rd-stat { padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 8px; background: var(--panel); }
.rd-stat b { display: block; font: 600 18px/1 var(--mono); letter-spacing: -0.02em; color: var(--ink); }
.rd-stat.is-hot { border-color: var(--line); background: var(--bar); }
.rd-stat.is-hot b::after {
    content: '';
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-left: 6px;
    border-radius: 1px;
    background: var(--ink);
    vertical-align: 3px;
}
.rd-stat span { display: block; margin-top: 6px; font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }

.rd-section { padding: 14px; border-bottom: 1px solid var(--line-soft); }
.rd-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.rd-section-title { font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.rd-app { display: flex; align-items: baseline; gap: 6px; min-width: 0; font: 11px/1.3 var(--mono); }
.rd-app b { flex: none; color: var(--dim); font-weight: 600; }
.rd-app span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); }

.rd-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.rd-modes button {
    padding: 6px 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-modes button:hover { color: var(--ink); }
.rd-modes button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.rd-modes button:disabled { opacity: 0.35; cursor: not-allowed; }
.rd-modes button:disabled:hover { color: var(--faint); }

.rd-run {
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--ink);
    border-radius: 8px;
    background: var(--ink);
    color: var(--bg);
    font: 600 12px/1 var(--sans);
    cursor: pointer;
    transition:
        background 0.12s ease,
        border-color 0.12s ease;
}
.rd-run:hover { background: var(--hover); border-color: var(--hover); }
.rd-run:active { background: var(--active); border-color: var(--active); }
.rd-run:disabled { opacity: 0.4; cursor: not-allowed; }

.rd-result {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--line-soft);
    border-radius: 8px;
    background: var(--panel);
    font: 11px/1.5 var(--mono);
    color: var(--dim);
    word-break: break-word;
}
.rd-result[data-state='ready'] { border-color: #3d3d3d; color: var(--ink); }
.rd-result[data-state='error'] { border-color: var(--line); color: var(--ink); }
.rd-result[data-state='pending'] { color: var(--faint); }

.rd-subacts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }

.rd-logbar { display: flex; align-items: center; gap: 8px; flex: none; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
.rd-label { font: 600 10px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.rd-seg { display: flex; gap: 2px; margin-left: auto; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.rd-seg button {
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.rd-seg button:hover { color: var(--ink); }
.rd-seg button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.rd-copy {
    min-width: 52px;
    padding: 6px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        border-color 0.12s ease;
}
.rd-copy:hover { color: var(--ink); border-color: #3d3d3d; background: #141414; }
.rd-seg button:focus-visible,
.rd-modes button:focus-visible,
.rd-run:focus-visible,
.rd-copy:focus-visible,
.rd-act:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.55); outline-offset: 1px; }

.rd-log {
    flex: 0 1 170px;
    min-height: 96px;
    overflow-y: auto;
    padding: 8px 0;
    font: 11px/1.6 var(--mono);
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
}
.rd-row { display: grid; grid-template-columns: 42px 12px 1fr; gap: 8px; padding: 2px 14px 2px 12px; border-left: 2px solid transparent; }
.rd-row:hover { background: #141414; }
.rd-t { color: var(--faint); text-align: right; }
.rd-lv { font-weight: 700; text-align: center; color: var(--faint); }
.rd-msg { color: var(--dim); word-break: break-word; }
.rd-row[data-level='warn'] { border-left-color: var(--faint); }
.rd-row[data-level='warn'] .rd-lv,
.rd-row[data-level='warn'] .rd-msg { color: var(--ink); }
.rd-row[data-level='error'] { border-left-color: var(--ink); background: rgba(255, 255, 255, 0.03); }
.rd-row[data-level='error'] .rd-lv,
.rd-row[data-level='error'] .rd-msg { color: var(--ink); }
.rd-empty { padding: 12px 14px; color: var(--faint); }

.rd-page { padding: 12px 14px 14px; border-top: 1px solid var(--line-soft); }
.rd-page .rd-section-title { display: block; margin-bottom: 8px; }
.rd-page-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rd-act {
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    font: 600 11px/1.2 var(--sans);
    text-align: left;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        border-color 0.12s ease;
}
.rd-act:hover { color: var(--ink); border-color: #3d3d3d; background: #141414; }
.rd-act:active { background: var(--bar); }
.rd-wide { grid-column: 1 / -1; }

@media (max-width: 480px) {
    #rin-debug { top: 12px; right: 12px; width: calc(100vw - 24px); max-height: calc(100vh - 24px); }
    #rin-debug[data-collapsed='true'] { width: 230px; }
}
@media (prefers-reduced-motion: reduce) {
    #rin-debug { animation: none; }
    .rd-collapse svg { transition: none; }
}
`;
  var icon2 = (path) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = path;
    return svg;
  };
  var copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
    try {
      const area = mk("textarea", { value: text });
      css(area, { position: "fixed", top: "0", left: "0", opacity: "0" });
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  };
  var injectStyles = () => {
    if (document.getElementById(STYLE_ID2)) return;
    const style = mk("style", { id: STYLE_ID2, textContent: CSS2 });
    document.head.appendChild(style);
  };
  var mount = () => {
    if (document.getElementById(PANEL_ID)) return;
    const storage2 = createStorage();
    const saved = (() => {
      try {
        const raw = storage2.get(UI_KEY, "");
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        return value && typeof value === "object" ? value : {};
      } catch (_) {
        return {};
      }
    })();
    let mode = MODES.some((entry) => entry.id === saved.mode)
      ? saved.mode
      : "auto";
    injectStyles();
    const panel = mk("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "RINLink debug panel");
    const head = mk("div", { className: "rd-head" });
    const lamp = mk("span", { className: "rd-lamp" });
    const title = mk("span", { className: "rd-title", textContent: "RINLink" });
    const tag = mk("span", { className: "rd-tag", textContent: "debug" });
    const spacer = mk("span", { className: "rd-spacer" });
    const iconButton = (label, path, extraClass) => {
      const button = mk("button", {
        type: "button",
        className: extraClass ? `rd-ibtn ${extraClass}` : "rd-ibtn",
      });
      button.setAttribute("aria-label", label);
      button.title = label;
      button.appendChild(icon2(path));
      return button;
    };
    const collapseBtn = iconButton(
      "Collapse panel",
      '<path d="M4 6l4 4 4-4"/>',
      "rd-collapse",
    );
    const closeBtn = iconButton(
      "Close panel",
      '<path d="M4 4l8 8M12 4l-8 8"/>',
    );
    head.append(lamp, title, tag, spacer, collapseBtn, closeBtn);
    const body = mk("div", { className: "rd-body" });
    const stats = mk("div", { className: "rd-stats" });
    const statCells = {};
    for (const [key, label] of [
      ["resolved", "resolved"],
      ["inFlight", "in flight"],
      ["verifyPending", "verify"],
    ]) {
      const cell = mk("div", { className: "rd-stat" });
      const value = mk("b", { textContent: "0" });
      cell.append(value, mk("span", { textContent: label }));
      stats.appendChild(cell);
      statCells[key] = { cell, value };
    }
    const searchSection = mk("div", { className: "rd-section" });
    const searchHead = mk("div", { className: "rd-section-head" });
    const appLine = mk("div", { className: "rd-app" });
    const appIdEl = mk("b", { textContent: "no app" });
    const appNameEl = mk("span", { textContent: "" });
    appLine.append(appIdEl, appNameEl);
    searchHead.append(
      mk("span", { className: "rd-section-title", textContent: "Search" }),
      appLine,
    );
    const modes = mk("div", { className: "rd-modes" });
    const modeButtons = MODES.map((entry) => {
      const button = mk("button", { type: "button", textContent: entry.label });
      button.setAttribute("aria-pressed", String(entry.id === mode));
      button.addEventListener("click", () => {
        mode = entry.id;
        for (const item of modeButtons)
          item.button.setAttribute(
            "aria-pressed",
            String(item.entry.id === mode),
          );
        setResult(null);
        saveUi();
      });
      modes.appendChild(button);
      return { entry, button };
    });
    const runBtn = mk("button", {
      type: "button",
      className: "rd-run",
      textContent: "Run search",
    });
    const result = mk("div", { className: "rd-result", hidden: true });
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    const subActs = mk("div", { className: "rd-subacts" });
    searchSection.append(searchHead, modes, runBtn, result, subActs);
    const logbar = mk("div", { className: "rd-logbar" });
    const segment = mk("div", { className: "rd-seg" });
    let filter = FILTERS[0];
    const filterButtons = FILTERS.map((entry) => {
      const button = mk("button", { type: "button", textContent: entry.label });
      button.setAttribute("aria-pressed", String(entry === filter));
      button.addEventListener("click", () => {
        filter = entry;
        for (const item of filterButtons)
          item.button.setAttribute(
            "aria-pressed",
            String(item.entry === filter),
          );
        renderLog(true);
      });
      segment.appendChild(button);
      return { entry, button };
    });
    const copyBtn = mk("button", {
      type: "button",
      className: "rd-copy",
      textContent: "copy",
    });
    copyBtn.setAttribute("aria-label", "Copy log to clipboard");
    logbar.append(
      mk("span", { className: "rd-label", textContent: "Log" }),
      segment,
      copyBtn,
    );
    const logBox = mk("div", { className: "rd-log" });
    let stick = true;
    logBox.addEventListener("scroll", () => {
      stick = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 10;
    });
    const pageSection = mk("div", { className: "rd-page" });
    const pageActions = mk("div", { className: "rd-page-actions" });
    pageSection.append(
      mk("div", { className: "rd-section-title", textContent: "Page" }),
      pageActions,
    );
    const pageButtons = () => [...document.querySelectorAll("[data-rin-btn]")];
    const pageIds = () =>
      pageButtons()
        .map((button) => button.dataset.rinAppid)
        .filter(Boolean);
    const appInfo = () => {
      const btn = pageButtons()[0] ?? null;
      const appId =
        btn?.dataset.rinAppid || extractAppId(location.pathname) || null;
      const heading = document.querySelector("h1")?.textContent?.trim() || "";
      const pageTitle = document.title
        .split("·")[0]
        .replace(/\s+on Steam$/i, "")
        .trim();
      const appName = btn?.dataset.rinAppname || heading || pageTitle || null;
      return { btn, appId, appName };
    };
    let running = false;
    const refreshApp = () => {
      const { appId, appName } = appInfo();
      appIdEl.textContent = appId ? `app ${appId}` : "no app";
      appNameEl.textContent = appName ?? "";
      appNameEl.title = appName ?? "";
      runBtn.disabled = running || (!appId && !appName);
      const appIdMode = modeButtons.find((item) => item.entry.id === "appId");
      if (appIdMode) appIdMode.button.disabled = !appId;
    };
    const setResult = (text, state = "idle") => {
      if (!text) {
        result.hidden = true;
        result.textContent = "";
        delete result.dataset.state;
        return;
      }
      result.hidden = false;
      result.dataset.state = state;
      result.textContent = text;
    };
    const modeLabel = (id) =>
      MODES.find((entry) => entry.id === id)?.label ?? "Auto";
    const describeResult = (chosen, res) => {
      const label = modeLabel(chosen);
      switch (res.status) {
        case "ready":
          return `${label} search found a match.`;
        case "notfound":
          if (res.reason === "appid-mismatch")
            return `${label} search found a same-name topic, but its post is for a different app.`;
          return `${label} search found no matching topic.`;
        case "login":
          return `${label} search found no match as a guest. Some topics may be hidden.`;
        case "verify":
          return `${label} search was blocked. Verification is required.`;
        case "busy":
          return "A search is already running.";
        case "error":
          if (res.reason === "transport")
            return `${label} search got no clean response.`;
          if (res.reason === "flood")
            return `${label} search was rate limited.`;
          if (res.reason === "no-appid")
            return "No appId detected for an App ID search.";
          return `${label} search failed.`;
        default:
          return `${label} search finished with status ${res.status}.`;
      }
    };
    const runSearch = async () => {
      const { btn, appId, appName } = appInfo();
      if (!appId && !appName) {
        setResult("No app detected on this page.", "error");
        return;
      }
      if (mode === "appId" && !appId) {
        setResult("No appId detected for an App ID search.", "error");
        return;
      }
      const chosen = mode;
      running = true;
      refreshApp();
      runBtn.textContent = "Searching...";
      setResult(`${modeLabel(chosen)} search running.`, "pending");
      try {
        const res = await app.search.forceSearch(appId, appName, btn, chosen);
        if (res.status === "ready") {
          document
            .querySelectorAll("[data-rin-notfound], [data-rin-login]")
            .forEach((node) => node.remove());
          if (btn) {
            delete btn.dataset.rinNotfoundShown;
            delete btn.dataset.rinLoginShown;
            btn.removeAttribute("data-rin-notfound-btn");
          }
        }
        setResult(
          describeResult(chosen, res),
          res.status === "ready"
            ? "ready"
            : res.status === "busy" || res.status === "error"
              ? "error"
              : "idle",
        );
      } catch (e) {
        setResult(`Search failed: ${e.message}`, "error");
      } finally {
        running = false;
        runBtn.textContent = "Run search";
        refreshApp();
        render();
      }
    };
    runBtn.addEventListener("click", runSearch);
    const subAction = (label, run) => {
      const button = mk("button", {
        type: "button",
        className: "rd-act",
        textContent: label,
      });
      button.addEventListener("click", run);
      subActs.appendChild(button);
    };
    const pageAction = (label, run, wide) => {
      const button = mk("button", {
        type: "button",
        className: wide ? "rd-act rd-wide" : "rd-act",
        textContent: label,
      });
      button.addEventListener("click", run);
      pageActions.appendChild(button);
    };
    let lastEntry = null;
    const renderStats = () => {
      const state = app.search.getDebugState();
      for (const [key, cell] of Object.entries(statCells)) {
        const value = state[key] ?? 0;
        cell.value.textContent = String(value);
        cell.cell.classList.toggle("is-hot", key !== "resolved" && value > 0);
      }
    };
    const renderLog = (force) => {
      const entries = readLogBuffer();
      const last = entries[entries.length - 1] ?? null;
      if (!force && last === lastEntry) return;
      lastEntry = last;
      const rows = entries
        .filter((entry) => (LEVELS[entry.level] ?? 0) >= filter.min)
        .slice(-MAX_ROWS);
      if (!rows.length) {
        const message =
          filter.id === "all" ? "no entries yet" : `no ${filter.id} entries`;
        logBox.replaceChildren(
          mk("div", { className: "rd-empty", textContent: message }),
        );
        return;
      }
      logBox.replaceChildren(
        ...rows.map((entry) => {
          const row = mk("div", { className: "rd-row" });
          row.dataset.level = entry.level;
          row.append(
            mk("span", { className: "rd-t", textContent: entry.ts }),
            mk("span", {
              className: "rd-lv",
              textContent: entry.level.charAt(0).toUpperCase(),
            }),
            mk("span", { className: "rd-msg", textContent: entry.msg }),
          );
          return row;
        }),
      );
      if (stick) logBox.scrollTop = logBox.scrollHeight;
    };
    const render = () => {
      renderStats();
      renderLog(true);
      refreshApp();
    };
    subAction("Clear cache", () => {
      const ids = pageIds();
      const { appId } = appInfo();
      if (appId && !ids.includes(appId)) ids.push(appId);
      if (!ids.length) {
        setResult("No app to clear on this page.", "error");
        return;
      }
      app.search.clearCache(ids);
      log.info(`Debug: cache cleared for ${ids.join(", ")}`);
      setResult(`Cache cleared for ${ids.join(", ")}.`);
      render();
    });
    subAction("Force verify", () => {
      const { btn, appId, appName } = appInfo();
      if (!appId) {
        setResult("No appId to verify on this page.", "error");
        return;
      }
      app.search.retry(appId, btn?.dataset.rinAppname || appName, btn, null);
      setResult("Verification started.", "pending");
      render();
    });
    pageAction("Mark not found", () => {
      const { btn, appId, appName } = appInfo();
      if (!appId) {
        setResult("No appId on this page.", "error");
        return;
      }
      app.search.notFound(appId, btn?.dataset.rinAppname || appName, btn);
      setResult("Marked as not found.");
      render();
    });
    pageAction("Refetch page", () => {
      const ids = pageIds();
      app.search.clearCache(ids);
      for (const button of pageButtons()) button.remove();
      document
        .querySelectorAll("[data-rin-notfound], [data-rin-login]")
        .forEach((node) => node.remove());
      app.search.refetchAll();
      app.router.dispatch();
      log.info("Debug: page refetched");
      setResult("Page refetched.");
      render();
    });
    pageAction(
      "Dump to console",
      () => {
        log.dump();
      },
      true,
    );
    body.append(stats, searchSection, logbar, logBox, pageSection);
    panel.append(head, body);
    let lastX = 0;
    let lastY = 0;
    const place = (x, y) => {
      const maxX = Math.max(4, window.innerWidth - panel.offsetWidth - 4);
      const maxY = Math.max(4, window.innerHeight - 40);
      lastX = Math.min(Math.max(4, Math.round(x)), maxX);
      lastY = Math.min(Math.max(4, Math.round(y)), maxY);
      panel.style.left = `${lastX}px`;
      panel.style.top = `${lastY}px`;
      panel.style.right = "auto";
    };
    const saveUi = () => {
      storage2.set(
        UI_KEY,
        JSON.stringify({
          x: lastX,
          y: lastY,
          collapsed: panel.dataset.collapsed === "true",
          mode,
        }),
      );
    };
    const setCollapsed = (collapsed) => {
      panel.dataset.collapsed = String(collapsed);
      collapseBtn.setAttribute("aria-expanded", String(!collapsed));
      if (!collapsed) {
        place(lastX, lastY);
        render();
      }
      saveUi();
    };
    document.documentElement.appendChild(panel);
    panel.dataset.collapsed = String(saved.collapsed === true);
    collapseBtn.setAttribute("aria-expanded", String(saved.collapsed !== true));
    lastX = panel.offsetLeft;
    lastY = panel.offsetTop;
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y))
      place(saved.x, saved.y);
    render();
    collapseBtn.addEventListener("click", () =>
      setCollapsed(panel.dataset.collapsed !== "true"),
    );
    closeBtn.addEventListener("click", () => {
      clearInterval(timer);
      panel.remove();
      document.getElementById(STYLE_ID2)?.remove();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || panel.dataset.collapsed === "true") return;
      event.stopPropagation();
      setCollapsed(true);
    });
    const drag = { on: false, dx: 0, dy: 0 };
    head.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      drag.on = true;
      drag.dx = event.clientX - panel.offsetLeft;
      drag.dy = event.clientY - panel.offsetTop;
      head.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    head.addEventListener("pointermove", (event) => {
      if (!drag.on) return;
      place(event.clientX - drag.dx, event.clientY - drag.dy);
    });
    const endDrag = (event) => {
      if (!drag.on) return;
      drag.on = false;
      try {
        head.releasePointerCapture(event.pointerId);
      } catch (_) {}
      saveUi();
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", () => {
      if (!panel.isConnected || !panel.style.left) return;
      place(panel.offsetLeft, panel.offsetTop);
    });
    copyBtn.addEventListener("click", async () => {
      const text = readLogBuffer()
        .map((entry) => `${entry.ts} ${entry.level.padEnd(5)} ${entry.msg}`)
        .join("\n");
      const ok = await copyText(text || "RINLink debug log is empty");
      copyBtn.textContent = ok ? "copied" : "failed";
      setTimeout(() => (copyBtn.textContent = "copy"), 1200);
    });
    const timer = setInterval(() => {
      if (!document.documentElement.contains(panel)) {
        clearInterval(timer);
        return;
      }
      if (panel.dataset.collapsed === "true") return;
      renderStats();
      renderLog(false);
      refreshApp();
    }, 1e3);
    log.info("Debug panel loaded.");
  };
  if (!location.hostname.includes("cs.rin.ru")) mount();

  // src/rinlink/main.debug.js
  CFG.LOG_LEVEL = "debug";
})();
