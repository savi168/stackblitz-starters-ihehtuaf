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
