-- K-LER import support on the large exposures: counterparty type and the
-- direct / indirect / CRM decomposition.
-- Run ONCE in SSMS on the RegReport database. Guarded: safe to re-run.
USE RegReport;
GO
IF COL_LENGTH('LargeExposures', 'CounterpartyType') IS NULL
ALTER TABLE [LargeExposures] ADD [CounterpartyType] nvarchar(20) NULL;
IF COL_LENGTH('LargeExposures', 'DirectExposure') IS NULL
ALTER TABLE [LargeExposures] ADD [DirectExposure] float NULL;
IF COL_LENGTH('LargeExposures', 'IndirectExposure') IS NULL
ALTER TABLE [LargeExposures] ADD [IndirectExposure] float NULL;
IF COL_LENGTH('LargeExposures', 'CrmReduction') IS NULL
ALTER TABLE [LargeExposures] ADD [CrmReduction] float NULL;
GO
