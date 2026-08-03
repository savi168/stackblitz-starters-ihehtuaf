-- Production controls tables — run this ONCE in SSMS on the RegReport database
-- so you do NOT have to drop/recreate it (EnsureCreated only creates tables on
-- an empty database). Matches exactly what EF Core would generate.

USE RegReport;
GO

CREATE TABLE [ProdCounterparties] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(450) NOT NULL,
    [Date] nvarchar(450) NOT NULL,
    [Dataset] nvarchar(450) NOT NULL,
    [ClientNumber] nvarchar(max) NOT NULL,
    [ClientType] nvarchar(max) NOT NULL,
    [GroupLexId] nvarchar(max) NOT NULL,
    [CounterpartyType] nvarchar(max) NOT NULL,
    [IssuerRating] nvarchar(max) NULL,
    [Amount] float NULL,
    [Currency] nvarchar(max) NULL,
    CONSTRAINT [PK_ProdCounterparties] PRIMARY KEY ([Id])
);
CREATE INDEX [IX_ProdCounterparties_Entity_Date_Dataset]
    ON [ProdCounterparties] ([Entity], [Date], [Dataset]);

CREATE TABLE [ProdSecurities] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(450) NOT NULL,
    [Date] nvarchar(450) NOT NULL,
    [Isin] nvarchar(max) NOT NULL,
    [SecurityMaster] nvarchar(max) NULL,
    [SecurityType] nvarchar(max) NULL,
    [Rating] nvarchar(max) NULL,
    [DailyReval] bit NULL,
    [IssuerLexId] nvarchar(max) NULL,
    [GuarantorLexId] nvarchar(max) NULL,
    [GuarantorName] nvarchar(max) NULL,
    [HqlaLevel] nvarchar(max) NULL,
    [Amount] float NULL,
    CONSTRAINT [PK_ProdSecurities] PRIMARY KEY ([Id])
);
CREATE INDEX [IX_ProdSecurities_Entity_Date] ON [ProdSecurities] ([Entity], [Date]);

CREATE TABLE [ProdGuaranteeRefs] (
    [Id] bigint NOT NULL IDENTITY,
    [GroupLexId] nvarchar(450) NOT NULL,
    [Name] nvarchar(max) NULL,
    [GuarantorLexId] nvarchar(max) NULL,
    [GuarantorName] nvarchar(max) NULL,
    [ExpectedHqlaLevel] nvarchar(max) NULL,
    [Notes] nvarchar(max) NULL,
    CONSTRAINT [PK_ProdGuaranteeRefs] PRIMARY KEY ([Id])
);
CREATE INDEX [IX_ProdGuaranteeRefs_GroupLexId] ON [ProdGuaranteeRefs] ([GroupLexId]);
GO

-- Decision log of the production controls (validated / corrected findings).
-- Run once on RegReport if the table does not exist yet.
IF OBJECT_ID('ProdFindingLogs') IS NULL
CREATE TABLE [ProdFindingLogs] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(450) NOT NULL,
    [Date] nvarchar(450) NOT NULL,
    [CompareDate] nvarchar(max) NULL,
    [Control] nvarchar(max) NOT NULL,
    [FindingKey] nvarchar(max) NOT NULL,
    [Signature] nvarchar(450) NOT NULL,
    [Decision] nvarchar(max) NOT NULL,
    [Note] nvarchar(max) NULL,
    [DecidedBy] nvarchar(max) NOT NULL,
    [DecidedAt] nvarchar(max) NOT NULL,
    CONSTRAINT [PK_ProdFindingLogs] PRIMARY KEY ([Id])
);
IF OBJECT_ID('ProdFindingLogs') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProdFindingLogs_Entity_Signature')
CREATE INDEX [IX_ProdFindingLogs_Entity_Signature] ON [ProdFindingLogs] ([Entity], [Signature]);
GO

-- Persisted adjustments mapping workbook (Mapping.xlsb) — one row per entry,
-- sparse columns per kind (gl / fx / rt01 / industry / label) so the team does
-- not re-upload the file for every adjustment session.
IF OBJECT_ID('ProdMappingEntries') IS NULL
CREATE TABLE [ProdMappingEntries] (
    [Id] bigint NOT NULL IDENTITY,
    [Kind] nvarchar(450) NOT NULL,
    [MapKey] nvarchar(450) NOT NULL,
    [TextValue] nvarchar(max) NULL,
    [NumValue] float NULL,
    [TypeOf] nvarchar(max) NULL,
    [SubType] nvarchar(max) NULL,
    [EconomicActivityType] nvarchar(max) NULL,
    [Interco] nvarchar(max) NULL,
    [Description] nvarchar(max) NULL,
    CONSTRAINT [PK_ProdMappingEntries] PRIMARY KEY ([Id])
);
IF OBJECT_ID('ProdMappingEntries') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProdMappingEntries_Kind_MapKey')
CREATE INDEX [IX_ProdMappingEntries_Kind_MapKey] ON [ProdMappingEntries] ([Kind], [MapKey]);
GO
