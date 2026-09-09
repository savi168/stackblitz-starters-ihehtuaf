# MERCURY integration — feeding the production controls

The app feeds the control tables (`ProdCounterparties`, `ProdSecurities`)
directly from the **MERCURY** database, triggered from *Production →
Prerequisites → Feed from MERCURY* by picking the **loadid** and the
**product type**. The contract is deliberately simple:

```
Front (Production)  →  POST /api/production/mercury/load   →  SELECT * FROM <TVF>(@loadId, @productType)
                        { target, entity, date,                on the MERCURY connection
                          loadId, productType, dataset }    →  replaces the scope in RegReport
```

**The TVF lives on the MERCURY side and encapsulates the model** (joins
`core_positions × list_counterparty`, loadid/product filters…). The API only
knows the TVF's name and the column contract below — when the MERCURY model
evolves, you adapt the TVF, not the application.

## 1. Configuration (appsettings.Development.local.json)

```json
{
  "ConnectionStrings": {
    "Default": "…RegReport…",
    "Mercury": "Server=localhost;Database=MERCURY;Trusted_Connection=True;TrustServerCertificate=True"
  },
  "Production": {
    "Sources": {
      "counterparties": "dbo.fn_regreport_prod_counterparties",
      "securities": "dbo.fn_regreport_prod_securities"
    }
  }
}
```

`GET /api/production/mercury/status` reports whether the connection is
configured and reachable.

## 2. TVF column contract

Column names are case-insensitive; any missing column is imported as
empty/NULL. Rows without a key (ClientNumber / Isin) are ignored.

### `fn_regreport_prod_counterparties(@loadId nvarchar, @productType nvarchar NULL)`

| Column | Type | Role |
|---|---|---|
| `Dataset` | nvarchar | `liquidityAssets` \| `dueFromBanks` \| `dueToBanks` \| `dueFromCustomers` \| `dueToCustomers` \| `mortgages` (otherwise the dataset picked in the app is applied) |
| `ClientNumber` (or `CounterpartyId`) | nvarchar | **key** |
| `ClientType` | nvarchar | client type from the data model |
| `GroupLexId` | nvarchar | ultimate parent |
| `CounterpartyType` | nvarchar | retail bank, financial… |
| `IssuerRating` (or `Rating`) | nvarchar | |
| `Amount` | float | mCHF |
| `Currency` | nvarchar | |

### `fn_regreport_prod_securities(@loadId nvarchar, @productType nvarchar NULL)`

| Column | Type |
|---|---|
| `Isin` | **key** |
| `SecurityMaster`, `SecurityType`, `Rating` | nvarchar |
| `DailyReval` | bit / 0-1 / 'true' |
| `IssuerLexId`, `GuarantorLexId`, `GuarantorName`, `HqlaLevel` | nvarchar |
| `Amount` | float |

## 3. TVFs on the Quadrum Data Lake model

The TVFs **written against the real model** (doc `docs/mercury-model/`) live
in **`docs/SQL_MERCURY_TVFS.sql`** — joins `core_positions ×
list_counterparties` (Id + PointInTime) and `core_positions × list_securities ×
list_counterparties` (issuer + guarantor), GroupLEXId as ultimate parent,
HQLACategory as the HQLA level computed by the QDL rules. Points to adjust in
the dataset CASE: `LegalAccountNumber` prefixes and the mortgage SubType.

The generic example below only illustrates the principle:

```sql
CREATE FUNCTION dbo.fn_regreport_prod_counterparties
    (@loadId nvarchar(64), @productType nvarchar(64) = NULL)
RETURNS TABLE
AS RETURN
SELECT
    CASE p.product_family                       -- map onto the 6 datasets
        WHEN 'LIQ'  THEN 'liquidityAssets'
        WHEN 'DFB'  THEN 'dueFromBanks'
        WHEN 'DTB'  THEN 'dueToBanks'
        WHEN 'LOAN' THEN 'dueFromCustomers'
        WHEN 'DEP'  THEN 'dueToCustomers'
        WHEN 'MORT' THEN 'mortgages'
    END                        AS Dataset,
    p.counterpartyid           AS ClientNumber,
    c.client_type              AS ClientType,
    c.grouplexid               AS GroupLexId,   -- ultimate parent (list_counterparty)
    c.counterparty_type        AS CounterpartyType,
    c.issuer_rating            AS IssuerRating,
    p.amount_chf / 1000000.0   AS Amount,
    p.currency                 AS Currency
FROM core_positions p
JOIN list_counterparty c ON c.counterpartyid = p.counterpartyid
WHERE p.loadid = @loadId
  AND (@productType IS NULL OR p.product_type = @productType);
```

Same principle for `fn_regreport_prod_securities` (security master, rating,
reval, guarantor, HQLA level).

## 4. Production loop

1. Each period: *Production → Feed from MERCURY* → loadid + product type →
   the control tables are replaced for the period.
2. *Controls* tab: C1 (per-client drift vs previous period), C2 (one
   treatment per grouplexid), C3 (per-ISIN drift), C4 (physical vs
   guarantee/HQLA referential) — automatic as soon as the data is there.
3. The manual CSV remains available as a fallback (same tables, same
   controls).

## 5. Adjustments module — agreed rules (*Production → Adjustments* tab)

Sources: `docs/mercury-model/adjustments-sample.xlsx` (accounting lines:
LIGNE, REFERENCE, MONTANT, NOMINAL, CCY, CATEG, IND, CLIENT, DEBIT/CREDIT…)
and `docs/mercury-model/Mapping.xlsb` (Mapping_GL_BALANCESHEET, CCY, Maping
RT01→QDL, INDUSTRY).

**Matching an adjustment line with core_positions (of the chosen load)**:

1. Candidates by composite LIKE key:
   `(InternalReference1 LIKE '%<REFERENCE>%' OR ContractId LIKE '%<REFERENCE>%')`
   `AND CounterpartyId LIKE '%<CLIENT>%'`
2. Multiple candidates are common → disambiguation by
   `LegalAccountNumber = Mapping_GL_BALANCESHEET[LIGNE].LegalAccountNumber`
   (the mapping is what says which line we want to build/adjust from the base
   instruction).
3. One candidate → INSERT of an adjustment core_positions row (attributes
   copied, BookAmount = MONTANT signed by DEBIT/CREDIT, conversion via the
   CCY sheet, Id suffixed -ADJ, DataSource = 'ADJUSTMENT').
   Several after disambiguation → user choice in the UI.
   None → full construction: LIGNE→Mapping_GL_BALANCESHEET (account,
   cp_TypeOf, cp_SubType…), IND→INDUSTRY (TypeOf + EconomicActivityType),
   CATEG→Maping (RT01→QDL), counterparty = CLIENT.
4. Everything goes through prepared SQL scripts (control SELECT + INSERT) and
   the decision log, like the C1–C5 controls.

**Implementation**: *Production → Adjustments* tab — upload of the mapping
workbook + the adjustments file, loadid choice (core_loads), *Run matching*
button → `POST /api/production/mercury/adjustments/match` (composite LIKE
key, TOP 25 candidates per line, `accountMatch` flag when the candidate's
LegalAccountNumber = the one from the LIGNE's GL mapping). Single candidate
or lone ✓GL → preselected; several → choice in the UI; none → full
construction INSERT. The *Copy + log decision* button records the decision
(`ADJ` control) into the Controls tab's history.
The mock (`SQL_MERCURY_MOCK.sql`) contains three test positions
(POS-ADJ-A/B/C, load 1002) aligned with the sample file
`adjustments-sample.xlsx` (references 5950216318 / 5900175308).

**Referentials (C5 anti-orphans)**: every new position (without a match)
generates a *package* — first the missing referential rows, guarded by
`IF NOT EXISTS` (no duplicate if they already exist at the PIT):
`list_counterparties` for the CLIENT (TypeOf/EconomicActivityType prefilled
via IND→INDUSTRY and CATEG→RT01), and when the GL LIGNE is `cp_TypeOf =
Security`, a `list_securities` row (Id `ADJ-SEC-<ligne>-<row>`, ISIN when the
REFERENCE has the right format, MaturityDate from MAT DATE, issuer = CLIENT)
linked to the position by SecurityId/SecurityPIT — then the `core_positions`
INSERT. The one-shot Excel adds the corresponding `list_counterparties` /
`list_securities` sheets (deduplicated).

**Intercompany & booking center**: an IND code carrying `HYPERIOD_INTERCO`
in the INDUSTRY sheet marks an intercompany position — the value (e.g.
`3000 00` for COMPANY Bank SA Zurich) is forced into
`CounterpartyBookingCenterId`, on matched adjustments as well as on new
positions ("IC" badge in the lines table). The UI's *Booking center* field is
stamped into the `BookingCenterId` of new positions.

**Balance-sheet impact preview** (📊 button): `GET
/api/production/mercury/balance?loadId=` aggregates the load by
`LEFT(LegalAccountNumber,3)` (SUM BookAmount); the UI shows per prefix —
Assets (1xx) / Liabilities (2xx) / Off-balance-sheet sections — the base
balance sheet, the adjustments delta (matched lines → account of the chosen
position, otherwise the GL mapping's account, amounts converted to CHF) and
the resulting balance sheet, with labels derived from the GL mapping (most
frequent HFM description per prefix).

**Load collections (the adjustments' unit of work)**: `GET
/api/production/mercury/load-collections` lists `core_load_collections`
(visible, not archived; query overridable via
`Production:LoadCollectionsQuery`) with their member loads
(`core_loads_loads_collection`). Pick a collection in the tab: the matching
covers **all the loads** of the collection (a matched adjustment's INSERT
targets the candidate's load), the collection's `ReportingEntityId`
**automatically sets the consolidation scope** (eliminations visible right
away, ✂/⊘ badges per line), and the base balance sheet aggregates all the
loads. The "Target load" (new positions) is picked among the members.

**Persisted mappings**: 💾 *Save to database* button → relational table
`ProdMappingEntries` (RegReport, script kept in
`SQL_PRODUCTION_TABLES.sql`) — kinds `gl` / `fx` / `rt01` / `industry` /
`label`. When the tab loads, the mappings come from the database; re-uploading
the workbook is only for updates (e.g. CCY rates), followed by a new 💾.

**Audit trail**: every copied script or one-shot export is logged (`ADJ`
control) into `ProdFindingLogs` — a SQL table of the RegReport database, like
the decisions of the C1–C5 controls. The Adjustments tab shows the history
(who / when / what); the Controls tab keeps its "Decision history".

**Eliminations by consolidation scope**: the 📊 preview offers a
*Consolidation scope* selector fed by `GET /api/production/mercury/conso`
(`list_reporting_entities` + BO/PC/GR levels, `list_reporting_sets` = booking
centers of the scope, `list_booking_centers` with OwnerId). With a scope
selected: the base balance sheet is restricted to positions booked inside the
scope (the balance endpoint splits by BookingCenterId ×
CounterpartyBookingCenterId), the amounts — base and adjustments alike —
whose `CounterpartyBookingCenterId` is **inside** the scope are
**eliminated** (Adj gross / IC eliminated / Adj net columns), and adjustment
lines booked outside the scope are excluded (⊘ counter). A position without
a booking center is kept. The mock contains MOCK-SOLO (BC-GVA) and MOCK-GROUP
(BC-GVA + BC-ZH) with POS-ADJ-C intercompany BC-GVA↔BC-ZH: eliminated at
group level, kept solo.

**One-shot generation**: as soon as the matching is resolved, two exports —
a **single .sql** (all the INSERTs, one SSMS execution) and an **Excel**
(Summary sheet + core_positions sheet with the rows to insert, all columns,
for mass review / bulk import). Lines still ambiguous (candidate not chosen)
are excluded and flagged.

**Manual line**: "Manual line" panel — pick a LIGNE from the GL mapping
(dropdown with account + description), signed amount, CCY, nominal, optional
reference/client/label → full INSERT with the mapping's defaults, or "Add to
the lines" to include it in the matching and the one-shot.
