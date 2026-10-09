// The ai-service's treatments.json still contains developer placeholders like "[TODO_VERIFY: ...]".
// They are not guidance for a farmer, so the UI hides those fragments (and any item that is only a
// placeholder). Weather notes are NOT touched: their "unverified thresholds" wording is an honest caveat.
const PLACEHOLDER = /\s*\[TODO_VERIFY[^\]]*\]/g;

export const tidy = (s) => String(s ?? '').replace(PLACEHOLDER, '').replace(/\s{2,}/g, ' ').trim();
export const tidyList = (items) => (items ?? []).map(tidy).filter(Boolean);
