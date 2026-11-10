import { bucketIssues, closeTime, dedupeById, extractIds, policyIssueIdsQuery } from '../visualizations/issues-timeline/timeline';

describe('timeline', () => {
  const issues = [
    { issueId: '1', priority: 'CRITICAL', activatedAt: 100, closedAt: 600 },       // open 100..600
    { issueId: '2', priority: 'CRITICAL', activatedAt: -50, state: 'ACTIVATED' },    // open since before window, still open
    { issueId: '3', priority: 'HIGH', activatedAt: 500, state: 'CLOSED', updatedAt: 700 }, // closed w/o closedAt
    { issueId: '4', priority: 'LOW' },                                              // never activated: ignored
  ];
  const all = bucketIssues(issues, 0, 1000, 10, 'all'); // buckets of 100
  const col = (b, p) => b.map((x) => x.counts[p]);

  test('bucket bounds', () => expect([all[0].x0, all[0].x1, all[9].x1]).toEqual([0, 100, 1000]));
  test('critical: open-in-bucket incl. carried-over and closed-mid-bucket', () =>
    // issue1 is open [100,600) -> buckets 1..5; issue2 open throughout
    expect(col(all, 'CRITICAL')).toEqual([1, 2, 2, 2, 2, 2, 1, 1, 1, 1]));
  test('closed state without closedAt ends at updatedAt', () => {
    expect(closeTime(issues[2])).toBe(700);
    expect(col(all, 'HIGH')).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 0]);
  });
  test('never-activated ignored', () => expect(col(all, 'LOW').every((n) => n === 0)).toBe(true));
  test('scope open keeps only still-open issues', () => {
    const open = bucketIssues(issues, 0, 1000, 10, 'open');
    expect(col(open, 'CRITICAL')).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(col(open, 'HIGH').every((n) => n === 0)).toBe(true);
  });
  test('dedupe keeps most recently updated', () =>
    expect(dedupeById([{ issueId: 'a', updatedAt: 1, v: 1 }, { issueId: 'a', updatedAt: 2, v: 2 }])[0].v).toBe(2));
  test('policy query escapes quotes; ids extracted', () => {
    expect(policyIssueIdsQuery(1, ["O'Neil"], 5)).toContain("O\\\\'Neil");
    expect(extractIds([{ 'uniques.issueId': ['x', 'y'] }])).toEqual(['x', 'y']);
  });
});
