/** Visit counter transport: the view and goals of each lifecycle open, mirrored from the event stream.
 * @module assets/pages/metrika */
import { loadSdk } from './sdk-loader.js';
import { reserveAttempt } from './attempt-journal.js';
import { REDIRECT_TIMEOUT_MS, LIFECYCLE_EVENT } from './lifecycle-contract.js';
const COUNTER_ID_QUERY = 'id';
const MIN_COUNTER_ID = 1;
const COMMAND_INIT = 'init';
const COMMAND_HIT = 'hit';
const COMMAND_GOAL = 'reachGoal';
/**
 * Prefix of the counter's stream in the attempt journal. The journal keys a
 * stream by its recipient; the prefix keeps a counter number from ever meeting
 * a lifecycle stream identifier under the same key.
 */
export const COUNTER_STREAM_PREFIX = 'counter:';
/**
 * Joins a rating goal to its star count. Each star count is a goal of its own,
 * named here and created in the cabinet under the same name, so the goals
 * report shows the rating distribution without a breakdown by parameter.
 */
export const RATING_GOAL_SEPARATOR = '_';

/**
 * Every recording behaviour of the visit counter, stated here rather than left
 * to the SDK's defaults. The published privacy policy names what these pages
 * record; a default that changes on the vendor's side would silently make that
 * document false, so each behaviour the SDK offers is switched on or off by
 * name. Exported because the policy statement is only as true as this object.
 *
 * - `defer` — no automatic page view at init; the one view is sent explicitly
 *   below, with a sanitized address.
 * - `clickmap` — no pointer coordinates are collected.
 * - `trackLinks` — outbound link clicks are recorded.
 * - `accurateTrackBounce` — time on page distinguishes a read from a bounce.
 * - `webvisor` — no session recording.
 * - `ecommerce` — no purchase data layer; these pages sell nothing.
 */
export const COUNTER_OPTIONS = Object.freeze({
  defer: true,
  clickmap: false,
  trackLinks: true,
  accurateTrackBounce: true,
  webvisor: false,
  ecommerce: false
});
const LANGUAGE_SEPARATOR = /[_-]/;
const PAGE_SUFFIX = /\.html$/;
const PAGE_DASH = /-/g;
const PAGE_JOIN = '_';
const EMPTY = '';
const FIRST = 0;
const LOG_DISABLED = '[HostedAnalytics] Metrika disabled; SDK skipped';
const LOG_INVALID_CONFIG = '[HostedAnalytics] Invalid Metrika configuration; SDK skipped';
const LOG_INVALID_CONTEXT = '[HostedAnalytics] Missing or invalid lifecycle context; Metrika SDK skipped';
const LOG_FAILED = '[HostedAnalytics] Metrika SDK or goal failed';
const LOG_ATTEMPT = '[HostedAnalytics] Metrika lifecycle goals handed to SDK';
/** @typedef {{goal: string, params?: object}} Goal */
/** @typedef {ReturnType<typeof import('./lifecycle-contract.js').buildLifecycleEvent>} LifecycleEvent */

/** Whether a configured value can name a counter.
 * @param {unknown} value @returns {value is number} */
function isCounterId(value) {
  return Number.isSafeInteger(value) && /** @type {number} */ (value) >= MIN_COUNTER_ID;
}

/**
 * Goals that mirror one lifecycle event: the event under its own name with its
 * own parameters, and for a rating also the goal naming the star count.
 * @param {NonNullable<LifecycleEvent>} event @returns {Goal[]}
 */
export function lifecycleGoals(event) {
  /** @type {Goal[]} */
  const goals = [{ goal: event.name, params: event.params }];
  if (event.name === LIFECYCLE_EVENT.RATING) goals.push({ goal: event.name + RATING_GOAL_SEPARATOR + event.params.rating });
  return goals;
}

/**
 * Send the page view and the goals mirroring one lifecycle event; the
 * controller alone owns navigation.
 *
 * These pages exist to meet an installation at a moment of its lifecycle, so
 * only an open that carries such a moment is measured. Without an event, as
 * without a named and enabled counter, the counter is never contacted: no SDK,
 * no hit, no goal. A reload, a shared link or a look at the published page
 * therefore counts nowhere. Goals follow the lifecycle stream's rules — only
 * while the page is still live, and at most once per installation and event
 * through the attempt journal — so both recipients count the same facts. The
 * counter receives no user identifier: none of its reports is built on one, and
 * a page sends a third party nothing it has no use for.
 *
 * @param {Window} target
 * @param {typeof import('./hosted-config.js').HOSTED_CONFIG.metrika} config
 * @param {ReturnType<typeof import('./page-context.js').readPageContext>} page
 * @param {LifecycleEvent} event
 * @param {{active: boolean}} lifetime
 * @returns {Promise<void>} */
export async function sendMetrika(target, config, page, event, lifetime) {
  if (!config.enabled) { console.info(LOG_DISABLED); return; }
  const counterId = config.counterId;
  if (!isCounterId(counterId)) { console.warn(LOG_INVALID_CONFIG); return; }
  if (!event) { console.info(LOG_INVALID_CONTEXT); return; }
  try {
    const url = new URL(config.sdkUrl, target.location.href);
    url.searchParams.set(COUNTER_ID_QUERY, String(counterId));
    /** @type {IArguments[]} */
    const pending = [];
    /** Queue commands until the SDK replaces its bootstrap function. */
    const enqueue = function () { pending.push(arguments); };
    target.ym = Object.assign(enqueue, { a: pending, l: Date.now() });
    // A lifecycle event exists only for a context that carries a valid locale.
    const locale = /** @type {string} */ (page.context.locale);
    const label = page.page.replace(PAGE_SUFFIX, EMPTY).replace(PAGE_DASH, PAGE_JOIN);
    const params = { locale: { [locale]: label }, language: locale.split(LANGUAGE_SEPARATOR)[FIRST].toLowerCase() };
    target.ym(counterId, COMMAND_INIT, { ...COUNTER_OPTIONS, params });
    await loadSdk(target, url.href);
    target.ym(counterId, COMMAND_HIT, page.pageLocation, { referer: EMPTY });
    if (!lifetime.active
      || !await reserveAttempt(target, COUNTER_STREAM_PREFIX + counterId, event.clientId, event.name) || !lifetime.active) return;
    const sent = lifecycleGoals(event);
    console.info(LOG_ATTEMPT, event.name);
    // Each goal waits at most the redirect budget: a page that navigates away
    // must not be held back by a counter that never acknowledges.
    await Promise.all(sent.map(goal => new Promise(resolve => {
      const timer = target.setTimeout(resolve, REDIRECT_TIMEOUT_MS);
      target.ym(counterId, COMMAND_GOAL, goal.goal, goal.params, () => { target.clearTimeout(timer); resolve(undefined); });
    })));
  } catch { console.warn(LOG_FAILED); }
}
