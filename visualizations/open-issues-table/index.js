import './styles.scss';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { NerdGraphQuery, NerdGraphMutation, Spinner, HeadingText, Toast } from 'nr1';

import {
  parseValues,
  hasUnresolvedVariable,
  resolveAccounts,
  resizeWidth,
  issuesQuery,
  entityToIssue,
  filterIssues,
  sortIssues,
  formatDuration,
  issueUrl,
  isAcknowledged,
  ackMutation,
  closeMutation,
  mutationError,
} from './utils';
import PolicyCheck from '../shared/PolicyCheck';

const MIN_REFRESH_SECONDS = 15;
// Issue entities can lag a mutation; keep the local result this long.
const OVERRIDE_TTL_MS = 2 * 60 * 1000;

const COLUMNS = [
  { label: 'Priority', sort: 'priority', width: 100 },
  { label: 'Issue', width: 280 },
  { label: 'Policy', width: 150 },
  { label: 'Condition', width: 220 },
  { label: 'Entities', width: 140 },
  { label: 'Opened', width: 170 },
  { label: 'Age', sort: 'age', width: 80 },
  { label: 'Ack', sort: 'ack', width: 70 },
  { label: 'Actions', width: 200 },
];
const DEFAULT_WIDTHS = COLUMNS.map((c) => c.width);
const WIDTHS_KEY = 'open-issues:column-widths';

function loadWidths() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(WIDTHS_KEY));
    if (Array.isArray(saved) && saved.length === DEFAULT_WIDTHS.length && saved.every(Number.isFinite)) {
      return saved;
    }
  } catch (e) { /* storage unavailable or corrupt: use defaults */ }
  return DEFAULT_WIDTHS;
}

function saveWidths(widths) {
  try { window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch (e) { /* ignore */ }
}

async function fetchAccountIssues(accountId) {
  let cursor = null;
  const issues = [];
  do {
    const res = await NerdGraphQuery.query({ query: issuesQuery(accountId, cursor) });
    if (res.error) throw res.error;
    const results = res.data.actor.entitySearch.results;
    issues.push(...results.entities.map(entityToIssue));
    cursor = results.nextCursor;
  } while (cursor);
  return issues;
}

const keyOf = (i) => `${i.accountId}-${i.issueId}`;

export default function OpenIssuesTableVisualization({
  accountIds,
  policyNames,
  unacknowledgedOnly,
  refreshSeconds,
}) {
  const accounts = useMemo(() => resolveAccounts(accountIds), [accountIds]);
  const policies = useMemo(() => parseValues(policyNames), [policyNames]);
  const unresolved = hasUnresolvedVariable(policyNames, accountIds);
  const onlyUnacked = unacknowledgedOnly !== false;
  const interval =
    Math.max(Number(refreshSeconds) || 60, MIN_REFRESH_SECONDS) * 1000;

  const [issues, setIssues] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sort, setSort] = useState({ key: 'priority', dir: 'asc' });
  const [busy, setBusy] = useState({}); // issue key -> true while a mutation is in flight
  const [overrides, setOverrides] = useState({}); // issue key -> { type, at }
  const requestId = useRef(0);
  const [widths, setWidths] = useState(loadWidths);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const startResize = (index, e) => {
    e.preventDefault();
    e.stopPropagation(); // don't trigger the header's sort click
    const startX = e.clientX;
    const startWidth = widthsRef.current[index];
    const move = (ev) =>
      setWidths((w) => w.map((x, i) => (i === index ? resizeWidth(startWidth, ev.clientX - startX) : x)));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      saveWidths(widthsRef.current);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const resetWidth = (index) => {
    const next = widthsRef.current.map((x, i) => (i === index ? DEFAULT_WIDTHS[index] : x));
    setWidths(next);
    saveWidths(next);
  };

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const perAccount = await Promise.all(accounts.map(fetchAccountIssues));
      if (id !== requestId.current) return; // a newer request superseded this one
      setIssues(perAccount.flat());
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || String(err));
    }
  }, [accounts]);

  useEffect(() => {
    setIssues(null);
    if (!accounts.length) return undefined;
    load();
    const timer = setInterval(load, interval);
    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, [load, interval, accounts.length]);

  const act = useCallback(
    async (issue, type) => {
      const key = keyOf(issue);
      if (
        type === 'close' &&
        !window.confirm(`Close issue "${issue.title}"? This resolves it for everyone.`)
      ) {
        return;
      }
      const [field, mutation, done] =
        type === 'ack'
          ? ['aiIssuesAckIssue', ackMutation, 'acknowledged']
          : ['aiIssuesResolveIssue', closeMutation, 'closed'];
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        const res = await NerdGraphMutation.mutate({
          mutation: mutation(issue.accountId, issue.issueId),
        });
        const failure = mutationError(res, field);
        if (failure) throw new Error(failure);
        setOverrides((o) => ({ ...o, [key]: { type, at: Date.now() } }));
        Toast.showToast({ title: `Issue ${done}`, type: Toast.TYPE.NORMAL });
      } catch (err) {
        Toast.showToast({
          title: `Failed to ${type === 'ack' ? 'acknowledge' : 'close'} issue`,
          description: err.message || String(err),
          type: Toast.TYPE.CRITICAL,
        });
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    []
  );

  const rows = useMemo(() => {
    if (!issues) return [];
    const now = Date.now();
    const applied = issues
      .map((i) => {
        const o = overrides[keyOf(i)];
        if (!o || now - o.at > OVERRIDE_TTL_MS) return i;
        return o.type === 'close'
          ? { ...i, closedAt: o.at }
          : { ...i, acknowledgedAt: i.acknowledgedAt || o.at };
      });
    return sortIssues(
      filterIssues(applied, { policyNames: policies, unacknowledgedOnly: onlyUnacked }),
      sort.key,
      sort.dir
    );
  }, [issues, overrides, policies, onlyUnacked, sort]);

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  if (unresolved) {
    return (
      <div className="oit-message oit-error">
        Waiting for a dashboard variable value. Select one in the variable bar. The widget received “{[policyNames, accountIds].find((v) => hasUnresolvedVariable(v))}”.
      </div>
    );
  }
  if (!accounts.length) {
    return (
      <div className="oit-message">
        <HeadingText type={HeadingText.TYPE.HEADING_4}>
          Enter at least one account ID in the widget configuration.
        </HeadingText>
      </div>
    );
  }
  if (error && !issues) {
    return <div className="oit-message oit-error">Failed to load issues: {error}</div>;
  }
  if (!issues) return <Spinner />;

  const now = Date.now();
  return (
    <div className="oit-root">
      <PolicyCheck accounts={accounts} policies={policies} />
      {error && <div className="oit-error">Refresh failed ({error}); showing last results.</div>}
      <div className="oit-scroll">
        <table className="oit-table" style={{ width: widths.reduce((n, w) => n + w, 0) }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={COLUMNS[i].label} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.label}
                  className={c.sort ? 'oit-sortable' : undefined}
                  aria-sort={
                    c.sort
                      ? sort.key === c.sort
                        ? sort.dir === 'asc' ? 'ascending' : 'descending'
                        : 'none'
                      : undefined
                  }
                  onClick={c.sort ? () => toggleSort(c.sort) : undefined}
                >
                  {c.label}
                  {c.sort && (
                    <span className={sort.key === c.sort ? 'oit-sort-on' : 'oit-sort-off'}>
                      {sort.key === c.sort ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                    </span>
                  )}
                  <span
                    className="oit-resizer"
                    title="Drag to resize, double-click to reset"
                    onMouseDown={(e) => startResize(i, e)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={() => resetWidth(i)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="oit-empty">
                  No matching open issues 🎉
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const key = keyOf(r);
              const acked = isAcknowledged(r);
              return (
                <tr key={key}>
                  <td>
                    <span className={`oit-pill oit-${String(r.priority).toLowerCase()}`}>
                      {r.priority || 'UNKNOWN'}
                    </span>
                  </td>
                  <td>
                    <a href={issueUrl(r, window.location.href)} target="_blank" rel="noopener noreferrer">
                      {r.title}
                    </a>
                  </td>
                  <td>{(r.policyName || []).join(', ')}</td>
                  <td>{(r.conditionName || []).join(', ')}</td>
                  <td>{(r.relatedEntityName || []).join(', ')}</td>
                  <td>{r.activatedAt ? new Date(r.activatedAt).toLocaleString() : ''}</td>
                  <td>{r.activatedAt ? formatDuration(now - r.activatedAt) : ''}</td>
                  <td>{acked ? 'Yes' : 'No'}</td>
                  <td className="oit-actions">
                    <button
                      type="button"
                      className="oit-btn"
                      disabled={acked || busy[key]}
                      onClick={() => act(r, 'ack')}
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      className="oit-btn oit-btn-danger"
                      disabled={busy[key]}
                      onClick={() => act(r, 'close')}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="oit-footer">
        {rows.length} open issue{rows.length === 1 ? '' : 's'}
        {updatedAt && ` · updated ${updatedAt.toLocaleTimeString()}`}
      </div>
    </div>
  );
}

OpenIssuesTableVisualization.propTypes = {
  accountIds: PropTypes.string,
  policyNames: PropTypes.string,
  unacknowledgedOnly: PropTypes.bool,
  refreshSeconds: PropTypes.number,
};
