# RegReport — Release notes

One section per release, newest first. Each section lists what changed, the
database schema migrations it ships (applied automatically at API startup),
and anything to know before or after upgrading.

---

## v3.12.0 — 14 September 2026

**Theme: certification line vs Reco — two workspaces, one live balance
sheet.**

- **The flow is split by intent**: the stepper is now the pure
  certification line — *Scope → Data → Controls → Certify* (the baseline
  concludes the control battery). The balance sheet left the stepper: it
  is a **reconciliation** concern.
- **New "Reco & adjustments" workspace** (its own button next to the
  steps): pick the load collection (preset from Scope, changeable),
  load the accounting file, work the lines — with **the one and only
  balance sheet** docked live on the right. The duplicate standalone
  Balance-sheet page is gone.
- **The live panel got more dynamic**:
  - the base balance loads **as soon as the collection is known** — you
    see the consolidated balance sheet before any adjustment line;
  - **pivot views**: by *Account* (Swiss GAAP / IFRS as before), by
    *Currency*, or by *Booking center* — base net of intra-scope
    interco, adjustment deltas per pivot, resolved lines only.
- Next on this trail (noted): a real BI reading — trends across
  periods, balance by counterparty residence, charts.
- No schema changes.

---

## v3.11.0 — 14 September 2026

**Theme: the generic referential, wired in.**

- The **filled generic-referential template is now live** in the
  new-position form:
  - **Counterparty picker per line**: real client, or one of the six
    generics — GEN-BANK, GEN-CORP, **GEN-CORP_FIN** (financial
    corporates, NOGA 642001), GEN-IP, GEN-CGOV, GEN-EU — preselected
    from the line's industry code (Corp + financial NOGA →
    GEN-CORP_FIN), always overridable.
  - **Domicile / HQ / nationality come from the line's RES / NAT
    columns** of the accounting file (now parsed).
  - **Rating class (0–10) and credit quality (A/B/C)** picked per line
    at generation time.
  - **Security lines**: profile picker (FI/Bond, FI/MMP — SNB 0, daily
    reval, Listed) plus per-line HQLA (L1/L2a/—), investment-grade and
    LEX-guarantee choices; the **issuer of the generated
    list_securities row is the chosen generic**.
  - The real client number is always kept on the position
    (`InternalReference2`), and per-line choices flow into the one-shot
    .sql / Excel exports.
- The generics are seeded in code and **overridable in the database**:
  rows of kind `generic` in ProdMappingEntries (editable in the Data
  Explorer) replace or extend the list — and they survive a workbook
  re-upload (user-managed kinds are preserved on 💾 save).
- No schema changes.

---

## v3.10.0 — 14 September 2026

**Theme: adjustments made workable — sticky balance sheet & simple
new-position form.**

- **The balance sheet follows you**: on wide screens the impact panel is
  docked to the right and stays in view while you scroll the adjustment
  lines — every candidate you pick updates it live. Compact columns
  (account · base · adj · after, CHF rounded), GAAP toggle and scope on
  top; hover a row for the gross / IC-eliminated detail.
- **New-position lines get a simple form** instead of raw SQL first: for
  a no-match line, confirm the four fields that matter — legal account
  (prefilled from the LIGNE's GL mapping, with a suggestion list),
  TypeOf, SubType, and Maturity date (prefilled from the file's MAT
  DATE) — everything else keeps safe defaults, and the referential rows
  (list_counterparties, list_securities for security lines) are
  generated with the generic logic. Per-line choices are carried into
  the one-shot .sql and Excel exports.
- A **generic-referential template** (Excel) was handed over: define the
  generic counterparties per MERCURY TypeOf (GEN-BANK, GEN-CORP…) and
  the security defaults for bond lines — it will be wired into the tool
  once filled.
- No schema changes.

---

## v3.9.0 — 14 September 2026

**Theme: dual-GAAP balance sheet & the adjustment booking rule.**

- **Adjustments are booked on their accounting line's GL account** — both
  in the impact preview and in the generated INSERT (`LegalAccountNumber`,
  and `cp_TypeOf`/`cp_SubType` when the mapping provides them, now
  override the matched position's values). The matched position only
  supplies the **qualitative attributes** (counterparty, booking center,
  references…). Example: LIGNE 155 → account 102001 lands in *Due from
  banks*, even when the matched position sits on 104001.
- **IFRS (HFM) view**: the Balance sheet step and the adjustments impact
  preview both gain a **SWISS GAAP / IFRS (HFM)** toggle. The IFRS view
  maps each MERCURY account to its HFM account using the
  `Mapping_GL_BALANCESHEET` sheet's `HFM_Account` column (stored when you
  re-upload the workbook and 💾 save), with **per-prefix fallback rules**
  mirroring the team's HFM Power Query (101 → 111 00 02, 102/103 →
  113 00 01, …) when an account has no mapping or is `IGNORE` — rules
  overridable in the database (rows of kind `hfmrule`). Balance-sheet
  accounts (1xx/2xx) only, HFM labels from the workbook.
- **Mapping manageable in the app**: `ProdMappingEntries` (the whole
  workbook, including the new HFM rows) and `ProdBaselines` now appear in
  **Backend → Data Explorer** — single rows (a CCY rate, an HFM rule…)
  are editable in place with the usual audit trail; bulk update stays
  re-upload + 💾 save. A **📚 Store workbook in Library** button keeps the
  Mapping.xlsb file itself in the Library (folder *Production/Mappings*).
- The MERCURY balance endpoint now aggregates by full account (the
  prefix view is unchanged).
- Note: to activate the account-level HFM mapping, **re-upload
  Mapping.xlsb once and 💾 save** — until then the IFRS view uses the
  fallback rules only (a banner says so).
- No schema changes.

---

## v3.8.0 — 14 September 2026

**Theme: production usability — see the differences, tame large adjustment
batches.**

- **Controls — differences highlighted per column**: in a finding's
  detail, the cells whose value changed between the two periods are
  highlighted; an HQLA-level change shows in red (treatment change), and
  **implausible combinations** are flagged with a ⚠ and an explanation
  (e.g. a Bank counterparty sitting in *Due from customers*).
- **Data step simplified**: with a collection picked, the one-click
  *Feed counterparties + securities* is the whole step — the per-target /
  per-loadid form moved behind an *advanced* link.
- **Balance sheet**: the consolidation scope is inherited from the Scope
  step (shown as a chip, with a *change* link to override), and account
  labels now fall back to the GL mapping descriptions when no explicit
  label sheet was stored.
- **Adjustments**:
  - a *what-you-need* checklist on top (mapping stored ✓ · adjustments
    file ✓ · load collection ✓) plus the flow in one line;
  - built for **large batches**: candidate details are collapsed (click a
    line to open it) and status chips filter matched / to-disambiguate /
    new lines;
  - **generic counterparties**: for lines whose CLIENT is unknown in
    MERCURY, an option books them on a shared generic counterparty per
    industry type (GEN-BANK, GEN-CORP…, optional rating) instead of
    creating one referential row per client — the real client number is
    kept on the position in `InternalReference2`;
  - the balance-sheet impact opens automatically after a matching run;
  - the ⊘ *out of scope* / ✂ *eliminated* tags now explain (hover) that
    they concern the consolidated preview only — the generated INSERT
    still copies the chosen position's attributes unchanged.
- No schema changes.

---

## v3.7.0 — 14 September 2026

**Theme: the guided production line — scope, certified baselines, balance
sheet.**

- **Production rebuilt as a 5-step flow**: *Scope → Data → Controls →
  Balance sheet → Certify* (the Prerequisites / Controls / Adjustments tabs
  are gone). A persistent banner shows what you work on at every step.
- **Scope step**: the load collections, grouped by reporting date, as
  cards — one click sets the period, the loads *and* the consolidation
  level (the collection's reporting entity). Certified periods carry a
  ✔ badge.
- **Data step**: with a collection picked, one button feeds
  counterparties **and** securities for every load of the collection; the
  loaded-periods inventory shows which periods are certified.
- **Controls dashboard**: one tile per control C1–C5 (status dot,
  error/warning counts, click to filter the findings), and a *"what does
  it check?"* panel per control — population, comparison base, expected
  action.
- **Certified baselines**: a *Certify* step declares the period's data
  correct (who, when, which loads, note). From then on the drift controls
  (C1/C3) **compare against the latest certified baseline** — announced
  explicitly above the findings — instead of blindly against the previous
  period; validated-drift decisions are the audit trail of what entered
  the referential. Certifying with open errors asks for confirmation;
  a certification can be removed.
- **Balance sheet step**: the collection's positions aggregated per
  account rubrique (LEFT 3), split assets / liabilities / off-balance,
  with the consolidation scope applied from `list_reporting_sets` —
  gross, intercompany eliminated and net columns. The adjustments tool
  opens from here (preset on the collection) when a rubrique doesn't tie
  out.

### Database schema (automatic at first startup)

| Migration | What it does |
|---|---|
| `011_prod_baselines` | Creates the `ProdBaselines` table (certified baseline pointers) |

---

## v3.6.0 — 14 September 2026

**Theme: production controls on the full MERCURY field set.**

- **Controls C1/C2/C3 now cover the complete MERCURY referential**
  (aligned with the real Quadrum DDL):
  - *Counterparties*: domicile / HQ domicile / nationality, related-party
    type, internal rating class + external rating, credit quality,
    SME / adequate-supervision / LEX-limit flags, SIS code, LEI — on top
    of the existing client type, grouplexid, counterparty type, rating.
  - *Securities*: currency, revaluation frequency, SNB eligibility,
    CMA approach / risk indicator / SA-RW flag, rating class + external
    rating, maturity, sub-type, investment grade, listed type,
    LEX-guaranteed — HQLA level or **SNB-eligibility** change = error.
  - PD is carried but deliberately excluded from drift (a metric, not a
    treatment).
- **TVFs extended** (`docs/SQL_MERCURY_TVFS.sql`): both functions now
  return the full attribute set, with the exact PIT joins of the real
  DDL — re-run the script on MERCURY to activate the wider contract.
  Older, narrower TVFs keep working (missing columns import as NULL).
- Integration guide (`MERCURY — integration & adjustments`) updated with
  the extended column contract.
- **MERCURY_MOCK rebuilt on the real architecture**
  (`docs/SQL_MERCURY_MOCK.sql`): the local test database now carries the
  exact production DDL (all 85 `core_positions` columns, full
  `list_counterparties`/`list_securities`, conso & loads tables — with
  mock-only defaults on NOT NULL columns), and the seed exercises the
  new full-field drifts (external rating, domicile, SNB eligibility…).
  Re-run the script, then re-run `docs/SQL_MERCURY_TVFS.sql` on it.

### Database schema (automatic at first startup)

| Migration | What it does |
|---|---|
| `010_prod_full_mercury_fields` | Adds 13 nullable referential columns to `ProdCounterparties` and 13 to `ProdSecurities` |

---

## v3.5.0 — 14 September 2026

**Theme: find anything — command palette & friendly empty states.**

- **Command palette (Ctrl+K / Cmd+K**, or the 🔍 button in the ribbon):
  type to jump anywhere — pages, built-in documentation, **entities**
  (straight into their Management Report), projects, tasks, deadlines,
  team members and contacts (searchable by department/topics), plus a
  dark-mode toggle. Keyboard-driven (↑↓ + Enter), fully offline, and it
  respects roles: Readers only see Report and Daily Reports.
- The Management Report accepts an `?entity=` deep link (used by the
  palette's entity results).
- **Illustrated empty states**: bare "No rows." / "No data yet" texts
  replaced by a small illustration with a helpful hint (Data Explorer,
  Report overview, Logs, Projects).
- No schema changes.

---

## v3.4.0 — 14 September 2026

**Theme: charts, refined — and trends at a glance.**

- **KPI sparklines**: the Management Report Overview tiles (CET1,
  Leverage, LCR, NSFR) now carry a discreet 12-point trend line under the
  ratio, ending in a brand-red dot — the direction of travel is visible
  without opening the detailed view.
- **Chart tooltips** across the whole app restyled as theme-aware cards
  (rounded, soft shadow, frosted) — dark mode included.
- **Axes & hover** harmonized everywhere: theme-colored tick labels and
  axis lines, soft hover cursor on bar charts.
- **Trend charts** gain a soft gradient fill under the line; bars get
  rounded tops (waterfall segments softly rounded); slightly bolder
  series strokes.
- No schema changes.

---

## v3.3.3 — 14 September 2026

**Theme: brand mark.**

- RegReport gets a logo: an ascending-bars monogram in the EFG deep red,
  shown in the header next to the wordmark (theme-aware) and as the
  browser-tab **favicon** — the tab is now recognizable among many.
- Browser tab title becomes "RegReport — Regulatory Reporting".
- No schema changes, no functional changes.

---

## v3.3.2 — 11 September 2026

**Theme: visual polish — same identity, finer finish.**

- Frosted-glass sticky header (content scrolls under it).
- Softer layered card shadows with a gentle hover elevation; slightly
  larger card radius.
- Branded keyboard-focus rings, brand-tinted text selection, thin
  theme-aware scrollbars, tactile button press.
- Skeleton loading placeholders (shimmer) instead of the "Loading…" label.
- Tables render tabular numerals (digits align in columns).
- No schema changes, no functional changes; honors prefers-reduced-motion.

---

## v3.3.1 — 10 September 2026

**Theme: container hardening for enterprise security scans (Trivy).**

- **Minimal runtime base image**: the container now runs on
  `aspnet:8.0-noble-chiseled-extra` — a stripped-down Ubuntu base
  (~10 OS packages, no shell, **non-root** user). This removes the bulk
  of the HIGH/CRITICAL OS findings a scanner reports against classic
  Debian-based images.
- **Floating NuGet patch versions** (`8.0.*`): every online build picks
  up the latest .NET / EF Core security patches automatically; the
  offline (vendored) build keeps working unchanged.
- **Scan guide**: `docs/DOCKER.md` gains a *Security scanning (Trivy)*
  section — how to scan the image yourself before IT does, and why the
  image should be rebuilt at every release.
- No schema changes, no functional changes. Note: the chiseled container
  has no shell — diagnostics go through `docker logs` and ☰ → Logs.

---

## v3.3.0 — 10 September 2026

**Theme: traceability — logs, audit trail, and in-place data editing.**

### New

- **☰ header menu** (top right, admins): quick access to the Logs page and
  the built-in documentation (tool documentation, MERCURY docs, release
  procedure, these release notes).
- **Logs page** (☰ → Logs), two tabs:
  - *Technical* — every API call made by your browser tab (method, path,
    status, duration) plus the API server's own log (requests with the
    calling user, startup, schema migrations, errors). For debugging.
  - *Business* — the persistent audit trail: who changed which dataset,
    when, and what exactly.
- **Audit trail (`ChangeLogs` table)**: every data change is recorded —
  one summary line per dataset on each save, and field-level entries
  (`limit: 464.6 → 500`) for Data Explorer edits, inserts, deletes and CSV
  imports. Each entry carries an indexed **row key**, so one row's full
  history is a single indexed lookup.
- **Data Explorer** (Backend cockpit):
  - per-column filters under the header row (combinable, AND);
  - click a row → **side panel** showing every field, editable in place
    (typed inputs, JSON for nested values), with Save / Delete;
  - **Change history** section in the panel: everything that ever happened
    to that row;
  - **✎ markers** in the table on every row that has recorded changes
    (badge shows the change count, tooltip the last change).
- **Self-service full archive**: Admin → Backup & restore →
  *Download full archive (ZIP)* — central data + every Library document,
  no SQL-server rights needed. Take one before each release.
- **Built-in documentation in English** (tool documentation, MERCURY
  integration notes, release procedure), and a dark-mode fix for the
  markdown viewer.

### Database schema (automatic at first startup)

| Migration | What it does |
|---|---|
| `007_change_logs` | Creates the `ChangeLogs` audit table |
| `008_change_logs_rowkey` | Adds the indexed `RowKey` column to `ChangeLogs` |
| `009_performance_indexes` | Adds `(Entity, Date)` indexes to `LargeExposures` and `CounterpartyRwa` (narrows their key columns from nvarchar(max) to nvarchar(450) first) |

### Configuration

- `App:ChangeLogRetentionDays` (optional, default 0 = keep everything):
  when set, audit entries older than N days are purged at API startup.

### Notes

- Rows changed **before** v3.3.0 have no audit history (the trail starts
  with this release) — unmarked rows in the Data Explorer are expected.
- In a TEST container without authentication (`Security:Mode` unset), the
  audit records the user as `anonymous`/`local`; real user names appear
  once Windows auth or the enterprise SSO (Keycloak) is enabled.
- Rollback: the previous state is preserved on the git branch
  `backup/v3.2.0-pre-audit-schema`; the schema changes are additive, so
  v3.2.0 binaries run fine against the upgraded database.

---

## v3.2.0 — September 2026

**Theme: the platform release — production tooling, projects, deployment.**

The full detail is in *RegReport — tool documentation* (★ What's new v3.2).
Summary:

- **Reporting & Workbench**: Leverage and Large Exposures tabs in the
  Management Report; K-LER (FINMA) import with counterparty types, exempted
  sovereign family and Direct/Indirect/CRM decomposition; **RWA by
  currency** with the automatic MERCURY FX proxy (balance-sheet shares ×
  end-of-month `EFG_CCY_MONTHLY` rates); flexible CET1 bridge with manual
  lines; hardened P&L import.
- **Production / MERCURY**: full Adjustments module (load-collection
  matching, intercompany, consolidation-scope eliminations, one-shot
  SQL/Excel, persisted mappings, audit of decisions), reporting-entity
  selector.
- **New modules**: Projects (Kanban / List / Gantt, subtasks, comments,
  activity log, per-task attachments), Library (documents in the database,
  folders, built-in viewer), Team & Contacts (searchable by topic).
- **Platform**: dark mode; version + environment badge (`/api/meta`);
  **built-in schema migrator** (`__SchemaMigrations`, migrations 001–006);
  reworked Admin (System panel, data inventory, entity rename with
  cascade, backup/restore); Daily Reports on real entities; fully offline
  build; one-zip release; **Docker deployment** (multi-stage image,
  compose with optional SQL Server, configuration via environment
  variables).
- **Security**: Reader role restricted to Report + Daily Reports.

### Database schema

Migrations `001_production_tables` … `006_contacts_directory`.

---

## v3.1 and earlier — 2026

Progressive build-up of the core platform: central data document and
`GET/PUT /api/data` contract, KPI history with per-currency liquidity,
Management Report with per-section PDF export, Scenarios with per-event
bridge, Deadlines, CSV feeds, risk appetite thresholds, Windows
authentication with Reader/Admin roles, SQL Server relational schema
(EnsureCreated), MERCURY read-only connection for production controls
C1–C5.
