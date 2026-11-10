// Pure helpers, kept separate from React so they can be unit tested.

const NUMERIC_TAGS = new Set(['activatedAt', 'accountId', 'incidentCount']);
const ARRAY_TAGS = new Set([
  'policyName',
  'conditionName',
  'relatedEntityName',
  'relatedEntityId',
]);

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Split a config string into values. Accepts plain "a, b" lists as well as the quoted
// form dashboard variables expand to ('a','b'). A lone "*" (variable "all") means no filter.
export function parseValues(value) {
  if (value == null) return [];
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"([^"]*)"|([^,]+)/g;
  let m;
  while ((m = re.exec(String(value)))) {
    const v = (m[1] ?? m[2] ?? m[3]).trim();
    if (v && v !== '*') out.push(v.replace(/\\'/g, "'"));
  }
  return [...new Set(out)];
}

// True if a "{{variable}}" placeholder reached the widget without being replaced.
export function hasUnresolvedVariable(...values) {
  return values.some((v) => typeof v === 'string' && /\{\{[^}]*\}\}/.test(v));
}

// Account ids from a config string (or variable); numeric ids only.
export function resolveAccounts(accountIds) {
  return parseValues(accountIds).filter((v) => /^\d+$/.test(v));
}

export function issuesQuery(accountId, cursor) {
  const results = cursor ? `results(cursor: ${JSON.stringify(cursor)})` : 'results';
  return `{
    actor {
      entitySearch(query: "domain = 'AIOPS' AND type = 'ISSUE' AND tags.source = 'newrelic' AND tags.accountId = '${Number(
        accountId
      )}'") {
        ${results} {
          entities { name accountId tags { key values } }
          nextCursor
        }
      }
    }
  }`;
}

// Flatten the entity's tag list into a plain issue object.
export function entityToIssue(entity) {
  const issue = { title: entity.name, accountId: entity.accountId };
  for (const { key, values } of entity.tags || []) {
    if (NUMERIC_TAGS.has(key)) issue[key] = Number(values[0]);
    else if (ARRAY_TAGS.has(key)) issue[key] = values;
    else issue[key] = values[0];
  }
  return issue;
}

export function isOpen(issue) {
  // Defensive: the entity set should only contain open issues, but never
  // show one that carries a closed state/timestamp.
  if (issue.closedAt) return false;
  if (issue.state && String(issue.state).toUpperCase() === 'CLOSED') return false;
  return true;
}

export function isAcknowledged(issue) {
  return Boolean(issue.acknowledgedBy || issue.acknowledgedAt);
}

export function matchesPolicies(issue, policyNames) {
  if (!policyNames.length) return true;
  const wanted = new Set(policyNames.map((p) => p.toLowerCase()));
  return (issue.policyName || []).some((p) => wanted.has(String(p).toLowerCase()));
}

export function filterIssues(issues, { policyNames, unacknowledgedOnly }) {
  return issues.filter(
    (i) =>
      isOpen(i) &&
      matchesPolicies(i, policyNames) &&
      (!unacknowledgedOnly || !isAcknowledged(i))
  );
}

const rank = (i) => PRIORITY_RANK[String(i.priority).toUpperCase()] ?? 9;

// key: 'priority' | 'age' | 'ack'; dir: 'asc' | 'desc'.
// Ties always fall back to newest first so ordering is stable between refreshes.
// Natural direction: priority asc = critical first, age asc = youngest first,
// ack asc = unacknowledged first.
export function sortIssues(issues, key = 'priority', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const value = {
    priority: rank,
    age: (i) => -(i.activatedAt || 0),
    ack: (i) => (isAcknowledged(i) ? 1 : 0),
  }[key];
  return [...issues].sort(
    (a, b) =>
      sign * (value(a) - value(b)) || (b.activatedAt || 0) - (a.activatedAt || 0)
  );
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

// Same link pattern the reference Command Center app uses for issue details.
export function issueUrl(issue, href = '') {
  const base = href.includes('one.eu')
    ? 'https://radar-api.service.eu.newrelic.com'
    : 'https://radar-api.service.newrelic.com';
  return `${base}/accounts/${issue.accountId}/issues/${issue.issueId}?notifier=&action=`;
}

// Mutations: shape taken from the NerdGraph issues API (and the reference app).
const issueMutation = (field, accountId, issueId) => `mutation {
  ${field}(accountId: ${Number(accountId)}, issueId: ${JSON.stringify(String(issueId))}) {
    error
    result { action issueId accountId }
  }
}`;

export const ackMutation = (accountId, issueId) =>
  issueMutation('aiIssuesAckIssue', accountId, issueId);

export const closeMutation = (accountId, issueId) =>
  issueMutation('aiIssuesResolveIssue', accountId, issueId);

// Pull an error message out of a NerdGraphMutation response, or null on success.
export function mutationError(res, field) {
  if (res.error) return res.error.message || String(res.error);
  const payload = res.data && res.data[field];
  if (payload && payload.error) return String(payload.error);
  return null;
}

export const MIN_COLUMN_WIDTH = 50;

// New column width after dragging `delta` px from `startWidth`.
export function resizeWidth(startWidth, delta, min = MIN_COLUMN_WIDTH) {
  return Math.max(min, Math.round(startWidth + delta));
}
