/** Browser-safe wire contract shared by the extension and hosted pages.
 * @module assets/pages/lifecycle-contract
 */
export const PAGE_FRAGMENT_PARAM = Object.freeze({
  NAME: 'name', LOCALE: 'locale', ID: 'id', RATING: 'rating',
  CLIENT_ID: 'client_id', INSTALLED_AT: 'installed_at',
  VERSION: 'extension_version', UNINSTALL_RATING: 'rating_at_uninstall',
});
export const LIFECYCLE_EVENT = Object.freeze({
  INSTALL: 'extension_install', RATING: 'extension_rating', UNINSTALL: 'extension_uninstall',
});
export const LIFECYCLE_PAGE = Object.freeze({ WELCOME: 'welcome.html', RATING: 'rate-us.html', UNINSTALL: 'uninstall.html' });
export const UNKNOWN = 'unknown';
export const NOT_RATED = 'not_rated';
export const UNINSTALL_URL_MAX_LENGTH = 1023;
export const MILLISECONDS_PER_DAY = 86400000;
export const REDIRECT_TIMEOUT_MS = 2500;
export const RATING_POSITIVE_THRESHOLD = 4;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RATING_PATTERN = /^[1-5]$/;
const INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:[_-][a-zA-Z0-9]{2,8})?$/;
const VERSION_PATTERN = /^\d{1,5}(?:\.\d{1,5}){0,3}$/;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const SELECTION_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';
const NAME_MAX_LENGTH = 256;
const TIMESTAMP_MAX_LENGTH = 16;
/** Last millisecond of a four-digit UTC year, matching the YYYY-MM contract. */
const MAX_DATE = 253402300799999;
const HASH = '#';
const HASH_PREFIX_LENGTH = 1;
const MONTH_LENGTH = 7;
const ZERO = 0;
const SAMPLE_PRESENT = 1;

/** @typedef {{clientId: string, installedAt: number|null}} InstallationRecord */
/** @typedef {InstallationRecord & {version: string, ratingAtUninstall?: string}} LifecycleContext */

/** Validate a cryptographically generated installation identifier.
 * @param {unknown} value @returns {value is string} */
export function isClientId(value) { return typeof value === STRING_TYPE && UUID_PATTERN.test(/** @type {string} */ (value)); }
/** Validate an exact star category. @param {unknown} value @returns {value is string} */
export function isRating(value) { return typeof value === STRING_TYPE && RATING_PATTERN.test(/** @type {string} */ (value)); }
/** Validate a UTC millisecond value. @param {unknown} value @returns {value is number} */
export function isTimestamp(value) { return Number.isSafeInteger(value) && Number(value) >= ZERO && Number(value) <= MAX_DATE; }
/** Validate persisted identity without guessing its date.
 * @param {unknown} value @returns {value is InstallationRecord} */
export function isInstallationRecord(value) {
  if (!value || typeof value !== OBJECT_TYPE) return false;
  const record = /** @type {InstallationRecord} */ (value);
  return isClientId(record.clientId) && (record.installedAt === null || isTimestamp(record.installedAt));
}
/** Accept only the canonical UTC timestamp written by the rating operation.
 * @param {unknown} value @returns {boolean} */
function isSelectionTimestamp(value) {
  if (typeof value !== STRING_TYPE || !SELECTION_TIMESTAMP_PATTERN.test(/** @type {string} */ (value))) return false;
  const time = Date.parse(/** @type {string} */ (value));
  return isTimestamp(time) && new Date(time).toISOString() === value;
}
/** Derive the removal rating from the existing atomic selection state.
 * @param {unknown} completed @param {unknown} rating @param {unknown} selectedAt @returns {string} */
export function uninstallRating(completed, rating, selectedAt) {
  if ((completed === false || completed === undefined) && (rating === null || rating === undefined) && (selectedAt === null || selectedAt === undefined)) return NOT_RATED;
  if (completed === true && Number.isInteger(rating) && isRating(String(rating)) && isSelectionTimestamp(selectedAt)) return String(rating);
  return UNKNOWN;
}
/** Read each known field once; duplicates invalidate that field and analytics.
 * @param {string} hash */
export function parseFragment(hash) {
  const params = new URLSearchParams(hash.startsWith(HASH) ? hash.slice(HASH_PREFIX_LENGTH) : hash);
  let duplicate = false;
  /** @type {Record<string, string|null>} */
  const fields = {};
  for (const key of Object.values(PAGE_FRAGMENT_PARAM)) {
    const values = params.getAll(key);
    if (values.length > SAMPLE_PRESENT) duplicate = true;
    fields[key] = values.length === SAMPLE_PRESENT ? values[ZERO] : null;
  }
  const p = PAGE_FRAGMENT_PARAM;
  const rawDate = fields[p.INSTALLED_AT];
  const dateValid = rawDate === null || (rawDate.length <= TIMESTAMP_MAX_LENGTH && INTEGER_PATTERN.test(rawDate) && isTimestamp(Number(rawDate)));
  const locale = fields[p.LOCALE];
  const version = fields[p.VERSION];
  const clientId = fields[p.CLIENT_ID];
  const valid = !duplicate && isClientId(clientId) && !!locale && LOCALE_PATTERN.test(locale) && !!version && VERSION_PATTERN.test(version) && dateValid;
  return {
    name: fields[p.NAME] && (fields[p.NAME]?.length ?? Infinity) <= NAME_MAX_LENGTH ? fields[p.NAME] : null,
    locale: locale && LOCALE_PATTERN.test(locale) ? locale : null,
    id: fields[p.ID] && EXTENSION_ID_PATTERN.test(/** @type {string} */ (fields[p.ID])) ? fields[p.ID] : null,
    rating: isRating(fields[p.RATING]) ? fields[p.RATING] : null,
    lifecycle: valid ? { clientId: /** @type {string} */ (clientId), installedAt: rawDate === null ? null : Number(rawDate), version: /** @type {string} */ (version) } : null,
    ratingAtUninstall: isRating(fields[p.UNINSTALL_RATING]) || fields[p.UNINSTALL_RATING] === NOT_RATED ? fields[p.UNINSTALL_RATING] : UNKNOWN,
  };
}

/** Serialize display values and a validated optional lifecycle without truncation.
 * @param {string} base @param {Record<string, string>} display @param {LifecycleContext|null} [context] @returns {string} */
export function buildLifecycleUrl(base, display, context = null) {
  const fragment = new URLSearchParams();
  /** @type {Record<string, (value: string) => boolean>} */
  const validators = {
    [PAGE_FRAGMENT_PARAM.NAME]: /** @param {string} value */ value => value.length <= NAME_MAX_LENGTH,
    [PAGE_FRAGMENT_PARAM.LOCALE]: /** @param {string} value */ value => LOCALE_PATTERN.test(value),
    [PAGE_FRAGMENT_PARAM.ID]: /** @param {string} value */ value => EXTENSION_ID_PATTERN.test(value),
    [PAGE_FRAGMENT_PARAM.RATING]: isRating,
  };
  for (const [key, value] of Object.entries(display)) {
    if (typeof value === STRING_TYPE && validators[key]?.(value)) fragment.set(key, value);
  }
  if (context && isInstallationRecord(context) && VERSION_PATTERN.test(context.version)) {
    fragment.set(PAGE_FRAGMENT_PARAM.CLIENT_ID, context.clientId);
    if (context.installedAt !== null) fragment.set(PAGE_FRAGMENT_PARAM.INSTALLED_AT, String(context.installedAt));
    fragment.set(PAGE_FRAGMENT_PARAM.VERSION, context.version);
    if (context.ratingAtUninstall) fragment.set(PAGE_FRAGMENT_PARAM.UNINSTALL_RATING, context.ratingAtUninstall);
  }
  if (context && !parseFragment(fragment.toString()).lifecycle) {
    for (const key of [PAGE_FRAGMENT_PARAM.CLIENT_ID, PAGE_FRAGMENT_PARAM.INSTALLED_AT, PAGE_FRAGMENT_PARAM.VERSION, PAGE_FRAGMENT_PARAM.UNINSTALL_RATING]) fragment.delete(key);
  }
  const result = `${base}${HASH}${fragment}`;
  return new URL(base).pathname.endsWith(LIFECYCLE_PAGE.UNINSTALL) && result.length > UNINSTALL_URL_MAX_LENGTH ? base : result;
}

/** Build the allowlisted lifecycle event at the first observed page time.
 * @param {string} page @param {ReturnType<typeof parseFragment>} context @param {number} now */
export function buildLifecycleEvent(page, context, now) {
  const life = context.lifecycle;
  if (!life) return null;
  /** @type {Record<string, string|number>} */
  const params = {
    extension_locale: /** @type {string} */ (context.locale), extension_version: life.version,
    install_month: life.installedAt === null ? UNKNOWN : new Date(life.installedAt).toISOString().slice(ZERO, MONTH_LENGTH),
  };
  let name;
  if (page === LIFECYCLE_PAGE.WELCOME && life.installedAt !== null) name = LIFECYCLE_EVENT.INSTALL;
  else if (page === LIFECYCLE_PAGE.RATING && context.rating) {
    name = LIFECYCLE_EVENT.RATING;
    params.rating = context.rating;
  } else if (page === LIFECYCLE_PAGE.UNINSTALL) {
    name = LIFECYCLE_EVENT.UNINSTALL;
    params.rating_at_uninstall = context.ratingAtUninstall || UNKNOWN;
    const days = life.installedAt === null ? NaN : (now - life.installedAt) / MILLISECONDS_PER_DAY;
    const measured = Number.isFinite(days) && days >= ZERO;
    params.lifetime_sample = measured ? SAMPLE_PRESENT : ZERO;
    if (measured) params.lifetime_days = days;
  } else return null;
  return { name, params, clientId: life.clientId };
}
