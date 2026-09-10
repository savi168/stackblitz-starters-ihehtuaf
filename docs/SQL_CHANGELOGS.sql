-- ChangeLogs: business audit trail (Data Explorer edits, imports, saves).
-- Manual equivalent of SchemaMigrator step 007_change_logs — the API creates
-- this automatically at startup; run this only for a fix via SSMS.
IF OBJECT_ID('ChangeLogs') IS NULL
BEGIN
    CREATE TABLE [ChangeLogs] (
        [Id] bigint NOT NULL IDENTITY,
        [At] datetime2 NOT NULL,
        [UserName] nvarchar(128) NOT NULL,
        [Dataset] nvarchar(64) NOT NULL,
        [RowKey] nvarchar(200) NOT NULL CONSTRAINT [DF_ChangeLogs_RowKey] DEFAULT '',
        [Action] nvarchar(32) NOT NULL,
        [Details] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_ChangeLogs] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ChangeLogs_At] ON [ChangeLogs] ([At]);
    CREATE INDEX [IX_ChangeLogs_Dataset_RowKey] ON [ChangeLogs] ([Dataset], [RowKey]);
END
GO
-- Upgrade path for a table created before RowKey existed (migration 008):
IF COL_LENGTH('ChangeLogs', 'RowKey') IS NULL
    ALTER TABLE [ChangeLogs]
        ADD [RowKey] nvarchar(200) NOT NULL CONSTRAINT [DF_ChangeLogs_RowKey] DEFAULT '';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChangeLogs_Dataset_RowKey')
    CREATE INDEX [IX_ChangeLogs_Dataset_RowKey] ON [ChangeLogs] ([Dataset], [RowKey]);
