/** Google tag adapter for ordinary hosted documents only.
 * @module assets/pages/ga4 */
import { loadSdk } from './sdk-loader.js';
import { reserveAttempt } from './attempt-journal.js';
import { REDIRECT_TIMEOUT_MS } from './lifecycle-contract.js';
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;
const MEASUREMENT_ID_QUERY = 'id';
const COMMAND = Object.freeze({ CONSENT: 'consent', DEFAULT: 'default', JS: 'js', CONFIG: 'config', EVENT: 'event' });
const DENIED = 'denied';
const GRANTED = 'granted';
const EMPTY = '';
const LOG_DISABLED = '[HostedAnalytics] GA4 disabled; SDK skipped';
const LOG_INVALID_CONFIG = '[HostedAnalytics] Invalid GA4 configuration; SDK skipped';
const LOG_INVALID_CONTEXT = '[HostedAnalytics] Missing or invalid lifecycle context; SDK skipped';
const LOG_FAILED = '[HostedAnalytics] GA4 SDK or transfer failed';
const LOG_ATTEMPT = '[HostedAnalytics] GA4 event handed to SDK';

/** Load, reserve, then hand one event to the SDK; callback is not a receipt.
 * @param {Window} target
 * @param {typeof import('./hosted-config.js').HOSTED_CONFIG.ga4} config
 * @param {ReturnType<typeof import('./lifecycle-contract.js').buildLifecycleEvent>} event
 * @param {string} pageLocation
 * @param {{active: boolean}} lifetime
 * @returns {Promise<void>} */
export async function sendGa4(target, config, event, pageLocation, lifetime) {
  if (!config.enabled) { console.info(LOG_DISABLED); return; }
  if (!MEASUREMENT_ID_PATTERN.test(config.measurementId)) { console.warn(LOG_INVALID_CONFIG); return; }
  if (!event) { console.info(LOG_INVALID_CONTEXT); return; }
  try {
    target.dataLayer = target.dataLayer || [];
    /** Queue the native arguments object expected by Google tag. */
    target.gtag = function () { target.dataLayer.push(arguments); };
    target.gtag(COMMAND.CONSENT, COMMAND.DEFAULT, { ad_storage: DENIED, ad_user_data: DENIED, ad_personalization: DENIED, analytics_storage: GRANTED });
    target.gtag(COMMAND.JS, new Date());
    target.gtag(COMMAND.CONFIG, config.measurementId, {
      client_id: event.clientId, send_page_view: false, page_location: pageLocation, page_referrer: EMPTY,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      ...(config.debug ? { debug_mode: true } : {}),
    });
    const url = new URL(config.sdkUrl, target.location.href);
    url.searchParams.set(MEASUREMENT_ID_QUERY, config.measurementId);
    await loadSdk(target, url.href);
    if (!lifetime.active) return;
    if (!await reserveAttempt(target, config.measurementId, event.clientId, event.name) || !lifetime.active) return;
    await new Promise(resolve => {
      const timer = target.setTimeout(resolve, REDIRECT_TIMEOUT_MS);
      target.gtag(COMMAND.EVENT, event.name, {
        ...event.params, send_to: config.measurementId, client_id: event.clientId,
        page_location: pageLocation, page_referrer: EMPTY,
        ...(config.debug ? { debug_mode: true } : {}),
        event_callback: () => { target.clearTimeout(timer); resolve(undefined); },
        event_timeout: REDIRECT_TIMEOUT_MS,
      });
      console.info(LOG_ATTEMPT, event.name);
    });
  } catch { console.warn(LOG_FAILED); }
}
