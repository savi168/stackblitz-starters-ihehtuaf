-- Document library — run ONCE in SSMS on the RegReport database (EnsureCreated
-- only creates tables on an empty database). Guarded: safe to re-run.
-- The file bytes live in [Content] varbinary(max): a RegReport backup covers
-- every document, and everything stays fully offline.

USE RegReport;
GO

IF OBJECT_ID('Documents') IS NULL
CREATE TABLE [Documents] (
    [Id] bigint NOT NULL IDENTITY,
    [Folder] nvarchar(450) NOT NULL,          -- '/'-separated path, e.g. Regulations/EBA
    [Title] nvarchar(max) NOT NULL,
    [FileName] nvarchar(max) NOT NULL,
    [ContentType] nvarchar(max) NOT NULL,
    [SizeBytes] bigint NOT NULL,
    [Content] varbinary(max) NOT NULL,        -- the file itself
    [Entity] nvarchar(450) NULL,              -- workbench source files: reporting entity
    [Date] nvarchar(450) NULL,                -- workbench source files: period YYYY-MM-DD
    [Kind] nvarchar(max) NULL,                -- workingPaper | casabis | lcr | nsfr | other
    [Notes] nvarchar(max) NULL,
    [UploadedBy] nvarchar(max) NOT NULL,
    [UploadedAt] nvarchar(max) NOT NULL,
    CONSTRAINT [PK_Documents] PRIMARY KEY ([Id])
);
IF OBJECT_ID('Documents') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Folder')
CREATE INDEX [IX_Documents_Folder] ON [Documents] ([Folder]);
IF OBJECT_ID('Documents') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Entity_Date')
CREATE INDEX [IX_Documents_Entity_Date] ON [Documents] ([Entity], [Date]);
GO
