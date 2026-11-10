import './policycheck.scss';
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { fetchPolicyNames } from './api';

// Policy names are typed into the widget config, so flag any that don't exist in the
// selected accounts. A misspelled name would otherwise silently match nothing.
// Silent if the policy list can't be read.
export default function PolicyCheck({ accounts, policies }) {
  const [missing, setMissing] = useState([]);
  const key = `${accounts.join(',')}|${policies.join('\n')}`;

  useEffect(() => {
    let live = true;
    setMissing([]);
    if (!accounts.length || !policies.length) return undefined;
    Promise.all(accounts.map(fetchPolicyNames))
      .then((lists) => {
        const known = new Set(lists.flat().map((n) => n.toLowerCase()));
        if (live && known.size) setMissing(policies.filter((p) => !known.has(p.toLowerCase())));
      })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line
  }, [key]);

  if (!missing.length) return null;
  return (
    <div className="pc-warning">
      No policy named {missing.map((m) => `“${m}”`).join(', ')} in the selected account
      {accounts.length > 1 ? 's' : ''}. Check the spelling in the widget configuration.
    </div>
  );
}

PolicyCheck.propTypes = {
  accounts: PropTypes.arrayOf(PropTypes.string).isRequired,
  policies: PropTypes.arrayOf(PropTypes.string).isRequired,
};
