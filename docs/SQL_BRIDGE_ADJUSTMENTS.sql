-- Manual CET1-bridge lines (acquisitions, disposals, debt redemptions…) —
-- run ONCE in SSMS on the RegReport database (EnsureCreated only creates
-- tables on an empty database). Guarded: safe to re-run.
-- Column sizes kept small (dates are ISO strings, entity ids are short) so
-- the composite index stays well under the 1700-byte nonclustered-key limit.

USE RegReport;
GO

IF OBJECT_ID('BridgeAdjustments') IS NULL
CREATE TABLE [BridgeAdjustments] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(200) NOT NULL,
    [FromDate] nvarchar(32) NOT NULL,    -- compared period YYYY-MM-DD
    [ToDate] nvarchar(32) NOT NULL,      -- reference period YYYY-MM-DD
    [Label] nvarchar(max) NOT NULL,      -- e.g. Acquisition XYZ, AT1 redemption
    [ImpactPp] float NOT NULL,           -- signed CET1-ratio impact, percentage points
    [Note] nvarchar(max) NULL,
    [CreatedBy] nvarchar(max) NOT NULL,
    [CreatedAt] nvarchar(max) NOT NULL,
    CONSTRAINT [PK_BridgeAdjustments] PRIMARY KEY ([Id])
);
GO

-- Fix-up for a table created by an earlier version of this script (nvarchar(450)
-- columns → SQL Server warned about the 1700-byte index-key limit): shrink the
-- columns, recreating the index around the change. Safe to re-run.
IF COL_LENGTH('BridgeAdjustments', 'FromDate') > 64
BEGIN
    DROP INDEX IF EXISTS [IX_BridgeAdjustments_Entity_FromDate_ToDate] ON [BridgeAdjustments];
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [Entity] nvarchar(200) NOT NULL;
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [FromDate] nvarchar(32) NOT NULL;
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [ToDate] nvarchar(32) NOT NULL;
END
GO

IF OBJECT_ID('BridgeAdjustments') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_BridgeAdjustments_Entity_FromDate_ToDate')
CREATE INDEX [IX_BridgeAdjustments_Entity_FromDate_ToDate]
    ON [BridgeAdjustments] ([Entity], [FromDate], [ToDate]);
GO
