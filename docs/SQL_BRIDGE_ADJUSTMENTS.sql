-- Manual CET1-bridge lines (acquisitions, disposals, debt redemptions…) —
-- run ONCE in SSMS on the RegReport database (EnsureCreated only creates
-- tables on an empty database). Guarded: safe to re-run.

USE RegReport;
GO

IF OBJECT_ID('BridgeAdjustments') IS NULL
CREATE TABLE [BridgeAdjustments] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(450) NOT NULL,
    [FromDate] nvarchar(450) NOT NULL,   -- compared period YYYY-MM-DD
    [ToDate] nvarchar(450) NOT NULL,     -- reference period YYYY-MM-DD
    [Label] nvarchar(max) NOT NULL,      -- e.g. Acquisition XYZ, AT1 redemption
    [ImpactPp] float NOT NULL,           -- signed CET1-ratio impact, percentage points
    [Note] nvarchar(max) NULL,
    [CreatedBy] nvarchar(max) NOT NULL,
    [CreatedAt] nvarchar(max) NOT NULL,
    CONSTRAINT [PK_BridgeAdjustments] PRIMARY KEY ([Id])
);
IF OBJECT_ID('BridgeAdjustments') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_BridgeAdjustments_Entity_FromDate_ToDate')
CREATE INDEX [IX_BridgeAdjustments_Entity_FromDate_ToDate]
    ON [BridgeAdjustments] ([Entity], [FromDate], [ToDate]);
GO
