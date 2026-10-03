/** Load a hosted SDK within a bounded document lifetime.
 * @module assets/pages/sdk-loader */
import { REDIRECT_TIMEOUT_MS } from './lifecycle-contract.js';
const SCRIPT_TAG = 'script';
const SDK_FAILED = 'Hosted SDK unavailable';

/**
 * Load executable SDK only into the external document, within the redirect budget.
 *
 * A missed deadline removes the tag and rejects, but removing a tag cannot abort
 * a fetch already under way: a late SDK may still run and process whatever was
 * queued before the call. Callers therefore queue only configuration before
 * loading and send every view and event after the load resolves.
 * @param {Window} target @param {string} src @returns {Promise<void>} */
export function loadSdk(target, src) {
  return new Promise((resolve, reject) => {
    const script = target.document.createElement(SCRIPT_TAG);
    let finished = false;
    /** Complete once; a failure detaches the tag and rejects.
     * @param {boolean} loaded */
    function finish(loaded) {
      if (finished) return;
      finished = true;
      target.clearTimeout(timer);
      if (loaded) resolve();
      else { script.remove(); reject(new Error(SDK_FAILED)); }
    }
    const timer = target.setTimeout(() => finish(false), REDIRECT_TIMEOUT_MS);
    script.async = true;
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    script.src = src;
    target.document.head.append(script);
  });
}
