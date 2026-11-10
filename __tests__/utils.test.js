import {
  resizeWidth, parseValues, hasUnresolvedVariable, resolveAccounts, entityToIssue, filterIssues, sortIssues, formatDuration, issuesQuery,
} from '../visualizations/open-issues-table/utils';

const ent = (name, tags) => ({
  name, accountId: 1,
  tags: Object.entries(tags).map(([key, v]) => ({ key, values: [].concat(v) })),
});

describe('open issues helpers', () => {
  const a = entityToIssue(ent('A', { issueId: 'a', policyName: 'Policy A', priority: 'HIGH', activatedAt: '100' }));
  const b = entityToIssue(ent('B', { issueId: 'b', policyName: 'Policy B', priority: 'CRITICAL', activatedAt: '50', acknowledgedBy: '42' }));
  const c = entityToIssue(ent('C', { issueId: 'c', policyName: 'Other', priority: 'CRITICAL', activatedAt: '200' }));
  const d = entityToIssue(ent('D', { issueId: 'd', policyName: 'Policy A', priority: 'LOW', closedAt: '300' }));

  test('parseValues: plain, quoted variable form, wildcard, commas inside quotes', () => {
    expect(parseValues(' a, b ,,c')).toEqual(['a', 'b', 'c']);
    expect(parseValues("'Policy A','Policy B'")).toEqual(['Policy A', 'Policy B']);
    expect(parseValues("'Ops, Prod',x")).toEqual(['Ops, Prod', 'x']);
    expect(parseValues('*')).toEqual([]);
    expect(parseValues(undefined)).toEqual([]);
  });
  test('unresolved variables detected', () => {
    expect(hasUnresolvedVariable('{{policies}}')).toBe(true);
    expect(hasUnresolvedVariable('a,b', undefined)).toBe(false);
  });
  test('resolveAccounts parses ids, numeric only', () => {
    expect(resolveAccounts('12, 34, 12, abc')).toEqual(['12', '34']);
    expect(resolveAccounts(undefined)).toEqual([]);
  });
  test('tags are flattened', () => expect(a).toMatchObject({ activatedAt: 100, policyName: ['Policy A'] }));
  test('policy + unacked + open filter', () => {
    const out = filterIssues([a, b, c, d], { policyNames: ['policy a', 'Policy B'], unacknowledgedOnly: true });
    expect(out.map((i) => i.issueId)).toEqual(['a']);
  });
  test('acked included when toggle off; closed never shown', () => {
    const out = filterIssues([a, b, c, d], { policyNames: [], unacknowledgedOnly: false });
    expect(out.map((i) => i.issueId)).toEqual(['a', 'b', 'c']);
  });
  test('sort by priority then newest', () => expect(sortIssues([a, b, c]).map((i) => i.issueId)).toEqual(['c', 'b', 'a']));
  test('duration', () => expect(formatDuration(90 * 60000)).toBe('1h 30m'));
  test('query paginates', () => expect(issuesQuery(5, 'abc')).toContain('results(cursor: "abc")'));
});

import { ackMutation, closeMutation, mutationError } from '../visualizations/open-issues-table/utils';

describe('sorting', () => {
  const mk = (id, priority, activatedAt, acked) =>
    entityToIssue(ent(id, { issueId: id, priority, activatedAt: String(activatedAt), ...(acked ? { acknowledgedBy: '1' } : {}) }));
  const set = [mk('a', 'HIGH', 100), mk('b', 'CRITICAL', 50, true), mk('c', 'LOW', 300), mk('d', 'CRITICAL', 200)];
  const ids = (arr) => arr.map((i) => i.issueId);
  test('priority asc = critical first, newest tiebreak', () => expect(ids(sortIssues(set, 'priority', 'asc'))).toEqual(['d', 'b', 'a', 'c']));
  test('priority desc', () => expect(ids(sortIssues(set, 'priority', 'desc'))).toEqual(['c', 'a', 'd', 'b']));
  test('age asc = youngest first', () => expect(ids(sortIssues(set, 'age', 'asc'))).toEqual(['c', 'd', 'a', 'b']));
  test('age desc = oldest first', () => expect(ids(sortIssues(set, 'age', 'desc'))).toEqual(['b', 'a', 'd', 'c']));
  test('ack asc = unacked first', () => expect(ids(sortIssues(set, 'ack', 'asc'))).toEqual(['c', 'd', 'a', 'b']));
  test('ack desc = acked first', () => expect(ids(sortIssues(set, 'ack', 'desc'))[0]).toBe('b'));
});

describe('mutations', () => {
  test('ack/close shape and escaping', () => {
    expect(ackMutation(12, 'x"y')).toContain('aiIssuesAckIssue(accountId: 12, issueId: "x\\"y")');
    expect(closeMutation('7', 'abc')).toContain('aiIssuesResolveIssue(accountId: 7, issueId: "abc")');
  });
  test('mutationError', () => {
    expect(mutationError({ error: new Error('nope') }, 'f')).toBe('nope');
    expect(mutationError({ data: { f: { error: 'denied' } } }, 'f')).toBe('denied');
    expect(mutationError({ data: { f: { error: null } } }, 'f')).toBeNull();
  });
});

test('resizeWidth clamps to the minimum', () => {
  expect(resizeWidth(100, 30)).toBe(130);
  expect(resizeWidth(100, -80)).toBe(50);
  expect(resizeWidth(100, -80, 20)).toBe(20);
});
