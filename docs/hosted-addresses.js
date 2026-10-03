/** Public destinations shared by independently shipped pages and extension code.
 * @module assets/pages/hosted-addresses */
/**
 * Base address of the public site. Two artifacts are shipped from this
 * repository — the extension package and the site itself — and neither can
 * import the other, so the address lives here, in the lowest module both
 * reach: the pages use it directly, extension code derives its public URLs
 * from it. One literal keeps a site move from stranding half the links.
 */
export const HOSTED_SITE_BASE_URL = 'https://yesgenius.github.io/use-multiple-chat-ai-at-once/';

/** Page below the site base; named separately because it is its own destination. */
const HOSTED_PRIVACY_RESOURCE_PATH = 'privacy.html';

/** Absolute address of the privacy policy, resolved against the one site base. */
export const HOSTED_PRIVACY_URL = new URL(HOSTED_PRIVACY_RESOURCE_PATH, HOSTED_SITE_BASE_URL).href;

/**
 * Base of a store listing address; the extension id is appended to it. Lives
 * beside the site base for the same reason: both artifacts link to the listing
 * and neither may hold its own copy of the address.
 */
export const HOSTED_STORE_BASE_URL = 'https://chromewebstore.google.com/detail';
