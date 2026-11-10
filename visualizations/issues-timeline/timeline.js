// Pure helpers for the timeline; no nr1 imports so they can be unit tested.

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const PRIORITY_COLORS = {
  CRITICAL: '#e5484d',
  HIGH: '#f5a623',
  MEDIUM: '#4a90e2',
  LOW: '#8a9199',
};

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Issues touching [start, end]. Issues still open from before the window can be
// missing from a time-windowed list, so a second query pulls currently-active ones
// from further back; results are merged by id.
export function issuesQuery(accountId, { startTime, endTime, activeOnly }, cursor) {
  const filter = activeOnly ? 'filter: {states: [CREATED, ACTIVATED]}, ' : '';
  const cur = cursor ? `, cursor: ${JSON.stringify(cursor)}` : '';
  return `{
    actor { account(id: ${Number(accountId)}) { aiIssues {
      issues(${filter}timeWindow: {startTime: ${startTime}, endTime: ${endTime}}${cur}) {
        issues { issueId priority state createdAt activatedAt closedAt updatedAt }
        nextCursor
      }
    } } }
  }`;
}

// Issue ids belonging to the given policies. Policy membership never changes
// over an issue's life, so it is safe to look up separately from state.
export function policyIssueIdsQuery(accountId, policyNames, sinceMs) {
  const list = policyNames.map((p) => `'${q(p)}'`).join(', ');
  const nrql = `FROM NrAiIssue SELECT uniques(issueId, 10000) WHERE policyNames[0] IN (${list}) SINCE ${Math.floor(
    sinceMs
  )}`;
  return `{ actor { account(id: ${Number(accountId)}) { nrql(query: ${JSON.stringify(nrql)}) { results } } } }`;
}

export function extractIds(results) {
  const row = (results || [])[0] || {};
  const key = Object.keys(row).find((k) => k.startsWith('uniques'));
  return key ? row[key] : [];
}

export function dedupeById(issues) {
  const byId = new Map();
  for (const i of issues) {
    const prev = byId.get(i.issueId);
    if (!prev || (i.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(i.issueId, i);
  }
  return [...byId.values()];
}

// When did the issue stop being open? Infinity if it still is.
export function closeTime(i) {
  if (i.closedAt) return i.closedAt;
  if (String(i.state).toUpperCase() === 'CLOSED') return i.updatedAt || 0;
  return Infinity;
}

// Per time bucket [x0, x1), how many issues were open at any point in it, by priority.
// "Open" matches the table: from activatedAt until closed. scope 'open' keeps only
// issues that are still open now (the history of what the table lists); 'all' also
// includes issues that have since closed.
export function bucketIssues(issues, startTime, endTime, buckets = 48, scope = 'all') {
  const step = (endTime - startTime) / buckets;
  const out = Array.from({ length: buckets }, (_, n) => ({
    x0: Math.round(startTime + n * step),
    x1: Math.round(startTime + (n + 1) * step),
    counts: Object.fromEntries(PRIORITIES.map((p) => [p, 0])),
  }));
  for (const i of issues) {
    const p = String(i.priority).toUpperCase();
    if (!PRIORITIES.includes(p) || !i.activatedAt) continue;
    const end = closeTime(i);
    if (scope === 'open' && end !== Infinity) continue;
    for (const b of out) {
      if (i.activatedAt < b.x1 && end > b.x0) b.counts[p] += 1;
    }
  }
  return out;
}
