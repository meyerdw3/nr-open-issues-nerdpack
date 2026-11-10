import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './styles.scss';
import { NerdGraphQuery, Spinner, HeadingText } from 'nr1';

import { parseValues, hasUnresolvedVariable, resolveAccounts } from '../open-issues-table/utils';
import PolicyCheck from '../shared/PolicyCheck';
import StackedBars from './StackedBars';
import {
  issuesQuery,
  policyIssueIdsQuery,
  extractIds,
  dedupeById,
  bucketIssues,
} from './timeline';

const MIN_REFRESH_SECONDS = 30;
const HOUR = 3600 * 1000;
// Issue TTL defaults to 3 days; look a little further back for still-open issues.
const ACTIVE_LOOKBACK_MS = 7 * 24 * HOUR;

async function fetchIssues(accountId, range) {
  const issues = [];
  for (const params of [range, { ...range, startTime: range.startTime - ACTIVE_LOOKBACK_MS, activeOnly: true }]) {
    let cursor = null;
    do {
      const res = await NerdGraphQuery.query({ query: issuesQuery(accountId, params, cursor) });
      if (res.error) throw res.error;
      const page = res.data.actor.account.aiIssues.issues;
      issues.push(...page.issues);
      cursor = page.nextCursor;
    } while (cursor);
  }
  return dedupeById(issues);
}

async function fetchPolicyIds(accountId, policies, sinceMs) {
  const res = await NerdGraphQuery.query({ query: policyIssueIdsQuery(accountId, policies, sinceMs) });
  if (res.error) throw res.error;
  return new Set(extractIds(res.data.actor.account.nrql.results));
}

export default function IssuesTimelineVisualization({
  accountIds,
  policyNames,
  issueScope,
  lookbackHours,
  refreshSeconds,
}) {
  const accounts = useMemo(() => resolveAccounts(accountIds), [accountIds]);
  const policies = useMemo(() => parseValues(policyNames), [policyNames]);
  const unresolved = hasUnresolvedVariable(policyNames, accountIds);
  const scope = issueScope === 'open' ? 'open' : 'all';
  const hours = Number(lookbackHours) > 0 ? Number(lookbackHours) : 24;
  const interval = Math.max(Number(refreshSeconds) || 120, MIN_REFRESH_SECONDS) * 1000;

  const [chart, setChart] = useState(null);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const endTime = Date.now();
    const startTime = endTime - hours * HOUR;
    try {
      const perAccount = await Promise.all(
        accounts.map(async (acct) => {
          const [issues, allowed] = await Promise.all([
            fetchIssues(acct, { startTime, endTime }),
            policies.length
              ? fetchPolicyIds(acct, policies, startTime - ACTIVE_LOOKBACK_MS)
              : Promise.resolve(null),
          ]);
          return allowed ? issues.filter((i) => allowed.has(i.issueId)) : issues;
        })
      );
      if (id !== requestId.current) return;
      setChart(bucketIssues(perAccount.flat(), startTime, endTime, 48, scope));
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || String(err));
    }
  }, [accounts, policies, hours, scope]);

  useEffect(() => {
    setChart(null);
    if (!accounts.length || unresolved) return undefined;
    load();
    const timer = setInterval(load, interval);
    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, [load, interval, accounts.length, unresolved]);

  let body;
  if (unresolved) {
    body = (
      <div style={{ color: '#bf0016', padding: 8 }}>
        Waiting for a dashboard variable value. Select one in the variable bar. The widget received “{[policyNames, accountIds].find((v) => hasUnresolvedVariable(v))}”.
      </div>
    );
  } else if (!accounts.length) {
    body = (
      <HeadingText type={HeadingText.TYPE.HEADING_4}>Enter at least one account ID in the widget configuration.</HeadingText>
    );
  } else if (error && !chart) {
    body = <div style={{ color: '#bf0016', padding: 8 }}>Failed to load issues: {error}</div>;
  } else if (!chart) {
    body = <Spinner />;
  } else {
    body = <StackedBars buckets={chart} />;
  }
  return (
    <div className="tl-root">
      <PolicyCheck accounts={accounts} policies={policies} />
      {body}
    </div>
  );
}

IssuesTimelineVisualization.propTypes = {
  accountIds: PropTypes.string,
  policyNames: PropTypes.string,
  issueScope: PropTypes.string,
  lookbackHours: PropTypes.number,
  refreshSeconds: PropTypes.number,
};
