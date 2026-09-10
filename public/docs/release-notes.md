# RegReport — Release notes

One section per release, newest first. Each section lists what changed, the
database schema migrations it ships (applied automatically at API startup),
and anything to know before or after upgrading.

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
