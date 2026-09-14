-- =============================================================================
-- MERCURY_MOCK — local Quadrum-like database to test the production controls
-- end to end WITHOUT the real MERCURY. Run in SSMS on localhost, then point
-- the API at it:
--   "Mercury": "Server=localhost;Database=MERCURY_MOCK;Trusted_Connection=True;TrustServerCertificate=True"
--
-- SCHEMA = THE REAL ARCHITECTURE. The CREATE TABLEs below are generated from
-- the production DDL extract (v3.6): same columns, same types, same
-- nullability. Two mock-only conveniences, clearly assumed:
--   * every NOT NULL column carries a DEFAULT ('' / 0 / 1900-01-01) so the
--     seed inserts and the app's one-shot adjustment scripts can name only
--     the columns they care about;
--   * primary keys are declared for the natural keys (the production extract
--     does not include constraint definitions).
--
-- Two loads: LoadId 1001 (period 2025-12-31) and 1002 (2026-01-31).
-- Convention respected everywhere: PointInTime = LoadId (as in the real MERCURY).
-- Deliberate anomalies — expected findings after feeding BOTH loads:
--   C1: CLI-NESTLE rating 3→4 + external rating A→BBB · CLI-PRIV1 grouplexid
--       AND domicile CH→FR change (warnings, full-field drift)
--   C2: in load 1002, POS-LOAN4 still references CLI-NESTLE at PIT 1001 while
--       the rest of the load is at PIT 1002 → the same client carries two
--       ratings in the same period (the classic mis-used PointInTime case)
--   C3: DE000KFW0001 HQLA level L1→L2a AND SNBEligibleFlag 1→0 (errors)
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
IF OBJECT_ID('core_loads') IS NOT NULL DROP TABLE core_loads;
GO

CREATE TABLE core_positions (
    [Id] varchar(100) NOT NULL,
    [LoadId] int NOT NULL,
    [BookingCenterId] varchar(100) NOT NULL DEFAULT '',
    [LegalAccountNumber] int NOT NULL DEFAULT 0,
    [Currency] char(3) NOT NULL DEFAULT '',
    [LocationCountry] char(2) NOT NULL DEFAULT '',
    [InternalReference1] varchar(255) NOT NULL DEFAULT '',
    [InternalReference2] varchar(150) NOT NULL DEFAULT '',
    [InternalReference3] varchar(255) NOT NULL DEFAULT '',
    [InternalReference4] varchar(255) NOT NULL DEFAULT '',
    [InternalReference5] varchar(150) NOT NULL DEFAULT '',
    [DataSource] varchar(100) NOT NULL DEFAULT '',
    [PositionCurrencyBookAmount] decimal(25,4) NOT NULL DEFAULT 0,
    [BookAmount] decimal(25,4) NOT NULL DEFAULT 0,
    [EncumberedFlag] bit NOT NULL DEFAULT 0,
    [EncumberedAmount] decimal(25,4) NOT NULL DEFAULT 0,
    [EncumbranceEndDate] date NOT NULL DEFAULT '1900-01-01',
    [Notional] decimal(25,4) NOT NULL DEFAULT 0,
    [InternalLendingValue] decimal(25,4) NOT NULL DEFAULT 0,
    [PV] decimal(25,4) NOT NULL DEFAULT 0,
    [Provision] decimal(25,4) NOT NULL DEFAULT 0,
    [Capacity] varchar(20) NOT NULL DEFAULT '',
    [MaturityDate] date NOT NULL DEFAULT '1900-01-01',
    [MaturityType] varchar(20) NOT NULL DEFAULT '',
    [ImpairedFlag] bit NOT NULL DEFAULT 0,
    [NonPerformingFlag] bit NOT NULL DEFAULT 0,
    [RatingClass] int NOT NULL DEFAULT 0,
    [IRBFlag] bit NOT NULL DEFAULT 0,
    [RelatedPartyType] varchar(20) NOT NULL DEFAULT '',
    [Subordination] bit NOT NULL DEFAULT 0,
    [PriorityClaimLevel] int NOT NULL DEFAULT 0,
    [ParticipationLevel] real NOT NULL DEFAULT 0,
    [GoodsXBorderFlag] bit NOT NULL DEFAULT 0,
    [PledgeLink] varchar(150) NOT NULL DEFAULT '',
    [StartDate] date NOT NULL DEFAULT '1900-01-01',
    [GeneralLedger] varchar(20) NOT NULL DEFAULT '',
    [TradingBookFlag] bit NOT NULL DEFAULT 0,
    [NumberOfComponents] int NOT NULL DEFAULT 0,
    [LongContractFlag] bit NOT NULL DEFAULT 0,
    [NettingSetId] varchar(150) NOT NULL DEFAULT '',
    [NettingAgreementType] varchar(20) NOT NULL DEFAULT '',
    [CounterpartyId] varchar(150) NOT NULL DEFAULT '',
    [CounterpartyPIT] int NULL,
    [CounterpartyBookingCenterId] varchar(100) NOT NULL DEFAULT '',
    [MarginAgreementId] varchar(100) NOT NULL DEFAULT '',
    [MarginAgreementPIT] int NULL,
    [ClearingFacilityTypeOf] varchar(20) NOT NULL DEFAULT '',
    [ClearingFacilityId] varchar(100) NOT NULL DEFAULT '',
    [ClearingFacilityPIT] int NULL,
    [PledgedFlag] bit NOT NULL DEFAULT 0,
    [PledgeEndDate] date NOT NULL DEFAULT '1900-01-01',
    [CollateralHolderId] varchar(100) NOT NULL DEFAULT '',
    [CollateralHolderPIT] int NULL,
    [ContractId] varchar(150) NOT NULL DEFAULT '',
    [PropertyId] varchar(100) NOT NULL DEFAULT '',
    [PropertyPIT] int NULL,
    [Account] varchar(100) NOT NULL DEFAULT '',
    [DerivativeId] varchar(100) NOT NULL DEFAULT '',
    [DerivativeSwapId] varchar(100) NOT NULL DEFAULT '',
    [SecurityId] varchar(100) NOT NULL DEFAULT '',
    [SecurityPIT] int NULL,
    [CommodityId] varchar(100) NOT NULL DEFAULT '',
    [CommodityPIT] int NULL,
    [IRReference] varchar(100) NOT NULL DEFAULT '',
    [IRSpread] real NOT NULL DEFAULT 0,
    [InterestRate] real NOT NULL DEFAULT 0,
    [IRTypeOf] varchar(20) NOT NULL DEFAULT '',
    [IRNextFixingDate] date NOT NULL DEFAULT '1900-01-01',
    [IRReFixingFrequency] varchar(20) NOT NULL DEFAULT '',
    [IRNextPaymentDate] date NOT NULL DEFAULT '1900-01-01',
    [IRPaymentFrequency] varchar(20) NOT NULL DEFAULT '',
    [IRCompoundingType] varchar(20) NOT NULL DEFAULT '',
    [TypeOf] varchar(20) NOT NULL DEFAULT '',
    [SubType] varchar(20) NOT NULL DEFAULT '',
    [IRDayCount] varchar(20) NOT NULL DEFAULT '',
    [IRSpreadFlag] bit NOT NULL DEFAULT 0,
    [GuarantorId] varchar(150) NOT NULL DEFAULT '',
    [GuarantorPIT] int NULL,
    [IsEdited] bit NOT NULL DEFAULT 0,
    [CryptoAssetId] varchar(100) NOT NULL DEFAULT '',
    [CryptoAssetPIT] int NULL,
    [ReportingDate] date NOT NULL DEFAULT '1900-01-01',
    [CreditFacilityId] varchar(100) NOT NULL DEFAULT '',
    [PortfolioAdjustmentProvisionId] varchar(100) NOT NULL DEFAULT '',
    [PortfolioAdjustmentProvisionPIT] int NULL,
    PRIMARY KEY ([Id], [LoadId])
);

CREATE TABLE list_counterparties (
    [Id] varchar(150) NOT NULL,
    [PointInTime] int NOT NULL,
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(100) NOT NULL DEFAULT '',
    [LegalName] varchar(100) NOT NULL DEFAULT '',
    [LEI] varchar(20) NOT NULL DEFAULT '',
    [DomicileCountry] char(2) NOT NULL DEFAULT '',
    [DomicileCanton] char(2) NOT NULL DEFAULT '',
    [HQDomicile] char(2) NOT NULL DEFAULT '',
    [RelatedPartyType] varchar(20) NOT NULL DEFAULT '',
    [TypeOf] varchar(20) NOT NULL DEFAULT '',
    [EconomicActivityType] varchar(20) NOT NULL DEFAULT '',
    [RatingClass] int NOT NULL DEFAULT 0,
    [ExternalRatingId] varchar(20) NOT NULL DEFAULT '',
    [ExternalRatingPIT] int NULL,
    [BookingCenterId] varchar(20) NOT NULL DEFAULT '',
    [GroupLEXId] varchar(150) NOT NULL DEFAULT '',
    [GroupARISId] varchar(150) NOT NULL DEFAULT '',
    [Headcount] int NOT NULL DEFAULT 0,
    [Turnover] int NOT NULL DEFAULT 0,
    [BalanceSheet] real NOT NULL DEFAULT 0,
    [Income1] int NOT NULL DEFAULT 0,
    [Income2] int NOT NULL DEFAULT 0,
    [SMEFlag] bit NOT NULL DEFAULT 0,
    [AdequateSupervisionFlag] bit NOT NULL DEFAULT 0,
    [RelationshipManagerId] varchar(100) NOT NULL DEFAULT '',
    [EstablishedRelationshipFlag] bit NOT NULL DEFAULT 0,
    [LEXLimitFlag] bit NOT NULL DEFAULT 0,
    [CreditQuality] char(2) NOT NULL DEFAULT '',
    [IncomeCurrency] char(3) NOT NULL DEFAULT '',
    [IsEdited] bit NOT NULL DEFAULT 0,
    [Nationality] char(2) NOT NULL DEFAULT '',
    [ReportingDate] date NOT NULL DEFAULT '1900-01-01',
    [PD] real NOT NULL DEFAULT 0,
    [RiskEvaluationDate] date NOT NULL DEFAULT '1900-01-01',
    [SIScode] char(5) NOT NULL DEFAULT '',
    PRIMARY KEY ([Id], [PointInTime])
);

CREATE TABLE list_securities (
    [Id] varchar(150) NOT NULL,
    [PointInTime] int NOT NULL,
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(100) NOT NULL DEFAULT '',
    [ISIN] varchar(20) NOT NULL DEFAULT '',
    [BBGTicker] varchar(20) NOT NULL DEFAULT '',
    [FIGI] varchar(20) NOT NULL DEFAULT '',
    [SEDOL] varchar(20) NOT NULL DEFAULT '',
    [Currency] char(3) NOT NULL DEFAULT '',
    [IndexFlag] bit NOT NULL DEFAULT 0,
    [MainIndexFlag] bit NOT NULL DEFAULT 0,
    [RevaluationFrequency] char(1) NOT NULL DEFAULT '',
    [SNBEligibleFlag] bit NOT NULL DEFAULT 0,
    [CMAApproachType] varchar(20) NOT NULL DEFAULT '',
    [CMARiskIndicator] int NOT NULL DEFAULT 0,
    [CMASARwFlag] bit NOT NULL DEFAULT 0,
    [RatingClass] int NOT NULL DEFAULT 0,
    [ExternalRatingId] varchar(20) NOT NULL DEFAULT '',
    [ExternalRatingPIT] int NULL,
    [MaturityDate] date NOT NULL DEFAULT '1900-01-01',
    [TypeOf] varchar(20) NOT NULL DEFAULT '',
    [SubType] varchar(20) NOT NULL DEFAULT '',
    [InterestRateId] varchar(100) NOT NULL DEFAULT '',
    [IssuerId] varchar(100) NOT NULL DEFAULT '',
    [IssuerPIT] int NULL,
    [InvestmentGradeFlag] bit NOT NULL DEFAULT 0,
    [TimeSeriesId] bigint NOT NULL DEFAULT 0,
    [HQLACategory] varchar(20) NOT NULL DEFAULT '',
    [LEXGuaranteedFlag] bit NOT NULL DEFAULT 0,
    [ListedType] varchar(20) NOT NULL DEFAULT '',
    [IsEdited] bit NOT NULL DEFAULT 0,
    [StartDate] date NOT NULL DEFAULT '1900-01-01',
    [ReportingDate] date NOT NULL DEFAULT '1900-01-01',
    PRIMARY KEY ([Id], [PointInTime])
);

CREATE TABLE list_booking_centers (
    [Id] varchar(100) NOT NULL,
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(100) NOT NULL DEFAULT '',
    [OfficeType] varchar(20) NOT NULL DEFAULT '',
    [OfficeCountry] char(2) NOT NULL DEFAULT '',
    [OfficeCanton] char(2) NOT NULL DEFAULT '',
    [OwnerId] varchar(100) NOT NULL DEFAULT '',
    PRIMARY KEY ([Id])
);

CREATE TABLE list_reporting_entities (
    [Id] varchar(100) NOT NULL,
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(100) NOT NULL DEFAULT '',
    [SNBCode] varchar(20) NOT NULL DEFAULT '',
    [FinmaCategory] int NOT NULL DEFAULT 0,
    [ConsoLevelBankOffice] bit NOT NULL DEFAULT 0,
    [ConsoLevelParentCompany] bit NOT NULL DEFAULT 0,
    [ConsoLevelGroup] bit NOT NULL DEFAULT 0,
    [StreetName] varchar(100) NOT NULL DEFAULT '',
    [StreetNumber] varchar(10) NOT NULL DEFAULT '',
    [PostBox] varchar(100) NOT NULL DEFAULT '',
    [ZipCode] varchar(10) NOT NULL DEFAULT '',
    [City] varchar(100) NOT NULL DEFAULT '',
    [ContactName] varchar(100) NOT NULL DEFAULT '',
    [ContactType] varchar(100) NOT NULL DEFAULT '',
    [ContactPhone] varchar(100) NOT NULL DEFAULT '',
    [ContactEmail] varchar(100) NOT NULL DEFAULT '',
    [SubGroupName] varchar(100) NOT NULL DEFAULT '',
    [DivisionName] varchar(100) NOT NULL DEFAULT '',
    [ReferredPerson] varchar(100) NOT NULL DEFAULT '',
    [FxRateId] varchar(100) NULL,
    [ReportingCurrency] char(3) NOT NULL DEFAULT '',
    [FinmaCode] varchar(20) NOT NULL DEFAULT '',
    [EuContextIdentifier] varchar(100) NOT NULL DEFAULT '',
    [EuContextIdentifierSchema] varchar(100) NOT NULL DEFAULT '',
    [EuAccountingFramework] varchar(100) NOT NULL DEFAULT '',
    [EuReportingLevel] varchar(100) NOT NULL DEFAULT '',
    [EuDerivativesTreatment] varchar(100) NOT NULL DEFAULT '',
    [EuInstitutionType] varchar(100) NOT NULL DEFAULT '',
    [EuInstitutionsCompanyStructure] varchar(100) NOT NULL DEFAULT '',
    PRIMARY KEY ([Id])
);

CREATE TABLE list_reporting_sets (
    [ReportingEntityId] varchar(100) NOT NULL,
    [ConsolidatedBookingCenterId] varchar(100) NOT NULL,
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [OfficeType] varchar(20) NOT NULL DEFAULT '',
    [OfficeCountry] char(2) NOT NULL DEFAULT '',
    PRIMARY KEY ([ReportingEntityId], [ConsolidatedBookingCenterId])
);

CREATE TABLE core_loads (
    [CreationDate] date NOT NULL DEFAULT '1900-01-01',
    [ReportingDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(50) NOT NULL DEFAULT '',
    [LastUpdate] datetime2 NOT NULL DEFAULT SYSDATETIME(),
    [IsVisible] bit NOT NULL DEFAULT 0,
    [LoadId] int NOT NULL,
    PRIMARY KEY ([LoadId])
);

CREATE TABLE core_load_collections (
    [CreateDate] date NOT NULL DEFAULT '1900-01-01',
    [ReportingDate] date NOT NULL DEFAULT '1900-01-01',
    [Name] varchar(50) NOT NULL DEFAULT '',
    [ReportingEntityId] varchar(100) NULL,
    [IsVisible] bit NOT NULL DEFAULT 0,
    [Calculations] nvarchar(max) NOT NULL DEFAULT '',
    [IsArchived] bit NOT NULL DEFAULT 0,
    [SimulationFromLoadCollectionId] int NOT NULL DEFAULT 0,
    [LoadCollectionId] int NOT NULL,
    [IsMaster] bit NOT NULL DEFAULT 0,
    PRIMARY KEY ([LoadCollectionId])
);

CREATE TABLE core_loads_loads_collection (
    [LoadCollectionsLoadCollectionId] int NOT NULL,
    [LoadsLoadId] int NOT NULL,
    PRIMARY KEY ([LoadCollectionsLoadCollectionId], [LoadsLoadId])
);
GO

-- =============================================================================
-- SEED
-- =============================================================================

-- Counterparties: PIT 1001 (Dec) and PIT 1002 (Jan) --------------------------
-- Full-field drift material: ratings, external ratings, domicile, credit
-- quality, SME flag — everything the v3.6 controls compare.
INSERT INTO list_counterparties (Id, PointInTime, Name, TypeOf, EconomicActivityType, RatingClass, GroupLEXId, DomicileCountry, HQDomicile, Nationality, ExternalRatingId, CreditQuality, SMEFlag, LEI) VALUES
-- PIT 1001 (Dec)
('CLI-KFW',    1001, 'KFW',                'Bank', '641001', 1, 'LEX-KFW',    'DE', 'DE', 'DE', 'AAA', 'Q1', 0, 'KFW00000000000000001'),
('CLI-DEGOV',  1001, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV', 'DE', 'DE', 'DE', 'AAA', 'Q1', 0, ''),
('CLI-UBS',    1001, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS',    'CH', 'CH', 'CH', 'A',   'Q2', 0, 'UBS00000000000000001'),
('CLI-NESTLE', 1001, 'Nestle SA',          'Corp', '107300', 3, 'LEX-NESTLE', 'CH', 'CH', 'CH', 'A',   'Q2', 0, 'NES00000000000000001'),
('CLI-PRIV1',  1001, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1',  'CH', 'CH', 'CH', '',    'Q4', 1, ''),
('CLI-EFGSUB', 1001, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG',    'CH', 'CH', 'CH', 'A',   'Q2', 0, ''),
('CLI-EFGFIN', 1001, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG',    'CH', 'CH', 'CH', 'A',   'Q2', 0, ''),   -- C2: same LEX group, other sector
('CLI-595021', 1001, 'Bank, Luxembourg',   'Bank', '641001', 2, 'LEX-BLUX',   'LU', 'LU', 'LU', 'A',   'Q2', 0, ''),  -- Adjustments test (CLIENT 595021)
('CLI-590017', 1001, 'Bank AG, Frankfurt', 'Bank', '641001', 2, 'LEX-BFRA',   'DE', 'DE', 'DE', 'A',   'Q2', 0, ''),  -- Adjustments test (CLIENT 590017)
-- PIT 1002 (Jan) — with deliberate drifts on the FULL field set
('CLI-KFW',    1002, 'KFW',                'Bank', '641001', 1, 'LEX-KFW',    'DE', 'DE', 'DE', 'AAA', 'Q1', 0, 'KFW00000000000000001'),
('CLI-DEGOV',  1002, 'German government',  'CGov', '841100', 1, 'LEX-DE-GOV', 'DE', 'DE', 'DE', 'AAA', 'Q1', 0, ''),
('CLI-UBS',    1002, 'UBS AG',             'Bank', '641001', 2, 'LEX-UBS',    'CH', 'CH', 'CH', 'A',   'Q2', 0, 'UBS00000000000000001'),
('CLI-NESTLE', 1002, 'Nestle SA',          'Corp', '107300', 4, 'LEX-NESTLE', 'CH', 'CH', 'CH', 'BBB', 'Q2', 0, 'NES00000000000000001'), -- C1: rating 3→4, external A→BBB
('CLI-PRIV1',  1002, 'Private client 1',   'IP',   '970000', 5, 'LEX-PRIV1B', 'FR', 'CH', 'CH', '',    'Q4', 1, ''), -- C1: grouplexid + domicile CH→FR
('CLI-EFGSUB', 1002, 'EFG Subsidiary',     'Bank', '641001', 2, 'LEX-EFG',    'CH', 'CH', 'CH', 'A',   'Q2', 0, ''),
('CLI-EFGFIN', 1002, 'EFG Finance',        'Corp', '649900', 2, 'LEX-EFG',    'CH', 'CH', 'CH', 'A',   'Q2', 0, ''),
('CLI-595021', 1002, 'Bank, Luxembourg',   'Bank', '641001', 2, 'LEX-BLUX',   'LU', 'LU', 'LU', 'A',   'Q2', 0, ''),
('CLI-590017', 1002, 'Bank AG, Frankfurt', 'Bank', '641001', 2, 'LEX-BFRA',   'DE', 'DE', 'DE', 'A',   'Q2', 0, '');

-- Securities ------------------------------------------------------------------
INSERT INTO list_securities (Id, PointInTime, Name, ISIN, TypeOf, SubType, RatingClass, ExternalRatingId, RevaluationFrequency, Currency, SNBEligibleFlag, InvestmentGradeFlag, ListedType, MaturityDate, IssuerId, IssuerPIT, HQLACategory, LEXGuaranteedFlag) VALUES
('SEC-KFW1',  1001, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   'Covered', 1, 'AAA', 'D', 'EUR', 1, 1, 'Listed', '2030-06-30', 'CLI-KFW',    1001, 'L1',  1),
('SEC-ROCHE', 1001, 'Roche Holding',  'CH0012032048', 'Equity', '',        3, 'A',   'D', 'CHF', 0, 1, 'Listed', '1900-01-01', 'CLI-NESTLE', 1001, 'L2b', 0),
('SEC-KFW1',  1002, 'KFW 2.5% 2030',  'DE000KFW0001', 'Bond',   'Covered', 1, 'AAA', 'D', 'EUR', 0, 1, 'Listed', '2030-06-30', 'CLI-KFW',    1002, 'L2a', 1),  -- C3/C4: HQLA L1→L2a + SNB eligible 1→0
('SEC-ROCHE', 1002, 'Roche Holding',  'CH0012032048', 'Equity', '',        3, 'A',   'D', 'CHF', 0, 1, 'Listed', '1900-01-01', 'CLI-NESTLE', 1002, 'L2b', 0);

-- Positions: LoadId 1001 (Dec, PIT 1001) --------------------------------------
-- LegalAccountNumber is an int in the real DDL.
INSERT INTO core_positions (Id, LoadId, ReportingDate, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1001, '2025-12-31', 106001, 'Security', '',         54200000, 'EUR', '',           NULL, 'CLI-DEGOV', 1001, 'SEC-KFW1',  1001),
('POS-SEC2',  1001, '2025-12-31', 106001, 'Security', '',         12700000, 'CHF', '',           NULL, '',          NULL, 'SEC-ROCHE', 1001),
('POS-DFB1',  1001, '2025-12-31', 103001, 'Account',  '',         85000000, 'CHF', 'CLI-UBS',    1001, '', NULL, '', NULL),
('POS-DTB1',  1001, '2025-12-31', 201001, 'Account',  '',         40000000, 'CHF', 'CLI-UBS',    1001, '', NULL, '', NULL),
('POS-LOAN1', 1001, '2025-12-31', 104001, 'Contract', '',         30000000, 'CHF', 'CLI-NESTLE', 1001, '', NULL, '', NULL),
('POS-LOAN2', 1001, '2025-12-31', 104002, 'Contract', '',         12000000, 'CHF', 'CLI-EFGSUB', 1001, '', NULL, '', NULL),
('POS-LOAN3', 1001, '2025-12-31', 104003, 'Contract', '',          8000000, 'CHF', 'CLI-EFGFIN', 1001, '', NULL, '', NULL),
('POS-MORT1', 1001, '2025-12-31', 105001, 'Contract', 'Mortgage', 15000000, 'CHF', 'CLI-PRIV1',  1001, '', NULL, '', NULL),
('POS-DEP1',  1001, '2025-12-31', 202001, 'Account',  '',         22000000, 'CHF', 'CLI-PRIV1',  1001, '', NULL, '', NULL),
('POS-ORPH',  1001, '2025-12-31', 104009, 'Contract', '',          5000000, 'USD', 'CLI-GHOST',  1001, '', NULL, '', NULL); -- C5

-- Positions: LoadId 1002 (Jan, PIT 1002) --------------------------------------
INSERT INTO core_positions (Id, LoadId, ReportingDate, LegalAccountNumber, TypeOf, SubType, BookAmount, Currency, CounterpartyId, CounterpartyPIT, GuarantorId, GuarantorPIT, SecurityId, SecurityPIT) VALUES
('POS-SEC1',  1002, '2026-01-31', 106001, 'Security', '',         55100000, 'EUR', '',           NULL, 'CLI-DEGOV', 1002, 'SEC-KFW1',  1002),
('POS-SEC2',  1002, '2026-01-31', 106001, 'Security', '',         13100000, 'CHF', '',           NULL, '',          NULL, 'SEC-ROCHE', 1002),
('POS-DFB1',  1002, '2026-01-31', 103001, 'Account',  '',         90000000, 'CHF', 'CLI-UBS',    1002, '', NULL, '', NULL),
('POS-DTB1',  1002, '2026-01-31', 201001, 'Account',  '',         41000000, 'CHF', 'CLI-UBS',    1002, '', NULL, '', NULL),
('POS-LOAN1', 1002, '2026-01-31', 104001, 'Contract', '',         31000000, 'CHF', 'CLI-NESTLE', 1002, '', NULL, '', NULL),
('POS-LOAN2', 1002, '2026-01-31', 104002, 'Contract', '',         12500000, 'CHF', 'CLI-EFGSUB', 1002, '', NULL, '', NULL),
('POS-LOAN3', 1002, '2026-01-31', 104003, 'Contract', '',          8100000, 'CHF', 'CLI-EFGFIN', 1002, '', NULL, '', NULL),
('POS-MORT1', 1002, '2026-01-31', 105001, 'Contract', 'Mortgage', 14900000, 'CHF', 'CLI-PRIV1',  1002, '', NULL, '', NULL),
('POS-DEP1',  1002, '2026-01-31', 202001, 'Account',  '',         21500000, 'CHF', 'CLI-PRIV1',  1002, '', NULL, '', NULL),
('POS-ORPH',  1002, '2026-01-31', 104009, 'Contract', '',          5100000, 'USD', 'CLI-GHOST',  1002, '', NULL, '', NULL), -- C5
('POS-LOAN4', 1002, '2026-01-31', 104004, 'Contract', '',          2000000, 'CHF', 'CLI-NESTLE', 1001, '', NULL, '', NULL); -- C2: stale PIT 1001 in a 1002 load

-- Adjustments matching test rows (load 1002) ----------------------------------
-- Sample file: LIGNE 155 (REFERENCE 5950216318, CLIENT 595021) matches TWO
-- positions — only POS-ADJ-A carries the GL-mapping account 102001 (checkGL);
-- LIGNE 2060 (REFERENCE 5900175308, CLIENT 590017) matches via ContractId.
-- POS-ADJ-C faces BC-ZH (interco): eliminated at MOCK-GROUP level, kept solo.
INSERT INTO core_positions (Id, LoadId, ReportingDate, LegalAccountNumber, TypeOf, BookAmount, Currency, CounterpartyId, CounterpartyPIT, InternalReference1, ContractId, PositionCurrencyBookAmount, DataSource, BookingCenterId, CounterpartyBookingCenterId) VALUES
('POS-ADJ-A', 1002, '2026-01-31', 102001, 'Account',   750000, 'EUR', 'CLI-595021', 1002, '5950216318', '',           800000, 'CORE', 'BC-GVA', ''),
('POS-ADJ-B', 1002, '2026-01-31', 104001, 'Contract',  500000, 'EUR', 'CLI-595021', 1002, '5950216318', '',           535000, 'CORE', 'BC-ZH',  ''),
('POS-ADJ-C', 1002, '2026-01-31', 201001, 'Account',  -750000, 'EUR', 'CLI-590017', 1002, '',           '5900175308', -800000, 'CORE', 'BC-GVA', 'BC-ZH');
GO

-- Consolidation referential ---------------------------------------------------
-- MOCK-SOLO = BC-GVA alone (bank office level); MOCK-GROUP = BC-GVA + BC-ZH
-- (group level) — at group level the BC-GVA/BC-ZH interco is eliminated.
INSERT INTO list_booking_centers (Id, Name, OfficeType, OfficeCountry, OfficeCanton, OwnerId) VALUES
('BC-GVA', 'Mock Bank Geneva',        'HeadOffice', 'CH', 'GE', ''),
('BC-ZH',  'Mock Bank Zurich Branch', 'Branch',     'CH', 'ZH', 'BC-GVA');
INSERT INTO list_reporting_entities (Id, Name, SNBCode, FinmaCategory, ReportingCurrency, ConsoLevelBankOffice, ConsoLevelParentCompany, ConsoLevelGroup) VALUES
('MOCK-SOLO',  'Mock Bank solo',  'SNB01', 3, 'CHF', 1, 1, 0),
('MOCK-GROUP', 'Mock Bank group', 'SNB01', 3, 'CHF', 0, 0, 1);
INSERT INTO list_reporting_sets (ReportingEntityId, ConsolidatedBookingCenterId, OfficeType, OfficeCountry) VALUES
('MOCK-SOLO',  'BC-GVA', 'HeadOffice', 'CH'),
('MOCK-GROUP', 'BC-GVA', 'HeadOffice', 'CH'),
('MOCK-GROUP', 'BC-ZH',  'Branch',     'CH');
GO

-- core_loads: links each loadid to its reporting date (the app resolves the
-- period automatically when the date field is left blank).
-- IsVisible = 1 is required: the app lists loads WHERE IsVisible = 1.
INSERT INTO core_loads (LoadId, ReportingDate, Name, CreationDate, IsVisible) VALUES
    (1001, '2025-12-31', 'DEC-25 monthly', '2026-01-02', 1),
    (1002, '2026-01-31', 'JAN-26 monthly', '2026-02-02', 1);

-- Load collections: the adjustments unit of work — a collection carries the
-- reporting entity (consolidation level) and groups its loads.
INSERT INTO core_load_collections (LoadCollectionId, CreateDate, ReportingDate, Name, ReportingEntityId, IsVisible, IsArchived, IsMaster) VALUES
(501, '2026-01-02', '2025-12-31', 'DEC-25 GROUP monthly', 'MOCK-GROUP', 1, 0, 1),
(502, '2026-02-02', '2026-01-31', 'JAN-26 GROUP monthly', 'MOCK-GROUP', 1, 0, 1),
(503, '2026-02-02', '2026-01-31', 'JAN-26 SOLO',          'MOCK-SOLO',  1, 0, 0);
INSERT INTO core_loads_loads_collection (LoadCollectionsLoadCollectionId, LoadsLoadId) VALUES
(501, 1001),
(502, 1002),
(503, 1002);
GO

-- Now create the two TVFs in THIS database: open docs/SQL_MERCURY_TVFS.sql,
-- make sure the connection is on MERCURY_MOCK, and execute it.

-- ---------------------------------------------------------------------------
-- EFG_CCY_MONTHLY: end-of-month FX rates to CHF (BS_Rate_6 = CHF for 1 unit
-- of currency) — feeds the Workbench RWA-by-currency proxy
-- (GET /api/production/mercury/fx-rates). Not part of the QDL core model.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('EFG_CCY_MONTHLY') IS NOT NULL DROP TABLE EFG_CCY_MONTHLY;
CREATE TABLE EFG_CCY_MONTHLY (
    ReportingDate date NOT NULL,
    CcyNumber int NULL,
    Ccy varchar(3) NOT NULL,
    Name varchar(50) NULL,
    BS_Rate_2 float NULL,
    BS_Rate_6 float NULL,
    CONSTRAINT PK_EFG_CCY_MONTHLY PRIMARY KEY (ReportingDate, Ccy));
INSERT INTO EFG_CCY_MONTHLY (ReportingDate, CcyNumber, Ccy, Name, BS_Rate_6) VALUES
    ('2025-12-31', 840, 'USD', 'US Dollar',      0.8920),
    ('2025-12-31', 978, 'EUR', 'Euro',           0.9360),
    ('2025-12-31', 826, 'GBP', 'Pound Sterling', 1.1275),
    ('2026-01-31', 840, 'USD', 'US Dollar',      0.8845),
    ('2026-01-31', 978, 'EUR', 'Euro',           0.9295),
    ('2026-01-31', 826, 'GBP', 'Pound Sterling', 1.1340);
