# Open Issues Nerdpack: deployment guide

This package adds two widgets you can place on any New Relic dashboard:

| Widget | What it shows |
|---|---|
| **Open Issues Table** | A live list of open alert issues, like the Issues & Activity page, filtered to the policies you choose. Sort by Priority, Age or Ack. Acknowledge or close issues from the table. Drag column edges to resize. |
| **Open Issues Timeline** | A stacked bar chart of issue counts over time by priority (Critical, High, Medium, Low), built from the same issue data as the table. |

Both read issues through NerdGraph, not NRQL over `NrAiIssue`, so what you see matches what Issues & Activity reports.

## 1. Before you start

You need:

- **Node.js** (current LTS) and **npm**.
- The **New Relic One CLI** (`nr1`). Install it using New Relic's guide: https://developer.newrelic.com/build-apps/set-up-dev-env/
- A New Relic **user API key** for the account that will own the nerdpack.
- A user role that allows publishing and deploying nerdpacks (the **Nerdpack manager** role, or an admin).
- Read access to the alert data in the accounts you want to show. To acknowledge or close issues from the table, the viewer also needs permission to do that in New Relic.

## 2. Deploy

Run these from the unzipped `open-issues-nerdpack` folder.

```bash
# 1. Install dependencies
npm install

# 2. Save your credentials as a CLI profile (use --region eu for EU accounts)
nr1 profiles:add --name customer --api-key <YOUR_USER_API_KEY> --region us

# 3. Generate a unique ID for your copy of the nerdpack (written into nr1.json)
nr1 nerdpack:uuid -gf --profile=customer

# 4. Build and publish
nr1 nerdpack:publish --profile=customer

# 5. Deploy to the STABLE channel
nr1 nerdpack:deploy -c STABLE --profile=customer

# 6. Subscribe your account to it
nr1 nerdpack:subscribe -c STABLE --profile=customer
```

If a step reports that the version is already tagged or deployed, that is fine; continue to the next step.

The nerdpack is now available in the account you used. To make it available in other accounts, open **Apps > Nerdpack manager** in New Relic, select **Open Issues Table**, and subscribe those accounts.

## 3. Add the widgets to a dashboard

1. Open the dashboard and choose **Edit**, then **Add a widget**.
2. Find **Open Issues Table** (or **Open Issues Timeline**) among the custom visualizations.
3. Fill in the settings below, then **Save**.

### Settings

| Setting | Applies to | Description |
|---|---|---|
| **Account IDs** | both | Comma-separated account IDs, for example `1234567,7654321`. |
| **Policy names** | both | Comma-separated policy names to include. Names must match exactly (capitalization is ignored). Leave blank for all policies. If a name doesn't exist, the widget shows a warning. |
| **Unacknowledged only** | table | On by default. Turn off to also list acknowledged issues. |
| **Issues to show** | timeline | **All issues** includes issues that have since closed. **Only open issues** shows just the issues that are still open now, which is what the table lists. |
| **Lookback (hours)** | timeline | How far back the chart goes. Default 24. |
| **Refresh interval (seconds)** | both | How often the widget reloads. Defaults: table 60 (minimum 15), timeline 120 (minimum 30). |

### Choosing policies and accounts with dashboard variables (optional)

**Account IDs** and **Policy names** accept dashboard variables, which gives viewers a dropdown with checkboxes and search at the top of the dashboard.

1. Create a variable, for example `policies`:
   - Type: **NRQL query**, multi-select
   - Query: `FROM NrAiIssue SELECT uniques(policyNames[0]) SINCE 1 month ago LIMIT MAX`
   - Account(s): the account(s) that hold your alert data
2. In the widget's **Policy names** field, enter `{{policies}}`.
3. Do the same for accounts if you like: create an `accounts` variable (a fixed list works well, with the account name as the title and the account ID as the value) and enter `{{accounts}}` in **Account IDs**.

Until a value is selected, the widget shows "Waiting for a dashboard variable value". Select a value in the variable bar and it loads. Use a real account ID as the variable's default rather than `*`.

## 4. Check it is accurate

1. Open **Alerts > Issues & Activity** and filter to the same policies and to active issues.
2. Compare the row count with the **Open Issues Table**. They should match. (If you leave **Unacknowledged only** on, compare against unacknowledged issues.)
3. On the **Open Issues Timeline**, set **Issues to show** to **Only open issues**. The most recent bar should match the same count.

To test the Acknowledge and Close buttons, use a throwaway issue. They change real alerts for everyone.

## 5. Updating

Edit the `version` in `package.json` (for example `0.7.0` to `0.7.1`), then repeat steps 4 and 5 of the deploy section (`publish` and `deploy`). Subscribed accounts pick up the new version automatically.

## 6. Removing

```bash
nr1 nerdpack:unsubscribe -c STABLE --profile=customer
nr1 nerdpack:undeploy -c STABLE --profile=customer
```

Then remove the widgets from your dashboards.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Widget not listed when adding to a dashboard | The account isn't subscribed, or the deploy step didn't run. Repeat steps 5 and 6 and refresh the page. |
| "Enter at least one account ID" | The **Account IDs** field is empty. |
| "Waiting for a dashboard variable value" | A `{{variable}}` is in a setting but has no value selected. Pick one in the variable bar. |
| Table is empty but Issues & Activity shows issues | Check the policy spelling (a warning appears for unknown names), the account IDs, and that **Unacknowledged only** is what you intend. |
| Acknowledge or Close shows an error | The message from New Relic is shown in the notification. This is most often a permissions issue. |
| Timeline fails with an "experimental" or access error | The timeline uses NerdGraph's issues API, which New Relic labels experimental. Contact your New Relic account team. |
| Timeline policy filter differs from the table | The timeline matches an issue by its first policy only. The table matches any policy on the issue. This only differs for issues that span several policies. |
| `nerdpack:publish` says there is no ID | Run step 3 (`nr1 nerdpack:uuid -gf`) first. |

## Known limits

- The widgets read the issues API and update on a timer (see **Refresh interval**), not instantly.
- After an Acknowledge or Close, the row updates immediately in the table and stays updated for two minutes while New Relic catches up.
- Column widths are remembered per browser.
