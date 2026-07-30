-- =============================================================================
-- TVFs to feed the RegReport production controls from the MERCURY / Quadrum
-- Data Lake (see docs/mercury-model/datamodel (1).pdf). Run on the MERCURY
-- database. The app calls them via POST /api/production/mercury/load with
-- (@loadId, @productType) — see docs/MERCURY_INTEGRATION.md.
--
-- Model references:
--   core_positions [cp]      : LoadId, BookingCenterId, LegalAccountNumber,
--                              TypeOf (Position_TypeOf: Cash|Account|Security|
--                              Contract|Commodity|…), SubType, CounterpartyId
--                              + CounterpartyPIT, GuarantorId + GuarantorPIT,
--                              SecurityId + SecurityPIT, BookAmount (reporting
--                              ccy), Currency, RatingClass
--   list_counterparties [lc] : Id + PointInTime, Name, TypeOf
--                              (Counterparty_TypeOf: Bank|CBank|CGov|Corp|IP…),
--                              EconomicActivityType, RatingClass, GroupLEXId
--                              (ultimate parent for LEX), GroupARISId
--   list_securities [ls]     : Id + PointInTime, ISIN, TypeOf (Security_TypeOf),
--                              RatingClass, RevaluationFrequency (char(1),
--                              'D' = daily), IssuerId + IssuerPIT,
--                              HQLACategory (computed in rules),
--                              LEXGuaranteedFlag
-- =============================================================================

-- 1) Counterparty datasets ----------------------------------------------------
-- Scope: balance sheet only, LEFT(LegalAccountNumber,1) IN ('1','2') = assets
-- & liabilities. Single counterparty resolution: the ISSUER of the security
-- (via list_securities) when TypeOf = 'Security', the position counterparty
-- otherwise — both matched on Id + PointInTime. One row per resolved
-- counterparty × dataset; the app's C1/C2 controls verify the treatment stays
-- identical period over period and across datasets.
CREATE OR ALTER FUNCTION dbo.fn_regreport_prod_counterparties
    (@loadId int, @productType varchar(20) = NULL)
RETURNS TABLE
AS RETURN
SELECT
    ds.Dataset,
    cpty.ResolvedId                          AS ClientNumber,   -- issuer for securities, counterparty otherwise
    -- "Type de client du datamodel": regulatory classification enum. If your
    -- internal client type lives in list_clients, join it here instead.
    lc.TypeOf                                AS ClientType,
    lc.GroupLEXId                            AS GroupLexId,
    -- Economic sector (NOGA/NACE). Swap with lc.TypeOf if you prefer the
    -- regulatory enum as "counterparty type".
    lc.EconomicActivityType                  AS CounterpartyType,
    CAST(lc.RatingClass AS varchar(10))      AS IssuerRating,
    SUM(cp.BookAmount) / 1000000.0           AS Amount,         -- reporting ccy → mn
    CASE WHEN COUNT(DISTINCT cp.Currency) = 1 THEN MIN(cp.Currency) END AS Currency
FROM core_positions cp
LEFT JOIN list_securities ls
  ON  ls.Id          = cp.SecurityId
  AND ls.PointInTime = cp.SecurityPIT
CROSS APPLY (SELECT
    CASE WHEN cp.TypeOf = 'Security' THEN ls.IssuerId  ELSE cp.CounterpartyId  END AS ResolvedId,
    -- Convention: the security's own PointInTime is used for the issuer
    -- lookup (ls.IssuerPIT is not reliably fed in our loads).
    CASE WHEN cp.TypeOf = 'Security' THEN ls.PointInTime ELSE cp.CounterpartyPIT END AS ResolvedPIT) cpty
LEFT JOIN list_counterparties lc
  ON  lc.Id          = cpty.ResolvedId
  AND lc.PointInTime = cpty.ResolvedPIT
CROSS APPLY (SELECT CASE
    -- Dataset mapping — ADJUST the subtypes/prefixes to your chart
    -- (LegalAccountNumber drives the CH reporting: 1xx assets, 2xx liabilities).
    WHEN cp.TypeOf IN ('Security', 'Cash')                       THEN 'liquidityAssets'
    WHEN lc.TypeOf IN ('Bank', 'CBank', 'SNB', 'CHSIB', 'GSIB', 'CGCB')
         AND LEFT(cp.LegalAccountNumber, 1) = '1'                THEN 'dueFromBanks'
    WHEN lc.TypeOf IN ('Bank', 'CBank', 'SNB', 'CHSIB', 'GSIB', 'CGCB')
         AND LEFT(cp.LegalAccountNumber, 1) = '2'                THEN 'dueToBanks'
    WHEN cp.SubType LIKE '%Mortgage%'                            THEN 'mortgages'
    WHEN LEFT(cp.LegalAccountNumber, 1) = '2'                    THEN 'dueToCustomers'
    ELSE 'dueFromCustomers' END AS Dataset) ds
WHERE cp.LoadId = @loadId
  AND LEFT(cp.LegalAccountNumber, 1) IN ('1', '2')   -- assets & liabilities only
  AND cpty.ResolvedId IS NOT NULL
  AND (@productType IS NULL OR cp.TypeOf = @productType)
GROUP BY ds.Dataset, cpty.ResolvedId, lc.TypeOf, lc.GroupLEXId,
         lc.EconomicActivityType, lc.RatingClass;
GO

-- 2) Securities vs security master -------------------------------------------
-- One row per ISIN for the load: C3 checks attribute drift (HQLA level change
-- = error) and C4 checks guarantor + HQLA level against the Grouplexid
-- reference (e.g. KFW → German government → L1).
CREATE OR ALTER FUNCTION dbo.fn_regreport_prod_securities
    (@loadId int, @productType varchar(20) = NULL)
RETURNS TABLE
AS RETURN
SELECT
    ls.ISIN                                  AS Isin,
    ls.Id                                    AS SecurityMaster,  -- unique security identifier
    ls.TypeOf                                AS SecurityType,    -- Security_TypeOf
    CAST(ls.RatingClass AS varchar(10))      AS Rating,
    CAST(CASE WHEN ls.RevaluationFrequency = 'D' THEN 1 ELSE 0 END AS bit) AS DailyReval,
    iss.GroupLEXId                           AS IssuerLexId,     -- issuer's ultimate parent
    g.GroupLEXId                             AS GuarantorLexId,  -- covered bonds / received guarantees
    g.Name                                   AS GuarantorName,
    ls.HQLACategory                          AS HqlaLevel,       -- as computed by the QDL rules
    SUM(cp.BookAmount) / 1000000.0           AS Amount
FROM core_positions cp
JOIN list_securities ls
  ON  ls.Id          = cp.SecurityId
  AND ls.PointInTime = cp.SecurityPIT
LEFT JOIN list_counterparties iss
  ON  iss.Id          = ls.IssuerId
  AND iss.PointInTime = ls.PointInTime  -- same convention: security PIT, IssuerPIT not reliably fed
LEFT JOIN list_counterparties g
  ON  g.Id          = cp.GuarantorId
  AND g.PointInTime = cp.GuarantorPIT
WHERE cp.LoadId = @loadId
  AND cp.TypeOf = 'Security'
  AND LEFT(cp.LegalAccountNumber, 1) IN ('1', '2')   -- assets & liabilities only
  AND ls.ISIN IS NOT NULL
  AND (@productType IS NULL OR ls.TypeOf = @productType)
GROUP BY ls.ISIN, ls.Id, ls.TypeOf, ls.RatingClass, ls.RevaluationFrequency,
         iss.GroupLEXId, g.GroupLEXId, g.Name, ls.HQLACategory;
GO
