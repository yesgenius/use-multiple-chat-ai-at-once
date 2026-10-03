/** Persistent, bounded reservation of attempts across same-origin tabs.
 * @module assets/pages/attempt-journal */
export const ATTEMPT_JOURNAL_KEY = 'hostedLifecycleAttempts';
export const ATTEMPT_JOURNAL_LOCK = 'hostedLifecycleAttemptsLock';
export const ATTEMPT_LIFECYCLES_PER_STREAM = 128;
const EMPTY_JOURNAL = '[]';
const LOG_UNAVAILABLE = '[HostedAnalytics] Attempt journal unavailable; event skipped';
const LOG_LOCKS_UNAVAILABLE = '[HostedAnalytics] Web Locks unavailable; event skipped';
const LOG_DUPLICATE = '[HostedAnalytics] Duplicate attempt skipped';
const INVALID_JOURNAL = 'Invalid lifecycle attempt journal';
const STRING_TYPE = 'string';
/** @typedef {{stream: string, clientId: string, events: string[]}} Receipt */

/** Reserve under one lock covering the entire read/modify/write operation.
 * @param {Window} target @param {string} stream @param {string} clientId @param {string} event */
export async function reserveAttempt(target, stream, clientId, event) {
  try {
    if (!target.navigator.locks) { console.warn(LOG_LOCKS_UNAVAILABLE); return false; }
    return await target.navigator.locks.request(ATTEMPT_JOURNAL_LOCK, () => {
      /** @type {Receipt[]} */
      const journal = JSON.parse(target.localStorage.getItem(ATTEMPT_JOURNAL_KEY) || EMPTY_JOURNAL);
      if (!Array.isArray(journal) || journal.some(row => !row || typeof row.stream !== STRING_TYPE || typeof row.clientId !== STRING_TYPE || !Array.isArray(row.events) || row.events.some(value => typeof value !== STRING_TYPE))) throw new Error(INVALID_JOURNAL);
      const existing = journal.find(row => row.stream === stream && row.clientId === clientId);
      if (existing?.events.includes(event)) { console.info(LOG_DUPLICATE); return false; }
      if (existing) existing.events.push(event);
      else journal.push({ stream, clientId, events: [event] });
      const streams = new Set(journal.map(row => row.stream));
      const bounded = [...streams].flatMap(id => journal.filter(row => row.stream === id).slice(-ATTEMPT_LIFECYCLES_PER_STREAM));
      target.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify(bounded));
      return true;
    });
  } catch { console.warn(LOG_UNAVAILABLE); return false; }
}
