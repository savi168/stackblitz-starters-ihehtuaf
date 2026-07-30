-- =============================================================================
-- MERCURY_MOCK — minimal local Quadrum-like database to test the production
-- controls end to end WITHOUT the real MERCURY. Run in SSMS on localhost,
-- then point the API at it:
--   "Mercury": "Server=localhost;Database=MERCURY_MOCK;Trusted_Connection=True;TrustServerCertificate=True"
--
-- Two loads: LoadId 1001 (period 2025-12-31, PIT 1) and 1002 (2026-01-31, PIT 2).
-- Deliberate anomalies — expected findings after feeding BOTH loads:
--   C1: CLI-NESTLE issuer rating 3→4 · CLI-PRIV1 grouplexid changes (warnings)
--   C2: in the Jan load, POS-LOAN4 still references CLI-NESTLE at PIT 1 while
--       the rest of the load is at PIT 2 → the same client carries two issuer
--       ratings in the same period (the classic mis-used PointInTime case)
--   C3: DE000KFW0001 HQLA level L1→L2a between the two periods (error)
--   C4: with the app reference LEX-KFW → German government → L1, the Jan
--       period shows HQLA "L2a" ≠ expected "L1" (error)
--   C5: position POS-ORPH points to counterparty CLI-GHOST, absent from
--       list_counterparties (error, both periods)
-- =============================================================================

IF DB_ID('MERCURY_MOCK') IS NULL CREATE DATABASE MERCURY_MOCK;
GO
USE MERCURY_MOCK;
GO

IF OBJECT_ID('core_positions') IS NOT NULL DROP TABLE core_positions;
IF OBJECT_ID('list_counterparties') IS NOT NULL DROP TABLE list_counterparties;
IF OBJECT_ID('list_securities') IS NOT NULL DROP TABLE list_securities;
GO

CREATE TABLE list_counterparties (
    Id varchar(150) NOT NULL, PointInTime int NOT NULL,
    Name varchar(100), TypeOf varchar(20), EconomicActivityType varchar(20),
    RatingClass int, GroupLEXId varchar(150),
    PRIMARY KEY (Id, PointInTime)
);
CREATE TABLE list_securities (
    Id varchar(150) NOT NULL, PointInTime int NOT NULL,
    Name varchar(100), ISIN varchar(20), TypeOf varchar(10),
    RatingClass int, RevaluationFrequency char(1),
    IssuerId varchar(100), IssuerPIT int, HQLACategory varchar(20),
    PRIMARY KEY (Id, PointInTime)
);
CREATE TABLE core_positions (
    Id varchar(100) NOT NULL, LoadId int NOT NULL,
    LegalAccountNumber varchar(20), TypeOf varchar(20), SubType varchar(20),
    BookAmount decimal(18,2), Currency char(3),
    CounterpartyId varchar(100), CounterpartyPIT int,
    GuarantorId varchar(100), GuarantorPIT int,
    SecurityId varchar(100), SecurityPIT int,
    PRIMARY KEY (Id, LoadId)
);
GO

-- Counterparties: PIT 1 (Dec) and PIT 2 (Jan) --------------------------------
INSERT INTO list_counterparties (Id, PointInTime, Name, TypeOf, EconomicActivityType, RatingClass, GroupLEXId) VALUES
-- PIT 1
('CLI-KFW',    1, 'KFW',                'Bank', '641001', 1, 'LEX-KFW'),
('CLI-DEGOV',  1, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV'),
('CLI-UBS',    1, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS'),
('CLI-NESTLE', 1, 'Nestle SA',          'Corp', '107300', 3, 'LEX-NESTLE'),
('CLI-PRIV1',  1, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1'),
('CLI-EFGSUB', 1, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG'),
('CLI-EFGFIN', 1, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG'),   -- C2: same LEX group, other sector
-- PIT 2 (Jan) — with deliberate drifts
('CLI-KFW',    2, 'KFW',                'Bank', '641001', 1, 'LEX-KFW'),
('CLI-DEGOV',  2, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV'),
('CLI-UBS',    2, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS'),
('CLI-NESTLE', 2, 'Nestle SA',          'Corp', '107300', 4, 'LEX-NESTLE'), -- C1: rating 3 → 4
('CLI-PRIV1',  2, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1B'), -- C1: grouplexid change
('CLI-EFGSUB', 2, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG'),
('CLI-EFGFIN', 2, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG');

-- Securities ------------------------------------------------------------------
INSERT INTO list_securities (Id, PointInTime, Name, ISIN, TypeOf, RatingClass, RevaluationFrequency, IssuerId, IssuerPIT, HQLACategory) VALUES
('SEC-KFW1',  1, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   1, 'D', 'CLI-KFW',    1, 'L1'),
('SEC-ROCHE', 1, 'Roche Holding',  'CH0012032048', 'Equity', 3, 'D', 'CLI-NESTLE', 1, 'L2b'),
('SEC-KFW1',  2, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   1, 'D', 'CLI-KFW',    2, 'L2a'),  -- C3/C4: L1 → L2a
('SEC-ROCHE', 2, 'Roche Holding',  'CH0012032048', 'Equity', 3, 'D', 'CLI-NESTLE', 2, 'L2b');

-- Positions: LoadId 1001 (Dec, PIT 1) ----------------------------------------
INSERT INTO core_positions (Id, LoadId, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1001, '106001', 'Security', NULL,       54200000, 'EUR', NULL,         NULL, 'CLI-DEGOV', 1, 'SEC-KFW1',  1),
('POS-SEC2',  1001, '106001', 'Security', NULL,       12700000, 'CHF', NULL,         NULL, NULL,        NULL, 'SEC-ROCHE', 1),
('POS-DFB1',  1001, '103001', 'Account',  NULL,       85000000, 'CHF', 'CLI-UBS',    1,    NULL, NULL, NULL, NULL),
('POS-DTB1',  1001, '201001', 'Account',  NULL,       40000000, 'CHF', 'CLI-UBS',    1,    NULL, NULL, NULL, NULL),
('POS-LOAN1', 1001, '104001', 'Contract', NULL,       30000000, 'CHF', 'CLI-NESTLE', 1,    NULL, NULL, NULL, NULL),
('POS-LOAN2', 1001, '104002', 'Contract', NULL,       12000000, 'CHF', 'CLI-EFGSUB', 1,    NULL, NULL, NULL, NULL),
('POS-LOAN3', 1001, '104003', 'Contract', NULL,        8000000, 'CHF', 'CLI-EFGFIN', 1,    NULL, NULL, NULL, NULL),
('POS-MORT1', 1001, '105001', 'Contract', 'Mortgage', 15000000, 'CHF', 'CLI-PRIV1',  1,    NULL, NULL, NULL, NULL),
('POS-DEP1',  1001, '202001', 'Account',  NULL,       22000000, 'CHF', 'CLI-PRIV1',  1,    NULL, NULL, NULL, NULL),
('POS-ORPH',  1001, '104009', 'Contract', NULL,        5000000, 'USD', 'CLI-GHOST',  1,    NULL, NULL, NULL, NULL); -- C5

-- Positions: LoadId 1002 (Jan, PIT 2) ----------------------------------------
INSERT INTO core_positions (Id, LoadId, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1002, '106001', 'Security', NULL,       55100000, 'EUR', NULL,         NULL, 'CLI-DEGOV', 2, 'SEC-KFW1',  2),
('POS-SEC2',  1002, '106001', 'Security', NULL,       13100000, 'CHF', NULL,         NULL, NULL,        NULL, 'SEC-ROCHE', 2),
('POS-DFB1',  1002, '103001', 'Account',  NULL,       90000000, 'CHF', 'CLI-UBS',    2,    NULL, NULL, NULL, NULL),
('POS-DTB1',  1002, '201001', 'Account',  NULL,       41000000, 'CHF', 'CLI-UBS',    2,    NULL, NULL, NULL, NULL),
('POS-LOAN1', 1002, '104001', 'Contract', NULL,       31000000, 'CHF', 'CLI-NESTLE', 2,    NULL, NULL, NULL, NULL),
('POS-LOAN2', 1002, '104002', 'Contract', NULL,       12500000, 'CHF', 'CLI-EFGSUB', 2,    NULL, NULL, NULL, NULL),
('POS-LOAN3', 1002, '104003', 'Contract', NULL,        8100000, 'CHF', 'CLI-EFGFIN', 2,    NULL, NULL, NULL, NULL),
('POS-MORT1', 1002, '105001', 'Contract', 'Mortgage', 14900000, 'CHF', 'CLI-PRIV1',  2,    NULL, NULL, NULL, NULL),
('POS-DEP1',  1002, '202001', 'Account',  NULL,       21500000, 'CHF', 'CLI-PRIV1',  2,    NULL, NULL, NULL, NULL),
('POS-ORPH',  1002, '104009', 'Contract', NULL,        5100000, 'USD', 'CLI-GHOST',  2,    NULL, NULL, NULL, NULL), -- C5
('POS-LOAN4', 1002, '104004', 'Contract', NULL,        2000000, 'CHF', 'CLI-NESTLE', 1,    NULL, NULL, NULL, NULL); -- C2: stale PIT 1 in a PIT 2 load
GO

-- Now create the two TVFs in THIS database: open docs/SQL_MERCURY_TVFS.sql,
-- make sure the connection is on MERCURY_MOCK, and execute it.

-- core_loads: links each loadid to its reporting date (the app resolves the
-- period automatically when the date field is left blank).
IF OBJECT_ID('core_loads') IS NOT NULL DROP TABLE core_loads;
CREATE TABLE core_loads (LoadId int PRIMARY KEY, ReportingDate date NOT NULL);
INSERT INTO core_loads (LoadId, ReportingDate) VALUES (1001, '2025-12-31'), (1002, '2026-01-31');
GO
