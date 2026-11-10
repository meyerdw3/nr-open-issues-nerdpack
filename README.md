# Open Issues Nerdpack

Two New Relic custom visualizations that read alert issues through NerdGraph:

- `open-issues-table`: open issues table with sorting, resizable columns, and Acknowledge / Close actions.
- `issues-timeline`: stacked bar chart of issues over time by priority.

See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, deployment and widget settings.

## Development

```
npm install
npm test          # unit tests for the filtering, sorting and bucketing logic
npm start         # serve locally (nr1 nerdpack:serve)
```

Layout: `visualizations/open-issues-table`, `visualizations/issues-timeline`, and `visualizations/shared` (policy-name check).
