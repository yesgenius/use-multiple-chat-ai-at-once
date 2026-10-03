/** Connect hosted UI to its two independent analytics transports.
 * @module assets/pages/hosted-controller */
import { HOSTED_CONFIG } from './hosted-config.js';
import { readPageContext } from './page-context.js';
import { buildLifecycleEvent, LIFECYCLE_PAGE, RATING_POSITIVE_THRESHOLD, REDIRECT_TIMEOUT_MS } from './lifecycle-contract.js';
import { sendGa4 } from './ga4.js';
import { sendMetrika } from './metrika.js';
const DOM = Object.freeze({ NAME: '.nm', PRIVACY: 'privacy-link', REINSTALL: 'reinstall', REINSTALL_LINK: 'reinstall-link', STARS: 'stars', INTERSTITIAL: 'interstitial', FEEDBACK: 'feedback', FALLBACK: 'store-fallback' });
const STAR = '★';
const PATH_SEPARATOR = '/';
const REVIEWS_PATH = '/reviews';
const PRIVACY_LABEL = 'Privacy policy';
const HTTP_PROTOCOLS = new Set(['https:', 'http:']);
const PAGE_HIDE = 'pagehide';
const EMPTY = '';

/** Reveal only a configured, named privacy link; missing is intentionally absent.
 * @param {Document} document @param {string} value */
export function configurePrivacyLink(document, value) {
  const anchor = /** @type {HTMLAnchorElement|null} */ (document.getElementById(DOM.PRIVACY));
  if (!anchor || !value) return;
  try {
    const url = new URL(value);
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) return;
    anchor.href = url.href;
    anchor.textContent = PRIVACY_LABEL;
    anchor.hidden = false;
  } catch { /* No invented address replaces a missing deployment value. */ }
}

/** One navigation owner, one shared deadline from before either SDK starts.
 * @param {Window} target @param {string} url @param {() => Promise<unknown>} start @param {{active: boolean}} lifetime */
export function redirectAfterAnalytics(target, url, start, lifetime) {
  return new Promise(resolve => {
    let done = false;
    /** Navigate at most once, invalidating unfinished lifecycle work. */
    function finish() {
      if (done) return;
      done = true;
      lifetime.active = false;
      target.clearTimeout(timer);
      target.location.replace(url);
      resolve(undefined);
    }
    const timer = target.setTimeout(finish, REDIRECT_TIMEOUT_MS);
    start().then(finish, finish);
  });
}

/** Bootstrap the actual page with a deployment-owned configuration.
 * @param {Window} target @param {typeof HOSTED_CONFIG} [config] */
export function startHostedPage(target, config = HOSTED_CONFIG) {
  const page = readPageContext(target);
  const document = target.document;
  const fragment = page.context;
  const lifetime = { active: true };
  target.addEventListener(PAGE_HIDE, () => { lifetime.active = false; }, { once: true });
  let destination = EMPTY;
  if (page.page === LIFECYCLE_PAGE.WELCOME) {
    const name = document.querySelector(DOM.NAME);
    if (name && fragment.name) { name.textContent = fragment.name; target.schedule?.(); }
    configurePrivacyLink(document, config.privacyUrl);
  } else if (page.page === LIFECYCLE_PAGE.UNINSTALL) {
    configurePrivacyLink(document, config.privacyUrl);
    if (fragment.id) {
      const link = /** @type {HTMLAnchorElement} */ (document.getElementById(DOM.REINSTALL_LINK));
      link.href = config.storeBaseUrl + PATH_SEPARATOR + encodeURIComponent(fragment.id);
      const wrapper = document.getElementById(DOM.REINSTALL);
      if (wrapper) wrapper.hidden = false;
    }
  } else if (page.page === LIFECYCLE_PAGE.RATING) {
    const positive = fragment.rating && Number(fragment.rating) >= RATING_POSITIVE_THRESHOLD && fragment.id;
    const visible = document.getElementById(positive ? DOM.INTERSTITIAL : DOM.FEEDBACK);
    if (visible) visible.hidden = false;
    if (positive) {
      const stars = document.getElementById(DOM.STARS);
      if (stars) stars.textContent = STAR.repeat(Number(fragment.rating));
      destination = config.storeBaseUrl + PATH_SEPARATOR + encodeURIComponent(/** @type {string} */ (fragment.id)) + REVIEWS_PATH;
      const fallback = /** @type {HTMLAnchorElement} */ (document.getElementById(DOM.FALLBACK));
      fallback.href = destination;
    }
  } else return Promise.resolve();
  const event = buildLifecycleEvent(page.page, fragment, page.observedAt);
  /** Begin both transports together; neither gates the other. */
  const send = () => Promise.allSettled([
    sendMetrika(target, config.metrika, page, event, lifetime),
    sendGa4(target, config.ga4, event, page.pageLocation, lifetime),
  ]);
  return destination ? redirectAfterAnalytics(target, destination, send, lifetime) : send();
}
