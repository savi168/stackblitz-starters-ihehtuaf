-- =============================================================================
-- MERCURY_MOCK — minimal local Quadrum-like database to test the production
-- controls end to end WITHOUT the real MERCURY. Run in SSMS on localhost,
-- then point the API at it:
--   "Mercury": "Server=localhost;Database=MERCURY_MOCK;Trusted_Connection=True;TrustServerCertificate=True"
--
-- Two loads: LoadId 1001 (period 2025-12-31) and 1002 (2026-01-31).
-- Convention respected everywhere: PointInTime = LoadId (as in the real MERCURY),
-- so the correction scripts (PointInTime IN (SELECT LoadId FROM core_loads …)) work.
-- Deliberate anomalies — expected findings after feeding BOTH loads:
--   C1: CLI-NESTLE issuer rating 3→4 · CLI-PRIV1 grouplexid changes (warnings)
--   C2: in load 1002, POS-LOAN4 still references CLI-NESTLE at PIT 1001 while
--       the rest of the load is at PIT 1002 → the same client carries two issuer
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
IF OBJECT_ID('list_reporting_entities') IS NOT NULL DROP TABLE list_reporting_entities;
IF OBJECT_ID('list_reporting_sets') IS NOT NULL DROP TABLE list_reporting_sets;
IF OBJECT_ID('list_booking_centers') IS NOT NULL DROP TABLE list_booking_centers;
IF OBJECT_ID('core_load_collections') IS NOT NULL DROP TABLE core_load_collections;
IF OBJECT_ID('core_loads_loads_collection') IS NOT NULL DROP TABLE core_loads_loads_collection;
GO

CREATE TABLE list_counterparties (
    Id varchar(150) NOT NULL, PointInTime int NOT NULL,
    Name varchar(100), TypeOf varchar(20), EconomicActivityType varchar(20),
    RatingClass int, GroupLEXId varchar(150),
    -- optional fields so the app's INSERT generator works against the mock:
    LEI varchar(20) NULL, DomicileCountry char(2) NULL, HQDomicile char(2) NULL,
    ExternalRatingId varchar(20) NULL, ExternalRatingPIT int NULL,
    GroupARISId varchar(150) NULL, SMEFlag bit NULL,
    EstablishedRelationshipFlag bit NULL, CreditQuality char(2) NULL,
    Nationality char(2) NULL,
    PRIMARY KEY (Id, PointInTime)
);
CREATE TABLE list_securities (
    Id varchar(150) NOT NULL, PointInTime int NOT NULL,
    Name varchar(100), ISIN varchar(20), TypeOf varchar(10),
    RatingClass int, RevaluationFrequency char(1),
    IssuerId varchar(100), IssuerPIT int, HQLACategory varchar(20),
    -- optional fields so the app's INSERT generator works against the mock:
    ListedType varchar(20) NULL, Currency char(3) NULL, IndexFlag bit NULL,
    MainIndexFlag bit NULL, SNBEligibleFlag bit NULL, CMAApproachType varchar(20) NULL,
    ExternalRatingId varchar(20) NULL, ExternalRatingPIT int NULL,
    MaturityDate date NULL, SubType varchar(10) NULL, LEXGuaranteedFlag bit NULL,
    PRIMARY KEY (Id, PointInTime)
);
CREATE TABLE core_positions (
    Id varchar(100) NOT NULL, LoadId int NOT NULL,
    LegalAccountNumber varchar(20), TypeOf varchar(20), SubType varchar(20),
    BookAmount decimal(18,2), Currency char(3),
    CounterpartyId varchar(100), CounterpartyPIT int,
    GuarantorId varchar(100), GuarantorPIT int,
    SecurityId varchar(100), SecurityPIT int,
    -- Columns used by the Adjustments matching (LIKE on the accounting REFERENCE/CLIENT)
    PositionCurrencyBookAmount decimal(18,2) NULL,
    InternalReference1 varchar(100) NULL, ContractId varchar(100) NULL,
    BookingCenterId varchar(100) NULL, LocationCountry varchar(5) NULL,
    DataSource varchar(50) NULL,
    CounterpartyBookingCenterId varchar(100) NULL,   -- interco company (conso eliminations)
    PRIMARY KEY (Id, LoadId)
);

-- Consolidation referential (scope-aware impact preview) ----------------------
CREATE TABLE list_reporting_entities (
    Id varchar(100) NOT NULL PRIMARY KEY, CreationDate date NULL,
    Name varchar(100) NULL, SNBCode varchar(20) NULL, FinmaCategory int NULL,
    ConsoLevelBankOffice bit NULL, ConsoLevelParentCompany bit NULL, ConsoLevelGroup bit NULL
);
CREATE TABLE list_reporting_sets (
    ReportingEntityId varchar(100) NOT NULL,
    ConsolidatedBookingCenterId varchar(100) NOT NULL,
    CreationDate date NULL, OfficeType varchar(20) NULL, OfficeCountry char(2) NULL
);
CREATE TABLE list_booking_centers (
    Id varchar(100) NOT NULL PRIMARY KEY, CreationDate date NULL,
    Name varchar(100) NULL, OfficeType varchar(20) NULL,
    OfficeCountry char(2) NULL, OfficeCanton char(2) NULL, OwnerId varchar(100) NULL
);
GO

-- Counterparties: PIT 1001 (Dec) and PIT 1002 (Jan) --------------------------
INSERT INTO list_counterparties (Id, PointInTime, Name, TypeOf, EconomicActivityType, RatingClass, GroupLEXId) VALUES
-- PIT 1
('CLI-KFW',    1001, 'KFW',                'Bank', '641001', 1, 'LEX-KFW'),
('CLI-DEGOV',  1001, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV'),
('CLI-UBS',    1001, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS'),
('CLI-NESTLE', 1001, 'Nestle SA',          'Corp', '107300', 3, 'LEX-NESTLE'),
('CLI-PRIV1',  1001, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1'),
('CLI-EFGSUB', 1001, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG'),
('CLI-EFGFIN', 1001, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG'),   -- C2: same LEX group, other sector
('CLI-595021', 1001, 'Bank, Luxembourg',   'Bank', '641001', 2, 'LEX-BLUX'),  -- Adjustments test (CLIENT 595021)
('CLI-590017', 1001, 'Bank AG, Frankfurt', 'Bank', '641001', 2, 'LEX-BFRA'),  -- Adjustments test (CLIENT 590017)
-- PIT 2 (Jan) — with deliberate drifts
('CLI-KFW',    1002, 'KFW',                'Bank', '641001', 1, 'LEX-KFW'),
('CLI-DEGOV',  1002, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV'),
('CLI-UBS',    1002, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS'),
('CLI-NESTLE', 1002, 'Nestle SA',          'Corp', '107300', 4, 'LEX-NESTLE'), -- C1: rating 3 → 4
('CLI-PRIV1',  1002, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1B'), -- C1: grouplexid change
('CLI-EFGSUB', 1002, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG'),
('CLI-EFGFIN', 1002, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG'),
('CLI-595021', 1002, 'Bank, Luxembourg',   'Bank', '641001', 2, 'LEX-BLUX'),
('CLI-590017', 1002, 'Bank AG, Frankfurt', 'Bank', '641001', 2, 'LEX-BFRA');

-- Securities ------------------------------------------------------------------
INSERT INTO list_securities (Id, PointInTime, Name, ISIN, TypeOf, RatingClass, RevaluationFrequency, IssuerId, IssuerPIT, HQLACategory) VALUES
('SEC-KFW1',  1001, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   1, 'D', 'CLI-KFW',    1001, 'L1'),
('SEC-ROCHE', 1001, 'Roche Holding',  'CH0012032048', 'Equity', 3, 'D', 'CLI-NESTLE', 1001, 'L2b'),
('SEC-KFW1',  1002, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   1, 'D', 'CLI-KFW',    1002, 'L2a'),  -- C3/C4: L1 → L2a
('SEC-ROCHE', 1002, 'Roche Holding',  'CH0012032048', 'Equity', 3, 'D', 'CLI-NESTLE', 1002, 'L2b');

-- Positions: LoadId 1001 (Dec, PIT 1001) --------------------------------------
INSERT INTO core_positions (Id, LoadId, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1001, '106001', 'Security', NULL,       54200000, 'EUR', NULL,         NULL, 'CLI-DEGOV', 1001, 'SEC-KFW1',  1001),
('POS-SEC2',  1001, '106001', 'Security', NULL,       12700000, 'CHF', NULL,         NULL, NULL,        NULL, 'SEC-ROCHE', 1001),
('POS-DFB1',  1001, '103001', 'Account',  NULL,       85000000, 'CHF', 'CLI-UBS',    1001,    NULL, NULL, NULL, NULL),
('POS-DTB1',  1001, '201001', 'Account',  NULL,       40000000, 'CHF', 'CLI-UBS',    1001,    NULL, NULL, NULL, NULL),
('POS-LOAN1', 1001, '104001', 'Contract', NULL,       30000000, 'CHF', 'CLI-NESTLE', 1001,    NULL, NULL, NULL, NULL),
('POS-LOAN2', 1001, '104002', 'Contract', NULL,       12000000, 'CHF', 'CLI-EFGSUB', 1001,    NULL, NULL, NULL, NULL),
('POS-LOAN3', 1001, '104003', 'Contract', NULL,        8000000, 'CHF', 'CLI-EFGFIN', 1001,    NULL, NULL, NULL, NULL),
('POS-MORT1', 1001, '105001', 'Contract', 'Mortgage', 15000000, 'CHF', 'CLI-PRIV1',  1001,    NULL, NULL, NULL, NULL),
('POS-DEP1',  1001, '202001', 'Account',  NULL,       22000000, 'CHF', 'CLI-PRIV1',  1001,    NULL, NULL, NULL, NULL),
('POS-ORPH',  1001, '104009', 'Contract', NULL,        5000000, 'USD', 'CLI-GHOST',  1001,    NULL, NULL, NULL, NULL); -- C5

-- Positions: LoadId 1002 (Jan, PIT 1002) --------------------------------------
INSERT INTO core_positions (Id, LoadId, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1002, '106001', 'Security', NULL,       55100000, 'EUR', NULL,         NULL, 'CLI-DEGOV', 1002, 'SEC-KFW1',  1002),
('POS-SEC2',  1002, '106001', 'Security', NULL,       13100000, 'CHF', NULL,         NULL, NULL,        NULL, 'SEC-ROCHE', 1002),
('POS-DFB1',  1002, '103001', 'Account',  NULL,       90000000, 'CHF', 'CLI-UBS',    1002,    NULL, NULL, NULL, NULL),
('POS-DTB1',  1002, '201001', 'Account',  NULL,       41000000, 'CHF', 'CLI-UBS',    1002,    NULL, NULL, NULL, NULL),
('POS-LOAN1', 1002, '104001', 'Contract', NULL,       31000000, 'CHF', 'CLI-NESTLE', 1002,    NULL, NULL, NULL, NULL),
('POS-LOAN2', 1002, '104002', 'Contract', NULL,       12500000, 'CHF', 'CLI-EFGSUB', 1002,    NULL, NULL, NULL, NULL),
('POS-LOAN3', 1002, '104003', 'Contract', NULL,        8100000, 'CHF', 'CLI-EFGFIN', 1002,    NULL, NULL, NULL, NULL),
('POS-MORT1', 1002, '105001', 'Contract', 'Mortgage', 14900000, 'CHF', 'CLI-PRIV1',  1002,    NULL, NULL, NULL, NULL),
('POS-DEP1',  1002, '202001', 'Account',  NULL,       21500000, 'CHF', 'CLI-PRIV1',  1002,    NULL, NULL, NULL, NULL),
('POS-ORPH',  1002, '104009', 'Contract', NULL,        5100000, 'USD', 'CLI-GHOST',  1002,    NULL, NULL, NULL, NULL), -- C5
('POS-LOAN4', 1002, '104004', 'Contract', NULL,        2000000, 'CHF', 'CLI-NESTLE', 1001,    NULL, NULL, NULL, NULL); -- C2: stale PIT 1001 in a 1002 load

-- Adjustments matching test rows (load 1002) ----------------------------------
-- Sample file: LIGNE 155 (REFERENCE 5950216318, CLIENT 595021) matches TWO
-- positions — only POS-ADJ-A carries the GL-mapping account 102001 (✓GL);
-- LIGNE 2060 (REFERENCE 5900175308, CLIENT 590017) matches via ContractId.
-- POS-ADJ-C faces BC-ZH (interco): eliminated at MOCK-GROUP level, kept solo.
INSERT INTO core_positions (Id, LoadId, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, InternalReference1, ContractId, PositionCurrencyBookAmount, DataSource, BookingCenterId, CounterpartyBookingCenterId) VALUES
('POS-ADJ-A', 1002, '102001', 'Account',  NULL,   750000, 'EUR', 'CLI-595021', 1002, '5950216318', NULL,         800000, 'CORE', 'BC-GVA', NULL),
('POS-ADJ-B', 1002, '104001', 'Contract', NULL,   500000, 'EUR', 'CLI-595021', 1002, '5950216318', NULL,         535000, 'CORE', 'BC-ZH',  NULL),
('POS-ADJ-C', 1002, '201001', 'Account',  NULL,  -750000, 'EUR', 'CLI-590017', 1002, NULL,         '5900175308', -800000, 'CORE', 'BC-GVA', 'BC-ZH');
GO

-- Consolidation referential ---------------------------------------------------
-- MOCK-SOLO = BC-GVA alone (bank office level); MOCK-GROUP = BC-GVA + BC-ZH
-- (group level) — at group level the BC-GVA↔BC-ZH interco is eliminated.
INSERT INTO list_booking_centers (Id, Name, OfficeType, OfficeCountry, OfficeCanton, OwnerId) VALUES
('BC-GVA', 'Mock Bank Geneva',        'HeadOffice', 'CH', 'GE', NULL),
('BC-ZH',  'Mock Bank Zurich Branch', 'Branch',     'CH', 'ZH', 'BC-GVA');
INSERT INTO list_reporting_entities (Id, Name, ConsoLevelBankOffice, ConsoLevelParentCompany, ConsoLevelGroup) VALUES
('MOCK-SOLO',  'Mock Bank solo',  1, 1, 0),
('MOCK-GROUP', 'Mock Bank group', 0, 0, 1);
INSERT INTO list_reporting_sets (ReportingEntityId, ConsolidatedBookingCenterId, OfficeType, OfficeCountry) VALUES
('MOCK-SOLO',  'BC-GVA', 'HeadOffice', 'CH'),
('MOCK-GROUP', 'BC-GVA', 'HeadOffice', 'CH'),
('MOCK-GROUP', 'BC-ZH',  'Branch',     'CH');
GO

-- Load collections: the adjustments unit of work — a collection carries the
-- reporting entity (consolidation level) and groups its loads.
CREATE TABLE core_load_collections (
    CreateDate date NULL, ReportingDate date NOT NULL, Name varchar(50) NOT NULL,
    ReportingEntityId varchar(100) NULL, IsVisible bit NOT NULL DEFAULT 1,
    Calculations nvarchar(max) NULL, IsArchived bit NOT NULL DEFAULT 0,
    SimulationFromLoadCollectionId int NULL, LoadCollectionId int NOT NULL PRIMARY KEY,
    IsMaster bit NOT NULL DEFAULT 0
);
CREATE TABLE core_loads_loads_collection (
    LoadCollectionsLoadCollectionId int NOT NULL,
    LoadsLoadId int NOT NULL,
    PRIMARY KEY (LoadCollectionsLoadCollectionId, LoadsLoadId)
);
INSERT INTO core_load_collections (LoadCollectionId, ReportingDate, Name, ReportingEntityId, IsVisible, IsArchived, IsMaster) VALUES
(501, '2025-12-31', 'DEC-25 GROUP monthly', 'MOCK-GROUP', 1, 0, 1),
(502, '2026-01-31', 'JAN-26 GROUP monthly', 'MOCK-GROUP', 1, 0, 1),
(503, '2026-01-31', 'JAN-26 SOLO',          'MOCK-SOLO',  1, 0, 0);
INSERT INTO core_loads_loads_collection (LoadCollectionsLoadCollectionId, LoadsLoadId) VALUES
(501, 1001),
(502, 1002),
(503, 1002);
GO

-- Now create the two TVFs in THIS database: open docs/SQL_MERCURY_TVFS.sql,
-- make sure the connection is on MERCURY_MOCK, and execute it.

-- core_loads: links each loadid to its reporting date (the app resolves the
-- period automatically when the date field is left blank).
IF OBJECT_ID('core_loads') IS NOT NULL DROP TABLE core_loads;
CREATE TABLE core_loads (
    LoadId int PRIMARY KEY, ReportingDate date NOT NULL,
    CreationDate date NOT NULL DEFAULT GETDATE(), Name varchar(50) NOT NULL DEFAULT '',
    LastUpdate datetime2 NOT NULL DEFAULT SYSDATETIME(), IsVisible bit NOT NULL DEFAULT 1);
INSERT INTO core_loads (LoadId, ReportingDate, Name) VALUES
    (1001, '2025-12-31', 'DEC-25 monthly'), (1002, '2026-01-31', 'JAN-26 monthly');
GO
