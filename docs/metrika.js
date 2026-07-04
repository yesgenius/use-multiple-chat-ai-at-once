/**
 * Shared Yandex.Metrika bootstrap for the hosted pages
 * (welcome / uninstall / rate-us). External page only — no extension code here.
 * MV3 CSP (`script-src 'self'`) forbids remote scripts in the sidebar, which is
 * why analytics lives on these hosted GitHub Pages instead of in the extension.
 *
 * Responsibilities (SRP: analytics bootstrap only):
 *  1. Parse the URL fragment once and expose it as `window.PAGE_FRAGMENT`
 *     ({ name, locale, id, rating }; missing → null) BEFORE stripping it. The
 *     param names mirror shared/constants.js PAGE_FRAGMENT_PARAM (contract;
 *     guarded by tests/unit/pages/contract-mirror.test.js).
 *  2. Build two Metrika visit params from `locale`: `locale` (raw, the exact
 *     per-locale key so the Parameters report counts each of the 53 locales) and
 *     `language` (the part before `_`/`-`, for grouping). Country is not sent
 *     (Metrika's IP geo covers it); `name` is fragment-only, not a Metrika param.
 *  3. Strip the fragment (history.replaceState) so rating/name never enter hits.
 *  4. Init Metrika (counter 110166603) with those visit params.
 *  5. Expose `window.Metrika`: `reachGoals(goals)` and
 *     `reachGoalsThenRedirect(goals, url, timeoutMs)`.
 *
 * @module assets/pages/metrika
 */
(function () {
  'use strict';

  // ── DEBUG INSTRUMENTATION (TEMPORARY — remove after diagnosing uninstall_opened).
  //     Every event is one console line, prefix "[Metrika DEBUG]", payload already
  //     JSON.stringify'd → the whole console can be copied verbatim, no object needs
  //     mouse-expanding. Set DEBUG = false (or revert this commit) to disable.
  var DEBUG = true;
  var START = Date.now();
  var TAG_LOADED = null;      // true = tag.js onload, false = onerror (blocked), null = unknown
  var DBG_WATCHDOG_MS = 5000; // after this long, report goal callbacks that never fired
  function dbg(event, data) {
    if (!DEBUG) return;
    var s;
    try { s = JSON.stringify(data); } catch (e) { s = '"<unstringifiable:' + e + '>"'; }
    console.log('[Metrika DEBUG] ' + event + ' ' + s);
  }
  // Capture the ASYNC exception thrown inside tag.js while it drains the ym queue
  // (our try/catch around ym() can't see it — ym() only enqueues). This prints the
  // actual error message + location the plain stack trace was missing.
  if (DEBUG) {
    window.addEventListener('error', function (ev) {
      dbg('window_error', {
        message: ev.message || null,
        source: ev.filename || null,
        line: ev.lineno || null,
        col: ev.colno || null,
        stack: (ev.error && ev.error.stack) ? String(ev.error.stack).slice(0, 600) : null,
      });
    });
    window.addEventListener('unhandledrejection', function (ev) {
      dbg('unhandled_rejection', { reason: String(ev && ev.reason).slice(0, 600) });
    });
    // tag.js swallows its errors and prints them via console.error/console.warn —
    // window.onerror never sees them, so the plain stack has no message. Wrap the
    // console methods to surface the ACTUAL message + stack (as a string).
    ['error', 'warn'].forEach(function (level) {
      if (!window.console || typeof console[level] !== 'function') return;
      var orig = console[level].bind(console);
      console[level] = function () {
        try {
          var parts = [];
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (a instanceof Error) { parts.push(String(a.message) + ' || ' + String(a.stack).slice(0, 500)); }
            else if (a && typeof a === 'object') { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
            else { parts.push(String(a)); }
          }
          dbg('console_' + level, { args: parts });
        } catch (e) { /* never break console */ }
        return orig.apply(console, arguments);
      };
    });
  }

  // ── Named constants (No Magic Values) ──────────────────────────────────────
  var YM_COUNTER_ID = 110166603; // MIRRORS YM_COUNTER_ID (shared/constants.js); also in every page's noscript pixel
  var YM_TAG_SRC = 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_COUNTER_ID;

  // Fragment parameter names — CONTRACT with the extension (shared/constants.js
  // PAGE_FRAGMENT_PARAM). Must match byte-for-byte across all hosted pages.
  var FRAGMENT_PARAM_NAME = 'name';
  var FRAGMENT_PARAM_LOCALE = 'locale';
  var FRAGMENT_PARAM_ID = 'id';
  var FRAGMENT_PARAM_RATING = 'rating';

  // Metrika visit-parameter keys (page-internal; No Magic Values).
  var LOCALE_PARAM_KEY = 'locale';
  var LANGUAGE_PARAM_KEY = 'language';

  // Metrika init options (No Magic Values). Trimmed to what these static pages
  // actually use. Deliberately OFF: webvisor (session replay — low value here,
  // adds load weight + privacy footprint on a removal/rating page), clickmap
  // (heatmap — not needed for open-counting), ecommerce/ssr (not applicable to
  // static pages). `referrer`/`url` are omitted because they are Metrika's own
  // defaults, and the fragment is already stripped before init (below), so no
  // rating/name can leak into the hit URL. Kept: trackLinks (outbound reinstall
  // / store link clicks) and accurateTrackBounce. `params` is attached per-page.
  var YM_INIT_OPTIONS = {
    trackLinks: true,
    accurateTrackBounce: true,
  };

  // ── 1) Parse the fragment once; expose it before stripping. ────────────────
  var fragment = new URLSearchParams(location.hash.slice(1));
  window.PAGE_FRAGMENT = {
    name: fragment.get(FRAGMENT_PARAM_NAME),
    locale: fragment.get(FRAGMENT_PARAM_LOCALE),
    id: fragment.get(FRAGMENT_PARAM_ID),
    rating: fragment.get(FRAGMENT_PARAM_RATING),
  };
  dbg('fragment_parsed', { hash: location.hash, fragment: window.PAGE_FRAGMENT });

  // ── 2) Build visit params from locale only (name is not a Metrika param). ──
  var loc = window.PAGE_FRAGMENT.locale || '';
  var visitParams = {};
  if (loc) {
    visitParams[LOCALE_PARAM_KEY] = loc;                                  // exact per-locale key (each of 53)
    visitParams[LANGUAGE_PARAM_KEY] = loc.split(/[_-]/)[0].toLowerCase(); // grouping (e.g. pt)
  }
  dbg('visit_params', visitParams);

  // ── 3) Strip the fragment before init so rating/name never enter hit URLs. ─
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  // ── 4) Init Metrika after the fragment is read → params in first pageview. ─
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r;
    if (DEBUG) {
      k.onload = function () { TAG_LOADED = true; dbg('tagjs_onload', { src: r, atMs: Date.now() - START }); };
      k.onerror = function () { TAG_LOADED = false; dbg('tagjs_onerror', { src: r, atMs: Date.now() - START }); };
    }
    a.parentNode.insertBefore(k, a);
  })(window, document, 'script', YM_TAG_SRC, 'ym');

  dbg('after_loader', { ymType: typeof window.ym, tagSrc: YM_TAG_SRC });

  YM_INIT_OPTIONS.params = visitParams; // attach locale/language to the first pageview
  ym(YM_COUNTER_ID, 'init', YM_INIT_OPTIONS);
  dbg('init_called', { counter: YM_COUNTER_ID, options: YM_INIT_OPTIONS });

  // ── 5) Tiny API closing over the counter id. ───────────────────────────────
  window.Metrika = {
    /**
     * Fire a list of goals.
     * @param {{goal:string, params?:object}[]} goals
     */
    reachGoals: function (goals) {
      dbg('reachGoals_called', { count: goals.length, ymType: typeof window.ym });
      var delivered = {};
      for (var i = 0; i < goals.length; i++) {
        (function (g) {
          dbg('reachGoal_send', { counter: YM_COUNTER_ID, goal: g.goal, params: g.params });
          try {
            ym(YM_COUNTER_ID, 'reachGoal', g.goal, g.params, function () {
              delivered[g.goal] = true;
              dbg('reachGoal_callback', { goal: g.goal, atMs: Date.now() - START });
            });
          } catch (e) {
            dbg('reachGoal_throw', { goal: g.goal, error: String(e) });
          }
        })(goals[i]);
      }
      setTimeout(function () {
        var pending = [];
        for (var j = 0; j < goals.length; j++) {
          if (!delivered[goals[j].goal]) { pending.push(goals[j].goal); }
        }
        dbg('reachGoal_watchdog', { pendingCallbacks: pending, ymType: typeof window.ym, tagLoaded: TAG_LOADED });
      }, DBG_WATCHDOG_MS);
    },
    /**
     * Fire a list of goals, then navigate to `url` — on the LAST goal's callback
     * OR after `timeoutMs` (a hard fallback if Metrika is blocked/slow), once
     * (whichever fires first). The timeout must cover a cold tag.js load.
     * @param {{goal:string, params?:object}[]} goals
     * @param {string} url
     * @param {number} timeoutMs
     */
    reachGoalsThenRedirect: function (goals, url, timeoutMs) {
      var done = false;
      function go() { if (done) return; done = true; location.replace(url); }
      try {
        for (var i = 0; i < goals.length; i++) {
          var cb = (i === goals.length - 1) ? go : undefined; // redirect after the last hit is sent
          ym(YM_COUNTER_ID, 'reachGoal', goals[i].goal, goals[i].params, cb);
        }
      } catch (e) { go(); }
      setTimeout(go, timeoutMs); // hard fallback if Metrika is blocked/slow
    },
  };
  dbg('api_ready', { hasMetrika: typeof window.Metrika });
})();
