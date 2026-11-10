import { NerdGraphQuery } from 'nr1';

export const policiesQuery = (accountId, cursor) => `{
  actor { account(id: ${Number(accountId)}) { alerts {
    policiesSearch${cursor ? `(cursor: ${JSON.stringify(cursor)})` : ''} {
      policies { name }
      nextCursor
    }
  } } }
}`;

export async function fetchPolicyNames(accountId) {
  const names = [];
  let cursor = null;
  do {
    const res = await NerdGraphQuery.query({ query: policiesQuery(accountId, cursor) });
    if (res.error) throw res.error;
    const page = res.data.actor.account.alerts.policiesSearch;
    names.push(...page.policies.map((p) => p.name));
    cursor = page.nextCursor;
  } while (cursor);
  return names;
}
