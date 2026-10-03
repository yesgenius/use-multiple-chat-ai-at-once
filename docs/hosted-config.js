/** Deployment configuration; URL and site storage cannot select recipients.
 * @module assets/pages/hosted-config */
import { HOSTED_STORE_BASE_URL, HOSTED_PRIVACY_URL } from './hosted-addresses.js';
/** Recipient of the shipped bundle's lifecycle events; the deployment holds it nowhere else. */
const GA4_MEASUREMENT_ID = 'G-GM561Q9YZ4';
/**
 * Recipient of the shipped bundle's lifecycle views and goals; the deployment holds it nowhere
 * else. `null` with the transport disabled is the state before a recipient is
 * assigned: the pages then make no request to the counter at all.
 * @type {number|null}
 */
const METRIKA_COUNTER_ID = 113065896;
export const HOSTED_CONFIG = Object.freeze({
  ga4: { enabled: true, measurementId: GA4_MEASUREMENT_ID, debug: false, sdkUrl: 'https://www.googletagmanager.com/gtag/js' },
  metrika: { enabled: true, counterId: METRIKA_COUNTER_ID, sdkUrl: 'https://mc.yandex.ru/metrika/tag.js' },
  privacyUrl: HOSTED_PRIVACY_URL,
  storeBaseUrl: HOSTED_STORE_BASE_URL,
});
