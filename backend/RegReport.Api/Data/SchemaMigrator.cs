using Microsoft.EntityFrameworkCore;
using System.Data.Common;

namespace RegReport.Api.Data;

/// <summary>
/// Built-in schema upgrader, run at every startup:
///  - EnsureCreated() builds the FULL schema on an empty database, but never
///    evolves an existing one — this class closes that gap;
///  - each step below is additive and idempotent (guarded CREATE/ALTER, no
///    DROP, no data rewrite), so existing data is always preserved;
///  - applied steps are recorded in [__SchemaMigrations] (name + timestamp),
///    giving an audit trail and skipping work on later startups.
/// Shipping a release that changes the data model = appending a new guarded
/// step here; deployments then upgrade themselves, no SSMS session needed.
/// The docs/SQL_*.sql scripts remain the manual equivalent.
/// </summary>
public static class SchemaMigrator
{
    private static readonly (string Name, string Sql)[] Steps =
    {
        ("001_production_tables", @"
IF OBJECT_ID('ProdCounterparties') IS NULL
BEGIN
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
        CONSTRAINT [PK_ProdCounterparties] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ProdCounterparties_Entity_Date_Dataset]
        ON [ProdCounterparties] ([Entity], [Date], [Dataset]);
END
GO
IF OBJECT_ID('ProdSecurities') IS NULL
BEGIN
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
        CONSTRAINT [PK_ProdSecurities] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ProdSecurities_Entity_Date] ON [ProdSecurities] ([Entity], [Date]);
END
GO
IF OBJECT_ID('ProdGuaranteeRefs') IS NULL
BEGIN
    CREATE TABLE [ProdGuaranteeRefs] (
        [Id] bigint NOT NULL IDENTITY,
        [GroupLexId] nvarchar(450) NOT NULL,
        [Name] nvarchar(max) NULL,
        [GuarantorLexId] nvarchar(max) NULL,
        [GuarantorName] nvarchar(max) NULL,
        [ExpectedHqlaLevel] nvarchar(max) NULL,
        [Notes] nvarchar(max) NULL,
        CONSTRAINT [PK_ProdGuaranteeRefs] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ProdGuaranteeRefs_GroupLexId] ON [ProdGuaranteeRefs] ([GroupLexId]);
END
GO
IF OBJECT_ID('ProdFindingLogs') IS NULL
BEGIN
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
        CONSTRAINT [PK_ProdFindingLogs] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ProdFindingLogs_Entity_Signature] ON [ProdFindingLogs] ([Entity], [Signature]);
END
GO
IF OBJECT_ID('ProdMappingEntries') IS NULL
BEGIN
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
        CONSTRAINT [PK_ProdMappingEntries] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_ProdMappingEntries_Kind_MapKey] ON [ProdMappingEntries] ([Kind], [MapKey]);
END
"),

        ("002_documents", @"
IF OBJECT_ID('Documents') IS NULL
BEGIN
    CREATE TABLE [Documents] (
        [Id] bigint NOT NULL IDENTITY,
        [Folder] nvarchar(450) NOT NULL,
        [Title] nvarchar(max) NOT NULL,
        [FileName] nvarchar(max) NOT NULL,
        [ContentType] nvarchar(max) NOT NULL,
        [SizeBytes] bigint NOT NULL,
        [Content] varbinary(max) NOT NULL,
        [Entity] nvarchar(450) NULL,
        [Date] nvarchar(450) NULL,
        [Kind] nvarchar(max) NULL,
        [Notes] nvarchar(max) NULL,
        [UploadedBy] nvarchar(max) NOT NULL,
        [UploadedAt] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Documents] PRIMARY KEY ([Id]));
    CREATE INDEX [IX_Documents_Folder] ON [Documents] ([Folder]);
    CREATE INDEX [IX_Documents_Entity_Date] ON [Documents] ([Entity], [Date]);
END
"),

        ("003_bridge_adjustments", @"
IF OBJECT_ID('BridgeAdjustments') IS NULL
CREATE TABLE [BridgeAdjustments] (
    [Id] bigint NOT NULL IDENTITY,
    [Entity] nvarchar(200) NOT NULL,
    [FromDate] nvarchar(32) NOT NULL,
    [ToDate] nvarchar(32) NOT NULL,
    [Label] nvarchar(max) NOT NULL,
    [ImpactPp] float NOT NULL,
    [Note] nvarchar(max) NULL,
    [CreatedBy] nvarchar(max) NOT NULL,
    [CreatedAt] nvarchar(max) NOT NULL,
    CONSTRAINT [PK_BridgeAdjustments] PRIMARY KEY ([Id]));
GO
IF COL_LENGTH('BridgeAdjustments', 'FromDate') > 64
BEGIN
    DROP INDEX IF EXISTS [IX_BridgeAdjustments_Entity_FromDate_ToDate] ON [BridgeAdjustments];
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [Entity] nvarchar(200) NOT NULL;
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [FromDate] nvarchar(32) NOT NULL;
    ALTER TABLE [BridgeAdjustments] ALTER COLUMN [ToDate] nvarchar(32) NOT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BridgeAdjustments_Entity_FromDate_ToDate')
CREATE INDEX [IX_BridgeAdjustments_Entity_FromDate_ToDate]
    ON [BridgeAdjustments] ([Entity], [FromDate], [ToDate]);
"),

        ("004_large_exposures_kler", @"
IF COL_LENGTH('LargeExposures', 'CounterpartyType') IS NULL
    ALTER TABLE [LargeExposures] ADD [CounterpartyType] nvarchar(20) NULL;
IF COL_LENGTH('LargeExposures', 'DirectExposure') IS NULL
    ALTER TABLE [LargeExposures] ADD [DirectExposure] float NULL;
IF COL_LENGTH('LargeExposures', 'IndirectExposure') IS NULL
    ALTER TABLE [LargeExposures] ADD [IndirectExposure] float NULL;
IF COL_LENGTH('LargeExposures', 'CrmReduction') IS NULL
    ALTER TABLE [LargeExposures] ADD [CrmReduction] float NULL;
"),

        ("005_projects_module", @"
IF COL_LENGTH('Projects', 'Key') IS NULL ALTER TABLE [Projects] ADD [Key] nvarchar(10) NULL;
IF COL_LENGTH('Projects', 'Color') IS NULL ALTER TABLE [Projects] ADD [Color] nvarchar(10) NULL;
IF COL_LENGTH('Projects', 'Archived') IS NULL ALTER TABLE [Projects] ADD [Archived] bit NULL;
IF COL_LENGTH('Projects', 'CreatedAt') IS NULL ALTER TABLE [Projects] ADD [CreatedAt] nvarchar(40) NULL;
GO
IF COL_LENGTH('ProjectTasks', 'Number') IS NULL ALTER TABLE [ProjectTasks] ADD [Number] int NULL;
IF COL_LENGTH('ProjectTasks', 'StatusId') IS NULL ALTER TABLE [ProjectTasks] ADD [StatusId] int NULL;
IF COL_LENGTH('ProjectTasks', 'Description') IS NULL ALTER TABLE [ProjectTasks] ADD [Description] nvarchar(max) NULL;
IF COL_LENGTH('ProjectTasks', 'Priority') IS NULL ALTER TABLE [ProjectTasks] ADD [Priority] nvarchar(10) NULL;
IF COL_LENGTH('ProjectTasks', 'ParentId') IS NULL ALTER TABLE [ProjectTasks] ADD [ParentId] int NULL;
IF COL_LENGTH('ProjectTasks', 'StartDate') IS NULL ALTER TABLE [ProjectTasks] ADD [StartDate] nvarchar(16) NULL;
IF COL_LENGTH('ProjectTasks', 'DueDate') IS NULL ALTER TABLE [ProjectTasks] ADD [DueDate] nvarchar(16) NULL;
IF COL_LENGTH('ProjectTasks', 'SortOrder') IS NULL ALTER TABLE [ProjectTasks] ADD [SortOrder] float NULL;
IF COL_LENGTH('ProjectTasks', 'CreatedAt') IS NULL ALTER TABLE [ProjectTasks] ADD [CreatedAt] nvarchar(40) NULL;
IF COL_LENGTH('ProjectTasks', 'UpdatedAt') IS NULL ALTER TABLE [ProjectTasks] ADD [UpdatedAt] nvarchar(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProjectTasks_ProjectId' AND object_id = OBJECT_ID('ProjectTasks'))
    CREATE INDEX IX_ProjectTasks_ProjectId ON [ProjectTasks] ([ProjectId]);
GO
IF OBJECT_ID('ProjStatuses') IS NULL
BEGIN
    CREATE TABLE [ProjStatuses] (
        [Id] int NOT NULL CONSTRAINT PK_ProjStatuses PRIMARY KEY,
        [ProjectId] int NOT NULL,
        [Name] nvarchar(100) NOT NULL,
        [Color] nvarchar(10) NOT NULL DEFAULT '#94a3b8',
        [SortOrder] int NOT NULL DEFAULT 0,
        [IsDone] bit NULL);
    CREATE INDEX IX_ProjStatuses_ProjectId ON [ProjStatuses] ([ProjectId]);
END
GO
IF OBJECT_ID('ProjComments') IS NULL
BEGIN
    CREATE TABLE [ProjComments] (
        [Id] int NOT NULL CONSTRAINT PK_ProjComments PRIMARY KEY,
        [TaskId] int NOT NULL,
        [Author] nvarchar(200) NOT NULL,
        [Body] nvarchar(max) NOT NULL,
        [CreatedAt] nvarchar(40) NOT NULL);
    CREATE INDEX IX_ProjComments_TaskId ON [ProjComments] ([TaskId]);
END
GO
IF OBJECT_ID('ProjActivities') IS NULL
BEGIN
    CREATE TABLE [ProjActivities] (
        [Id] int NOT NULL CONSTRAINT PK_ProjActivities PRIMARY KEY,
        [TaskId] int NOT NULL,
        [Actor] nvarchar(200) NULL,
        [Type] nvarchar(30) NOT NULL,
        [FromValue] nvarchar(400) NULL,
        [ToValue] nvarchar(400) NULL,
        [CreatedAt] nvarchar(40) NOT NULL);
    CREATE INDEX IX_ProjActivities_TaskId ON [ProjActivities] ([TaskId]);
END
"),

        ("006_contacts_directory", @"
IF OBJECT_ID('Contacts') IS NULL
CREATE TABLE [Contacts] (
    [Id] int NOT NULL CONSTRAINT PK_Contacts PRIMARY KEY,
    [Name] nvarchar(200) NOT NULL,
    [Role] nvarchar(200) NULL,
    [Department] nvarchar(200) NULL,
    [Company] nvarchar(200) NULL,
    [Email] nvarchar(320) NULL,
    [Phone] nvarchar(64) NULL,
    [Topics] nvarchar(max) NULL,
    [Notes] nvarchar(max) NULL,
    [Procedure] nvarchar(400) NULL);
"),

        ("007_change_logs", @"
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
"),

        ("008_change_logs_rowkey", @"
IF COL_LENGTH('ChangeLogs', 'RowKey') IS NULL
    ALTER TABLE [ChangeLogs]
        ADD [RowKey] nvarchar(200) NOT NULL CONSTRAINT [DF_ChangeLogs_RowKey] DEFAULT '';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChangeLogs_Dataset_RowKey')
    CREATE INDEX [IX_ChangeLogs_Dataset_RowKey] ON [ChangeLogs] ([Dataset], [RowKey]);
"),

        // Period-key indexes on the two per-counterparty tables that grow with
        // every reporting date. Their Entity/Date columns were created as
        // nvarchar(max) (not indexable), so they are narrowed first — safe:
        // they only ever hold entity names and ISO dates.
        ("009_performance_indexes", @"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LargeExposures_Entity_Date')
    ALTER TABLE [LargeExposures] ALTER COLUMN [Entity] nvarchar(450) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LargeExposures_Entity_Date')
    ALTER TABLE [LargeExposures] ALTER COLUMN [Date] nvarchar(450) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LargeExposures_Entity_Date')
    CREATE INDEX [IX_LargeExposures_Entity_Date] ON [LargeExposures] ([Entity], [Date]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CounterpartyRwa_Entity_Date')
    ALTER TABLE [CounterpartyRwa] ALTER COLUMN [Entity] nvarchar(450) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CounterpartyRwa_Entity_Date')
    ALTER TABLE [CounterpartyRwa] ALTER COLUMN [Date] nvarchar(450) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CounterpartyRwa_Entity_Date')
    CREATE INDEX [IX_CounterpartyRwa_Entity_Date] ON [CounterpartyRwa] ([Entity], [Date]);
"),
    };

    public static void Apply(AppDbContext db, ILogger logger)
    {
        var conn = db.Database.GetDbConnection();
        var wasOpen = conn.State == System.Data.ConnectionState.Open;
        if (!wasOpen) conn.Open();
        try
        {
            Exec(conn, @"
IF OBJECT_ID('__SchemaMigrations') IS NULL
CREATE TABLE [__SchemaMigrations] (
    [Name] nvarchar(200) NOT NULL CONSTRAINT PK___SchemaMigrations PRIMARY KEY,
    [AppliedAt] datetime2 NOT NULL DEFAULT SYSDATETIME());");

            var applied = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT [Name] FROM [__SchemaMigrations]";
                using var rd = cmd.ExecuteReader();
                while (rd.Read()) applied.Add(rd.GetString(0));
            }

            foreach (var (name, sql) in Steps)
            {
                if (applied.Contains(name)) continue;
                try
                {
                    // Batches split on standalone GO lines, like SSMS.
                    foreach (var batch in sql.Split('\n')
                        .Aggregate(new List<string> { "" }, (acc, line) =>
                        {
                            if (line.Trim().Equals("GO", StringComparison.OrdinalIgnoreCase)) acc.Add("");
                            else acc[^1] += line + "\n";
                            return acc;
                        })
                        .Where(b => !string.IsNullOrWhiteSpace(b)))
                    {
                        Exec(conn, batch);
                    }
                    Exec(conn, $"INSERT INTO [__SchemaMigrations] ([Name]) VALUES ('{name}')");
                    logger.LogInformation("Schema migration applied: {Name}", name);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex,
                        "Schema migration {Name} failed — fix the database (the equivalent manual script is in docs/) and restart.", name);
                    throw;
                }
            }
        }
        finally
        {
            if (!wasOpen) conn.Close();
        }
    }

    private static void Exec(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = 120;
        cmd.ExecuteNonQuery();
    }
}
