-- K-LER import support: counterparty type on the large exposures.
-- Run ONCE in SSMS on the RegReport database. Guarded: safe to re-run.
USE RegReport;
GO
IF COL_LENGTH('LargeExposures', 'CounterpartyType') IS NULL
ALTER TABLE [LargeExposures] ADD [CounterpartyType] nvarchar(20) NULL;
GO
