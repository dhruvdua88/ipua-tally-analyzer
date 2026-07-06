# IPUA Tally Analyzer

A fully in-browser audit workbench for **tally-database-loader** CSV/ZIP exports, built for **IPUA Events Forum** (a Section 8 / non-profit event-support company) but schema-agnostic to any Tally book. Upload a Tally export ZIP and get ledger classification, TDS review, GST-on-advances checks, GST reconciliation, an MIS dashboard, P&L + Balance Sheet, and a central exceptions register — every figure clickable down to the voucher line.

**No backend. No upload to any server.** Everything is parsed, normalized, analyzed and stored **locally in your browser** (IndexedDB via Dexie). Your books never leave the device.

## Features

| Module | What it does |
|---|---|
| **Upload & Preview** | Drop a Tally-loader ZIP → parses every CSV with dynamic schema inference (no fixed column names), normalizes into ledgers, groups, vouchers, daybook lines, parties, bills, bank & tax ledgers. Bundled sample data included. |
| **Ledger Mapping** | Auto-classifies every ledger into income / expense / party / bank-cash / advances / GST / TDS / statutory / assets / liabilities / capital / unclassified. Inline manual override (persisted), reset-to-auto, Excel export. |
| **TDS Review** | Per expense line: date, voucher, party, ledger, amount, narration, matched section & expected TDS vs TDS actually booked in the voucher. Flags *not deducted / short / below threshold / manual review*. Editable rule set (section / rate / threshold / keywords). |
| **GST on Advances** | Detects advances received, whether GST-on-advance was booked, invoice adjustment, outstanding advances, likely grants/donations/exempt receipts, and risk flags (service advances without GST = live liability). |
| **GST Reconciliation** | Month-wise output GST, input GST (ITC), RCM, net liability, GST paid, sales-without-GST, GST-without-sales and mismatch flags. |
| **MIS Dashboard** | Monthly income / expense / surplus, receivables, payables, advances, cash & bank, statutory dues, GST/TDS position, top ledgers & parties, exception summary — with charts. |
| **P&L + Balance Sheet** | Monthly and YTD, drill-down from any amount to the underlying voucher lines. |
| **Exceptions** | Central high / medium / low register: missing TDS, GST-on-advance issues, unpaid statutory dues, old advances, reverse party balances, large manual journals, unclassified ledgers, duplicate vouchers, missing narration. |

Every dashboard number is **clickable** and opens the exact accounting lines behind it. Excel export is available for MIS, TDS, GST advances, GST reconciliation, exceptions, ledger mapping and the full normalized database.

## Tech

- **React 18 + Vite + TypeScript**
- **JSZip** + **PapaParse** — ZIP / CSV parsing with dynamic schema inference
- **ExcelJS** — richly-styled Excel export (branded headers, ₹ formats, colored risk cells, freeze panes, totals)
- **Dexie** (IndexedDB) — local persistence
- **Tailwind CSS** + custom shadcn-style primitives — financial-terminal UI
- **Recharts** — charts
- **Zustand** — state

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview
```

Click **Load sample data** on the upload screen to explore with the bundled IPUA Events Forum export.

## Data model

The app rebuilds the enriched **daybook** in-browser by joining `trn_accounting` → `trn_voucher` → `mst_ledger` → `mst_group`, mirroring the loader's `daybook_accounting_lines`. Amount sign follows Tally's `is_deemedpositive` convention to derive Dr/Cr. Column access is by candidate-name lookup, so minor header differences across loader versions are tolerated.

## Deploy (GitHub Pages)

Currently deployed from the **`gh-pages`** branch (the built `dist/`). The Vite `base` is `/ipua-tally-analyzer/`. An Actions workflow is included as `deploy.workflow.yml.txt` — to use Actions-based deploy instead, move it to `.github/workflows/deploy.yml` (needs a token with `workflow` scope) and set **Settings → Pages → Source: GitHub Actions**.

Live: <https://dhruvdua88.github.io/ipua-tally-analyzer/>

## Privacy

All processing is client-side. Clearing browser data (or the in-app **Clear data** button) wipes everything. No analytics, no network calls except loading the app itself.
