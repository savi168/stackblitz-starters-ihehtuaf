# Regulatory Reporting Dashboard

A comprehensive, client-side dashboard for tracking, analyzing, and comparing
multi-entity regulatory financial KPIs (CET1, LCR, NSFR, Leverage Ratio) for a
bank's regulatory reporting function.

## Features

- **KPI Analysis** — historical trends, risk-appetite thresholds (red/amber/green),
  RWA & CET1 waterfalls, HQLA / cashflow composition, multi-currency liquidity, and
  PDF export of reports.
- **Daily Reports** — daily/weekly LCR and Large Exposure monitoring for key entities.
- **Deadlines** — regulatory & internal deadline tracking with status history,
  attachments, and a visual calendar.
- **Projects** — project task tracking with assignees and statuses.
- **Team Directory** — contact information for the reporting team.
- **Business Case** — ROI and operational-benefit presentation.
- **Data Management** — import/export of data via CSV and JSON, plus data diagnosis.

All data is stored locally in the browser (`localStorage`); there is no backend.

## Tech stack

- React 18 + TypeScript
- Vite (build & dev server)
- Tailwind CSS
- React Router (hash routing)
- Recharts (charts)
- jsPDF + html2canvas (PDF export, lazy-loaded on demand)

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # production build (output in dist/)
npm run preview  # preview the production build
npm run lint     # type-check with tsc --noEmit
```

## Project structure

```
src/
  App.tsx              # router + layout (routes are lazy-loaded)
  components.tsx       # shared UI + chart components
  constants.ts         # seed/initial data
  context/             # DataContext (state + localStorage persistence)
  pages/               # one component per route
  services/            # data diagnosis logic
  types.ts             # domain types
  utils.ts             # KPI calculations & formatting helpers
```
