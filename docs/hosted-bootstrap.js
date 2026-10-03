/** Hosted-page entry point. @module assets/pages/hosted-bootstrap */
import { startHostedPage } from './hosted-controller.js';
const LOG_FAILED = '[HostedAnalytics] Page bootstrap failed';
startHostedPage(window).catch(() => console.warn(LOG_FAILED));
