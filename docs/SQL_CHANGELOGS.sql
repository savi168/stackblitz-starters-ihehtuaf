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
        [Action] nvarchar(32) NOT NULL,
        [Details] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_ChangeLogs] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ChangeLogs_At] ON [ChangeLogs] ([At]);
END
