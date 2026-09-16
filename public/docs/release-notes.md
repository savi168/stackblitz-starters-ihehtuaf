# RegReport — Release notes

One section per release, newest first. Each section lists what changed, the
database schema migrations it ships (applied automatically at API startup),
and anything to know before or after upgrading.

---

## v3.28.1 — 16 September 2026

Footnote accuracy fix on the Live balance impact card: the Account view
books **all** loaded lines on their LIGNE's GL account (the candidate
only supplies qualitative data), so the footnote now says
`adj = all N lines on their LIGNE's GL account (n resolved)` there, and
keeps `adj = resolved lines only (n/N)` on the Currency / Booking-ctr
pivots, which do exclude ambiguous lines until a candidate is picked.
The thin progress bar reads "n/N resolved". Frontend only.

---

## v3.28.0 — 16 September 2026

**Theme: 📊 Live balance impact card — matched to the canvas.**
Frontend only, no schema migration, no database impact.

- **Card chrome**: the Reco right panel is now a proper card (rounded,
  soft shadow, padded) instead of a bordered box with a grey header
  bar. Row 1 = title + SWISS GAAP / IFRS (HFM) toggle right-aligned;
  row 2 = pivot pills (Account · Currency · Booking ctr) with the
  reporting-set select on the right.
- **Canvas table style**: rubrique number in bold with its official
  label inline on the same line (`102 Due from banks`), adjusted rows
  tinted maroon, deltas signed and bold (green `+2.5` / red `−0.7`),
  untouched cells as a mist `—`, the After value bold on adjusted
  rows, and bold **Total assets** / **Total liabilities & equity**
  section totals. Currency and booking-center pivots share the style.
- **Figures in mCHF**: amounts switch to millions with one decimal and
  Swiss apostrophe grouping (4'218.0) whenever the balance sheet is
  large enough; small test datasets stay in raw CHF. The unit is
  stated in the footnote.
- **Progress bar + footnote**: a thin bar shows how many lines feed
  the deltas, and the footnote reads like the canvas — `mCHF · net of
  intra-scope interco (MOCK-GROUP reporting set) · base = JAN-26 GROUP
  monthly, adj = checked lines only (12/18)`.
- Nothing functional changed: same scope filter, same IC elimination,
  same dual-GAAP regrouping, same pivots — presentation only.

---

## v3.27.0 — 16 September 2026

**Theme: 🏛 Reco pixel pass — the top-bar collection is THE link.**
Frontend only, no schema migration.

- **The top-bar scope drives Production line AND Reco continuously**:
  changing the period/entity up top re-scopes the Reco card even after
  a collection was already selected (master preferred); an in-card pick
  now reports back to the page and the global scope, so the top bar,
  the Production line and the Reco can never disagree.
- **Reco header**: the resolved loads chip (● load(s) 1002 ·
  2026-01-31) sits top-right; the entity select is gone from the page —
  the top bar owns it. The collection checklist chip shows the real
  collection name.
- **Inbox restyled to the canvas**: line cards (rounded, status dot,
  LIGNE · GL account, signed amount, label · CCY under) with the
  selected card outlined in maroon; detail header as chips (black LIGNE
  tag, maroon GL chip, amount chip, status badge right); "Matching
  candidates — qualitative data only…" ruled section; a **Booking
  preview** strip above the primary action; **✓ Confirm & generate
  SQL** as the primary button with **Next unresolved: line N →**; the
  dark SQL block titled "Generated SQL — load N"; the right panel
  titled **Live balance impact**.
- No schema migration.

---

## v3.26.0 — 16 September 2026

**Theme: 🏛 Reco lands straight in the inbox; Analytics follows the
top-bar period.** Frontend only, no schema migration.

- **Reco & adjustments — the target flow**: with the mapping stored, a
  file loaded and the collection coming from the top-bar scope, the page
  goes straight to the inbox. The file and scope sections fold away —
  click any checklist chip (✓ Mapping · ✓ Adjustments file · ✓ Load
  collection) to reopen them; ⚙ settings moved next to the chips. With
  no file yet, a drag-and-drop zone welcomes the accounting extract
  (drop the file or browse).
- **Balance sheet analytics — anchored on the global scope**: the
  analyzed period is now the one picked in the top bar; earlier load
  collections stay on the axis as comparatives (trend, currency,
  booking-center, residence, top movements), later ones are dropped.
  Switching the top-bar period re-anchors every chart.
- No schema migration.

---

## v3.25.1 — 16 September 2026

**Fix: the Reco page showed a stale view.** `/production` and
`/production/reco` render the same component, so navigating between them
kept the previous step on screen (the Reco page could show the Scope
step). The view now follows the route. No other change.

---

## v3.25.0 — 16 September 2026

**Theme: 🏛 Reco and Production line become true canvas pages; filter
values become visible.** Frontend only, no schema migration.

- **Reco & adjustments is its own page**: opening it from the sidebar
  shows its own header and the workspace directly — no more "Production"
  title, intro or step pills around it. The **Production line** page
  keeps only its four steps (Scope → Data → Controls → Certify), titled
  and subtitled per the validated canvas; Reco and Analytics are reached
  from the sidebar.
- **Per-column filters now show the available values**: in the Data
  Explorer (and therefore the Mappings page), clicking a column filter
  opens the list of distinct values of that column (up to 200, sorted,
  count shown in the placeholder) — no need to know a field's contents
  by heart. Typing still filters as before (contains, case-insensitive).
- No schema migration.

---

## v3.24.0 — 16 September 2026

**Theme: 🏛 Architecture phase 4 — the validated canvas designs land in the
modules.** Frontend only, no schema migration, database connection
untouched. Rollback branch: `backup/v3.23.0-pre-modules`.

- **Data pages split** — no more "three links, one page": `#/explorer` is
  the Data Explorer as its own module (same table picker, per-column
  filters, row editor with audit, CSV); `#/mappings` is Mappings &
  nomenclatures (the 11 kinds explained, the explorer opened on
  ProdMappingEntries, bulk-reload pointers); the **Backend cockpit**
  keeps the connection panel, schema and API map.
- **Workbench** (validated card design): every sub-application is now a
  card — Shareholder Equity, Deductions, AT1 & T2, RWA, LCR, NSFR,
  Balance Sheet, P&L, Equity Stmt, Comments — with a ✓ when the period
  carries data. Moved to the **Data** section of the sidebar and renamed
  *Workbench*; all imports and entry flows unchanged.
- **Library** (validated two-column layout): folder tree + built-in
  documentation shelf on the left, the selected folder's documents on
  the right with scoped search. Everything kept: drag & drop of files
  AND folders (incl. drops from the OS explorer), rename/move,
  subfolders, upload-into-folder, the in-app viewer, versioned storage.
- **Production line**: the step row becomes the canvas pipeline — green
  ✓ on completed steps (collection picked, loads present, baseline
  certified), amber finding count on Controls, connector lines.
- **Reco & adjustments**: canvas status colors (green matched, amber
  ambiguous, red new) across dots, filter pills and the progress bar,
  and the generated SQL now sits in the dark code block with the Copy
  action on top.
- No schema migration.

---

## v3.23.0 — 16 September 2026

**Theme: 🏛 Architecture phase 3 — every module pre-positions on the scope
entity.** Frontend only, no schema migration, no backend change — the
database connection is untouched.

- **Management report, Daily reports and the Capital & liquidity
  workbench now pre-position on the global scope entity** (top bar).
  Read-only follow: when the global entity changes AND it exists in the
  module's own entity list, the module switches to it — otherwise
  nothing happens. Each module's own selector keeps working exactly as
  before, and a manual local choice is never overridden until the
  global scope changes again.
- **Periods stay free everywhere**: the Management report keeps its
  Compare / History modes on any past dates (comparatives are not
  restricted to the scope period); the workbench still resets the
  period on an entity switch, exactly like a manual pick; the ?entity=
  deep link into the Management report keeps priority.
- Modules whose entity nomenclature differs from the MERCURY reporting
  entities are simply left alone (no match → no-op), so nothing can
  jump unexpectedly.
- Scenarios untouched (by decision). No schema migration.

---

## v3.22.0 — 16 September 2026

**Theme: 🏛 Architecture phase 2 — the global scope drives the modules.**
Frontend only, no schema migration. Scenarios untouched (by decision).

- **Production line & Reco follow the top bar**: changing the period or
  entity in the global context bar selects the matching load collection
  in the Production page (master collection preferred) — and picking a
  collection or entity inside the page pushes back to the global scope,
  so the whole app stays on the same period/entity. A deliberate pick of
  a sibling (non-master) collection for the same entity+date is
  respected.
- **Balance analytics follows too**: the entity selector on the
  Analytics page now reads and writes the global scope — switch entity
  there and Production, Reco and Home move with you.
- **Home cockpit** already consumed the global scope (v3.21); with this
  release the Continue button always lands on the same scope you see in
  the top bar.
- Scope setters hardened (atomic entity+period update when a collection
  is picked).
- No schema migration.

---

## v3.21.0 — 15 September 2026

**Theme: 🏛 New architecture, phase 1 — sidebar, global context, Home cockpit.**
Frontend only: no schema migration, no data touched, every existing page
keeps 100% of its features (they render unchanged inside the new shell).
Rollback branch: `backup/v3.20.0-pre-archi`.

- **Grouped sidebar navigation** replaces the top nav: every module,
  organized by domain — Monthly close (Production line, Reco &
  adjustments, Calendar & deadlines), Analytics (Balance analytics,
  Management report, Daily reports), Simulation (Scenarios, Capital &
  liquidity), Data (Data explorer, Mappings & nomenclatures, Library),
  Workspace (Projects, Team & contacts), Admin (Backend cockpit, Data
  management, Logs & audit). Admin-only items stay hidden for readers,
  exactly as before. Off-canvas drawer on small screens.
- **Global context bar**: the reporting period and entity are picked once
  in the top bar (persisted per browser) with a live Certified ✔ /
  Close-in-progress status from the certified baselines. Phase 1 stores
  and shows the selection; modules will be wired to it progressively.
- **Home = close cockpit**: the pipeline Scope → Data → Controls → Reco →
  Certify with real states (loads visible, baseline certified), total
  booked assets of the scope, certified-baselines and next-deadline
  tiles, upcoming deadlines and the recent business audit trail. The
  classic module-cards hub remains at `#/hub` (linked from Home).
- **Direct entries**: `#/production/reco` opens the Reco workspace
  directly; the sidebar's Data explorer / Mappings entries deep-link into
  the Backend cockpit (`?tab=data`, `?table=prodMappingEntries`).
- **Warm light theme**: the page background moves from the cool grey-blue
  `#F4F5F4` to a warm paper white `#F7F6F3` (dark mode unchanged).
- No schema migration.

---

## v3.20.0 — 15 September 2026

**Theme: 🌍 Interactive map — the Power-BI feel.**

- **Zoom & pan**: scroll to zoom (towards the cursor), drag to pan,
  double-click a country to frame it (double-click the ocean resets).
  On-map +/−/reset buttons and one-click region presets (World, Europe,
  Asia-Pacific, Americas, Middle East & Africa). All hand-rolled on the
  existing SVG — no new dependency, still fully offline.
- **Richer read-out while you explore**: a floating tooltip with flag,
  amount, share of total, **Δ vs the previous period** (▲/▼) and the
  country's rank; once zoomed past ~2.6× the map itself annotates each
  country with its ISO code and amount.
- **Click to pin a country**: the side panel switches from the top-10
  list to a country detail — total, share, rank, Δ vs previous period,
  and a **breakdown by rubrique** (official FINMA labels) with per-line
  deltas, plus a "zoom to country" shortcut. The top-10 list itself is
  now clickable and zooms to the country. Works for both axes
  (counterparty residence and booking center).
- **API**: `/production/mercury/balance-residence` now also returns the
  3-digit rubrique (`prefix`) — appended as an extra column, existing
  consumers are unaffected. The Analytics page now fetches residence for
  the two latest periods, powering the period-over-period deltas.
- No schema migration.

---

## v3.19.0 — 15 September 2026

**Theme: 🌍 Geographic footprint.**

- **A world map lands in Analytics** — the ERP-style geo view:
  countries shaded by assets (choropleth) with proportional bubbles,
  hover for amount and share of total, and a top-10 country list with
  share bars beside the map (hover syncs both ways).
- **Two axes**, one toggle: *Counterparty residence* (DomicileCountry
  of list_counterparties at the position's PIT) and *Booking center*
  (OfficeCountry of list_booking_centers, now exposed by the conso
  endpoint). Both follow the entity, scope and interco-elimination
  logic of the rest of the page.
- **Financial-center micro-territories** (Hong Kong, Singapore, Monaco,
  Liechtenstein, Bahrain, the Channel Islands, Cayman…) are too small
  for the world polygons — they get dedicated point markers, so the
  Hong Kong booking never disappears from the map.
- **Fully offline**: the world boundaries (world-atlas TopoJSON) and
  the ISO-3166 table are bundled with the app — nothing is fetched from
  the internet, the Trivy posture is unchanged. The offline npm cache
  was refreshed with the new packages (d3-geo, topojson-client,
  world-atlas, iso-3166).
- Note: before the geo work, the v3.18.1 state was preserved on branch
  `backup/v3.18.1-pre-geo`.
- No schema changes.

---

## v3.18.1 — 14 September 2026

**Theme: the data model at your fingertips.**

- **Field tooltips from the Quadrum data model**: the advanced
  all-fields editor now documents every column — hover a field name (ⓘ)
  to read its official definition, extracted from
  *docs/mercury-model/datamodel (1).pdf* (101 fields across
  `core_positions`, `list_counterparties`, `list_securities`, legal
  references included, e.g. *LEXGuaranteedFlag — Set to 1 for bonds
  guaranteed according to OFR Art.118 al.1 let.c and Finma circ. 2019/1
  cm 52-62*). Chain-managed fields say so in the tooltip.
- No schema changes.

---

## v3.18.0 — 14 September 2026

**Theme: every field at hand — and the Excel referential fixed.**

- **Fix — Excel one-shot export**: the `list_counterparties` /
  `list_securities` sheets were built without the per-line choices —
  a security booked on a generic (e.g. GEN-CGOV) got its position row
  but **no issuer row**, breaking `ls.IssuerId/IssuerPIT =
  lc.Id/PointInTime`, and the security sheet ignored the chosen
  profile/maturity. The companion sheets now apply the same per-line
  logic as the .sql script (generics included, one row per distinct
  counterparty id). If you loaded from a previous Excel, re-export and
  re-load the referential sheets.
- **Advanced all-fields editor** on new-position lines (🔧 *all fields*):
  the quick fields stay, and a panel now lists **every column of the
  rows that will be generated** — `core_positions`,
  `list_counterparties`, `list_securities` (security lines) — prefilled
  with the exact values the INSERT will carry; type to override any of
  them (blank = keep, overridden fields highlighted). Chain-managed
  columns (ids, PITs, LoadId) are locked so the
  position → security → issuer links can never break. Field
  definitions: the Quadrum data model (docs/mercury-model).
- **Issuer guard**: a security line with no client and no generic now
  shows a red warning — the issuer link would be broken (future C5
  orphan).
- No schema changes.

---

## v3.17.1 — 14 September 2026

**Theme: HFM nomenclature seeded too.**

- The official **HFM (IFRS) nomenclature is now seeded into the
  database** at API startup — 93 reporting lines (HFM account → label,
  e.g. `113 01 01 — Due from other banks at term`), extracted from the
  `Mapping_GL_BALANCESHEET` correspondence table (HFM_Account ×
  CAO_DM.RepLineHFMDsc) the team already maintains. Stored as kind
  `hfmname` rows, seeded only when absent, editable in the Data
  Explorer, authoritative over workbook-derived labels everywhere the
  IFRS view is shown (live balance sheet, Analytics top movements).
- No separate nomenclature file needed — the workbook was already the
  source of truth.
- No schema changes.

---

## v3.17.0 — 14 September 2026

**Theme: the nomenclatures live in the database.**

- **LegalAccountNumber nomenclature seeded into the database**: at API
  startup, the 216 official FINMA labels are inserted into
  `ProdMappingEntries` as kind `lanlabel` rows (account → label) —
  **only when absent**, so your edits are never overwritten. They are
  editable in Backend → Data Explorer like any mapping row, survive
  workbook re-uploads, and travel with backups. Every screen reads the
  stored rows first (live balance sheet, Analytics, reco detail,
  account suggestions); the embedded copy remains only as a fallback
  for local mode.
- **kind `hfmname` reserved for the official HFM nomenclature** (HFM
  account → label): rows of this kind override the labels derived from
  the mapping workbook everywhere the IFRS view is shown. Send the
  official HFM nomenclature file and it will be seeded the same way.
- No schema changes.

---

## v3.16.0 — 14 September 2026

**Theme: referential fidelity — official account names, HFM refs,
security integrity.**

- **Official FINMA account nomenclature** (circular 2020/1, appendix
  A1/A2, from the Quadrum data-model reference): every place that names
  a LegalAccountNumber now uses the real label — the Swiss GAAP rows of
  the live balance sheet and of Analytics (e.g. 102 *Amounts due from
  banks*, 104 *Amounts due from customers*), the GL chip of the reco
  detail panel, and the account suggestion list of the new-position
  form.
- **HFM reference on every adjustment**: a per-line *HFM ref* field
  (prefilled from the HFM mapping of the LIGNE's GL account, editable,
  with the known HFM accounts as suggestions) is stamped on the
  generated position in `InternalReference3` — matched adjustments and
  new positions alike, one-shot exports included.
- **GroupLexId for generated counterparties**: a per-line field feeds
  `GroupLEXId` of the created `list_counterparties` row; a generic can
  also carry a default (kind `generic` rows, TextValue column).
- **Security lines tightened** (TypeOf = Security only):
  - the position itself now carries `MaturityDate` (not only the
    `list_securities` row);
  - changing TypeOf to *Security* in the form now correctly creates the
    `list_securities` row (the flag honors the override);
  - the id/PIT chains are guaranteed: `core_positions.SecurityId/PIT` =
    `list_securities.Id/PointInTime`, and `list_securities.IssuerId/PIT`
    = `list_counterparties.Id/PointInTime` (the generic when one is
    used).
- IFRS nomenclature of the side balance sheet: the HFM labels come from
  the mapping workbook today — send the official HFM nomenclature file
  and it will be imported as the authoritative source.
- No schema changes.

---

## v3.15.0 — 14 September 2026

**Theme: the Reco inbox.**

- The adjustment lines are now worked **like an inbox**, in three
  columns:
  - **left** — the lines as cards (status dot, LIGNE + label, amount),
    with the progress bar and the matched / to-pick / new filters on
    top;
  - **middle** — the selected line as a large working panel: a proper
    header (amount, reference, client with IC badge, GL account and its
    label, maturity, scope tag), the MERCURY **candidates as selectable
    cards** (no more dense sub-table), or the new-position form for
    no-match lines; one primary button generates the INSERT, and the
    SQL appears below it for review + *Copy & log*;
  - **right** — the live balance sheet, unchanged.
- **Keyboard-driven**: ↑↓ moves through the lines, Enter generates the
  selected line's INSERT (when it is matched or new) — a 100-line batch
  is worked through like a mail queue.
- Same functionality as before (matching rules, generics, per-line
  overrides, one-shot exports) — only the presentation changed.
- No schema changes.

---

## v3.14.0 — 14 September 2026

**Theme: Balance sheet analytics — wired to MERCURY.**

- The analytics page (📈) now runs on **real data** — the preview badge
  is gone:
  - **period axis** = the entity's load collections (one point per
    reporting date, master collections preferred, last 8), ✔ marking
    the certified baselines;
  - every figure = the `/mercury/balance` aggregate of that period's
    loads, with the reporting-set scope and intra-scope interco
    elimination applied exactly like the Reco panel;
  - **KPI tiles** (assets, liabilities, interco eliminated, adjustments
    of the period) with real sparklines; **trend**, **assets by
    currency** (top-4 + Other), **booking centers** (latest vs
    previous), **top movements** with the adjustment share isolated
    (positions flagged `DataSource = ADJUSTMENT` — new dimension on the
    balance endpoint);
  - **by counterparty residence**: new read-only endpoint
    `mercury/balance-residence` joining `list_counterparties.
    DomicileCountry` at the position's PIT — works on MERCURY_MOCK and
    on the real MERCURY alike (same schema), no IT development needed;
  - SWISS GAAP / IFRS (HFM) toggle on the top-movements view; entity
    selector; graceful empty states when MERCURY is unreachable.
- No schema changes (two read-only query changes on the MERCURY side of
  the API).

---

## v3.13.0 — 14 September 2026

**Theme: analytics preview & the reco flow made simple.**

- **Balance sheet analytics — preview** (📈 next to the steps, or
  `/production/analytics`): a BI mockup on **sample data** to validate
  the reading before wiring — KPI tiles with sparklines, six-period
  trend with certified-baseline markers, assets by currency (stacked),
  booking centers vs previous period, counterparty residence, and a
  top-movements table isolating the adjustments. Each block states its
  wiring: trend/currency/booking center come from the existing balance
  endpoint; **residence needs a small MERCURY join to validate with
  IT**.
- **Reco & adjustments, the simple flow**: *1 · Load your file* (the
  **matching runs automatically** — no button), *2 · Review the lines*
  (progress bar: matched / new / to-pick), *3 · Export*. The scope shows
  as a chip (change on demand), and the mapping workbook, booking
  center, generics and the manual-line tool moved behind ⚙ settings —
  the day-to-day screen is: drop the file, fix the flagged lines, watch
  the live balance sheet, export.
- No schema changes.

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
