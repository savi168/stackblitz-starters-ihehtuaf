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
-- Scope: banking-book accounts only, LEFT(LegalAccountNumber,3) IN
-- (101…111, 201…209). Counterparty resolution: the ISSUER of the security
-- (via list_securities, matched on the security's PointInTime) when
-- TypeOf = 'Security', the position counterparty otherwise.
--
-- Main block is driven FROM list_counterparties (clean world, one row per
-- counterparty × dataset). Positions whose resolved counterparty is NOT found
-- at the PIT are returned too, with empty ClientType/GroupLexId — the app
-- flags them as control C5 "orphan positions".
CREATE OR ALTER FUNCTION dbo.fn_regreport_prod_counterparties
    (@loadId int, @productType varchar(20) = NULL)
RETURNS TABLE
AS RETURN
WITH pos AS (
    SELECT cp.Id, cp.LegalAccountNumber, cp.TypeOf, cp.SubType,
           cp.BookAmount, cp.Currency,
           CASE WHEN cp.TypeOf = 'Security' THEN ls.IssuerId    ELSE cp.CounterpartyId  END AS ResolvedId,
           -- security's own PointInTime (IssuerPIT is not reliably fed)
           CASE WHEN cp.TypeOf = 'Security' THEN ls.PointInTime ELSE cp.CounterpartyPIT END AS ResolvedPIT
    FROM core_positions cp
    LEFT JOIN list_securities ls
      ON  ls.Id          = cp.SecurityId
      AND ls.PointInTime = cp.SecurityPIT
    WHERE cp.LoadId = @loadId
      AND LEFT(CAST(cp.LegalAccountNumber AS varchar(20)), 3) IN
          ('101','102','103','104','105','106','110','111',
           '201','202','203','204','206','207','208','209')
      AND (@productType IS NULL OR cp.TypeOf = @productType)
)
-- Clean world: driven from list_counterparties.
SELECT
    ds.Dataset,
    lc.Id                                    AS ClientNumber,
    lc.TypeOf                                AS ClientType,        -- regulatory enum (data model)
    lc.GroupLEXId                            AS GroupLexId,        -- ultimate parent
    lc.EconomicActivityType                  AS CounterpartyType,  -- NOGA/NACE sector
    CAST(lc.RatingClass AS varchar(10))      AS IssuerRating,
    SUM(p.BookAmount) / 1000000.0            AS Amount,            -- reporting ccy → mn
    CASE WHEN COUNT(DISTINCT p.Currency) = 1 THEN MIN(p.Currency) END AS Currency
FROM list_counterparties lc
JOIN pos p
  ON  p.ResolvedId  = lc.Id
  AND p.ResolvedPIT = lc.PointInTime
CROSS APPLY (SELECT CASE
    WHEN p.TypeOf IN ('Security', 'Cash')                        THEN 'liquidityAssets'
    WHEN lc.TypeOf IN ('Bank', 'CBank', 'SNB', 'CHSIB', 'GSIB', 'CGCB')
         AND LEFT(CAST(p.LegalAccountNumber AS varchar(20)), 1) = '1'                 THEN 'dueFromBanks'
    WHEN lc.TypeOf IN ('Bank', 'CBank', 'SNB', 'CHSIB', 'GSIB', 'CGCB')
         AND LEFT(CAST(p.LegalAccountNumber AS varchar(20)), 1) = '2'                 THEN 'dueToBanks'
    WHEN p.SubType LIKE '%Mortgage%'                             THEN 'mortgages'
    WHEN LEFT(CAST(p.LegalAccountNumber AS varchar(20)), 1) = '2'                     THEN 'dueToCustomers'
    ELSE 'dueFromCustomers' END AS Dataset) ds
GROUP BY ds.Dataset, lc.Id, lc.TypeOf, lc.GroupLEXId,
         lc.EconomicActivityType, lc.RatingClass

UNION ALL

-- Orphan positions: no counterparty found at the PIT (or no id at all).
-- Empty ClientType/GroupLexId → flagged by the app as C5 errors.
SELECT
    CASE
        WHEN p.TypeOf IN ('Security', 'Cash')    THEN 'liquidityAssets'
        WHEN p.SubType LIKE '%Mortgage%'         THEN 'mortgages'
        WHEN LEFT(CAST(p.LegalAccountNumber AS varchar(20)), 1) = '2' THEN 'dueToCustomers'
        ELSE 'dueFromCustomers'
    END                                      AS Dataset,
    COALESCE(p.ResolvedId, CONCAT('POS:', p.Id)) AS ClientNumber,
    ''                                       AS ClientType,
    ''                                       AS GroupLexId,
    ''                                       AS CounterpartyType,
    CAST(NULL AS varchar(10))                AS IssuerRating,
    SUM(p.BookAmount) / 1000000.0            AS Amount,
    CASE WHEN COUNT(DISTINCT p.Currency) = 1 THEN MIN(p.Currency) END AS Currency
FROM pos p
LEFT JOIN list_counterparties lc
  ON  lc.Id          = p.ResolvedId
  AND lc.PointInTime = p.ResolvedPIT
WHERE lc.Id IS NULL
GROUP BY
    CASE
        WHEN p.TypeOf IN ('Security', 'Cash')    THEN 'liquidityAssets'
        WHEN p.SubType LIKE '%Mortgage%'         THEN 'mortgages'
        WHEN LEFT(CAST(p.LegalAccountNumber AS varchar(20)), 1) = '2' THEN 'dueToCustomers'
        ELSE 'dueFromCustomers'
    END,
    COALESCE(p.ResolvedId, CONCAT('POS:', p.Id));
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
  AND LEFT(CAST(cp.LegalAccountNumber AS varchar(20)), 3) IN
      ('101','102','103','104','105','106','110','111',
       '201','202','203','204','206','207','208','209')  -- banking-book scope
  AND ls.ISIN IS NOT NULL
  AND (@productType IS NULL OR ls.TypeOf = @productType)
GROUP BY ls.ISIN, ls.Id, ls.TypeOf, ls.RatingClass, ls.RevaluationFrequency,
         iss.GroupLEXId, g.GroupLEXId, g.Name, ls.HQLACategory;
GO
