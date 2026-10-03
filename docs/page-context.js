/** Extract service data before either analytics transport starts.
 * @module assets/pages/page-context */
import { parseFragment } from './lifecycle-contract.js';
const EMPTY = '';
const PATH_SEPARATOR = '/';

/** Capture the original document once, removing hash and query from the address.
 * @param {Window} target */
export function readPageContext(target) {
  const context = parseFragment(target.location.hash);
  const page = target.location.pathname.split(PATH_SEPARATOR).pop() || EMPTY;
  const observedAt = Date.now();
  if (target.location.hash || target.location.search) target.history.replaceState(null, EMPTY, target.location.pathname);
  return { context, page, observedAt, pageLocation: target.location.origin + target.location.pathname };
}
