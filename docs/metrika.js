// @ts-check
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
 *  2. Build visit params from `locale` + the current page. `locale` is a
 *     drill-down param: locale → <locale-key> → <page> ('welcome' / 'uninstall'
 *     / 'rate_us'). Its level1/level2 match the old flat form byte-for-byte, so
 *     the Parameters report still counts each of the 53 locales; the page label
 *     only adds an optional level-3 breakdown (opens per page, within a locale).
 *     `language` is the part before `_`/`-`, for grouping. Country is not sent
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

  // ── 2) Build visit params from locale + the current page. ──────────────────
  // `locale` becomes a drill-down: locale → <loc> → <page>. level1/level2 stay
  // byte-identical to the old flat form (per-locale counts and segments keep
  // working); the page label only adds an optional level-3 breakdown.
  var loc = window.PAGE_FRAGMENT.locale || '';
  // Page label = filename without extension, '-'→'_' (welcome | uninstall |
  // rate_us). Derived straight from the URL — no lookup table to keep in sync.
  var page = location.pathname.split('/').pop().replace(/\.html$/, '').replace(/-/g, '_');
  var visitParams = {};
  if (loc) {
    // String leaf (page label) → Metrika counts occurrences; a numeric leaf
    // would be summed as a quantitative measure (same rule as rate-us `rating`).
    /** @type {string|Record<string, string>} */
    var localeParam = loc; // no filename (e.g. dir URL) → flat locale (still counts per locale)
    if (page) {
      localeParam = {};
      localeParam[loc] = page; // { <loc>: '<page>' } → locale → <loc> → <page>
    }
    visitParams[LOCALE_PARAM_KEY] = localeParam;
    visitParams[LANGUAGE_PARAM_KEY] = loc.split(/[_-]/)[0].toLowerCase(); // grouping (e.g. pt)
  }

  // ── 3) Strip the fragment before init so rating/name never enter hit URLs. ─
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  // ── 4) Init Metrika after the fragment is read → params in first pageview. ─
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date().getTime();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
  })(window, document, 'script', YM_TAG_SRC, 'ym');

  YM_INIT_OPTIONS.params = visitParams; // attach locale/language to the first pageview
  ym(YM_COUNTER_ID, 'init', YM_INIT_OPTIONS);

  // ── 5) Tiny API closing over the counter id. ───────────────────────────────
  window.Metrika = {
    /**
     * Fire a list of goals.
     * @param {{goal:string, params?:object}[]} goals
     */
    reachGoals: function (goals) {
      for (var i = 0; i < goals.length; i++) {
        ym(YM_COUNTER_ID, 'reachGoal', goals[i].goal, goals[i].params);
      }
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
})();
