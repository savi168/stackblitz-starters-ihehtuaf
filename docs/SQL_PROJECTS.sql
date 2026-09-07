-- ---------------------------------------------------------------------------
-- Projects module upgrade (Kanban / list / timeline, ported from "Pilote"):
--  - new columns on Projects and ProjectTasks;
--  - new tables ProjStatuses (Kanban columns), ProjComments, ProjActivities.
-- Idempotent: safe to run multiple times. Run against the RegReport database.
-- ---------------------------------------------------------------------------

-- Projects: key / color / archived / creation date -------------------------
IF COL_LENGTH('Projects', 'Key') IS NULL
    ALTER TABLE [Projects] ADD [Key] nvarchar(10) NULL;
IF COL_LENGTH('Projects', 'Color') IS NULL
    ALTER TABLE [Projects] ADD [Color] nvarchar(10) NULL;
IF COL_LENGTH('Projects', 'Archived') IS NULL
    ALTER TABLE [Projects] ADD [Archived] bit NULL;
IF COL_LENGTH('Projects', 'CreatedAt') IS NULL
    ALTER TABLE [Projects] ADD [CreatedAt] nvarchar(40) NULL;
GO

-- ProjectTasks: Kanban fields ----------------------------------------------
IF COL_LENGTH('ProjectTasks', 'Number') IS NULL
    ALTER TABLE [ProjectTasks] ADD [Number] int NULL;
IF COL_LENGTH('ProjectTasks', 'StatusId') IS NULL
    ALTER TABLE [ProjectTasks] ADD [StatusId] int NULL;
IF COL_LENGTH('ProjectTasks', 'Description') IS NULL
    ALTER TABLE [ProjectTasks] ADD [Description] nvarchar(max) NULL;
IF COL_LENGTH('ProjectTasks', 'Priority') IS NULL
    ALTER TABLE [ProjectTasks] ADD [Priority] nvarchar(10) NULL;
IF COL_LENGTH('ProjectTasks', 'ParentId') IS NULL
    ALTER TABLE [ProjectTasks] ADD [ParentId] int NULL;
IF COL_LENGTH('ProjectTasks', 'StartDate') IS NULL
    ALTER TABLE [ProjectTasks] ADD [StartDate] nvarchar(16) NULL;
IF COL_LENGTH('ProjectTasks', 'DueDate') IS NULL
    ALTER TABLE [ProjectTasks] ADD [DueDate] nvarchar(16) NULL;
IF COL_LENGTH('ProjectTasks', 'SortOrder') IS NULL
    ALTER TABLE [ProjectTasks] ADD [SortOrder] float NULL;
IF COL_LENGTH('ProjectTasks', 'CreatedAt') IS NULL
    ALTER TABLE [ProjectTasks] ADD [CreatedAt] nvarchar(40) NULL;
IF COL_LENGTH('ProjectTasks', 'UpdatedAt') IS NULL
    ALTER TABLE [ProjectTasks] ADD [UpdatedAt] nvarchar(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProjectTasks_ProjectId' AND object_id = OBJECT_ID('ProjectTasks'))
    CREATE INDEX IX_ProjectTasks_ProjectId ON [ProjectTasks] ([ProjectId]);
GO

-- ProjStatuses: Kanban columns, per project --------------------------------
IF OBJECT_ID('ProjStatuses') IS NULL
BEGIN
    CREATE TABLE [ProjStatuses] (
        [Id] int NOT NULL CONSTRAINT PK_ProjStatuses PRIMARY KEY,
        [ProjectId] int NOT NULL,
        [Name] nvarchar(100) NOT NULL,
        [Color] nvarchar(10) NOT NULL DEFAULT '#94a3b8',
        [SortOrder] int NOT NULL DEFAULT 0,
        [IsDone] bit NULL
    );
    CREATE INDEX IX_ProjStatuses_ProjectId ON [ProjStatuses] ([ProjectId]);
END
GO

-- ProjComments: task comments ----------------------------------------------
IF OBJECT_ID('ProjComments') IS NULL
BEGIN
    CREATE TABLE [ProjComments] (
        [Id] int NOT NULL CONSTRAINT PK_ProjComments PRIMARY KEY,
        [TaskId] int NOT NULL,
        [Author] nvarchar(200) NOT NULL,
        [Body] nvarchar(max) NOT NULL,
        [CreatedAt] nvarchar(40) NOT NULL
    );
    CREATE INDEX IX_ProjComments_TaskId ON [ProjComments] ([TaskId]);
END
GO

-- ProjActivities: task activity log (who changed what, when) ---------------
IF OBJECT_ID('ProjActivities') IS NULL
BEGIN
    CREATE TABLE [ProjActivities] (
        [Id] int NOT NULL CONSTRAINT PK_ProjActivities PRIMARY KEY,
        [TaskId] int NOT NULL,
        [Actor] nvarchar(200) NULL,
        [Type] nvarchar(30) NOT NULL,
        [FromValue] nvarchar(400) NULL,
        [ToValue] nvarchar(400) NULL,
        [CreatedAt] nvarchar(40) NOT NULL
    );
    CREATE INDEX IX_ProjActivities_TaskId ON [ProjActivities] ([TaskId]);
END
GO

PRINT 'Projects module schema is up to date.';
