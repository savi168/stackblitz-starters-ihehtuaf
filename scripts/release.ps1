# =============================================================================
# RegReport release builder — produces ONE deployable zip per version.
#
#   .\scripts\release.ps1 -Version 1.0.0
#
# Output: releases\RegReport-v1.0.0\  (folder)  +  releases\RegReport-v1.0.0.zip
# Contents: self-contained .NET API (no runtime install needed on the target),
# the built frontend served by the API itself (wwwroot), the guarded SQL
# scripts, and a VERSION.txt traceability stamp.
#
# Deploy = unzip on the target machine, put the machine's own
# appsettings.Production.local.json next to the exe (connection strings,
# Security settings), run RegReport.Api.exe (or register it as a Windows
# service — see docs/OFFLINE_DEPLOYMENT.md). No internet needed on the target.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$Version,
    # win-x64 for a classic Windows server/PC; use linux-x64 for a Linux host.
    [string]$Runtime = 'win-x64'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$publish = Join-Path $root "releases\RegReport-v$Version"
if (Test-Path $publish) { Remove-Item $publish -Recurse -Force }

Write-Host "1/5  Building the frontend (served by the API -> VITE_API_BASE_URL=/api)..." -ForegroundColor Cyan
$env:VITE_API_BASE_URL = '/api'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
Remove-Item Env:\VITE_API_BASE_URL

Write-Host "2/5  Publishing the API (self-contained $Runtime)..." -ForegroundColor Cyan
dotnet publish backend/RegReport.Api/RegReport.Api.csproj -c Release -r $Runtime --self-contained true -o $publish
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

Write-Host "3/5  Bundling the frontend into wwwroot..." -ForegroundColor Cyan
$wwwroot = Join-Path $publish 'wwwroot'
New-Item -ItemType Directory -Force $wwwroot | Out-Null
Copy-Item -Path (Join-Path $root 'dist\*') -Destination $wwwroot -Recurse -Force

Write-Host "4/5  Adding SQL scripts + version stamp..." -ForegroundColor Cyan
$sqlDir = Join-Path $publish 'sql'
New-Item -ItemType Directory -Force $sqlDir | Out-Null
Copy-Item docs\SQL_PRODUCTION_TABLES.sql, docs\SQL_MERCURY_TVFS.sql -Destination $sqlDir
$commit = (git rev-parse --short HEAD 2>$null); if (-not $commit) { $commit = 'n/a' }
@(
    "RegReport v$Version"
    "Built:  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "Commit: $commit"
    "Runtime: $Runtime (self-contained)"
) | Set-Content (Join-Path $publish 'VERSION.txt')
# Machine-specific dev overrides must never ship inside a release.
Get-ChildItem $publish -Filter 'appsettings.*.local.json' -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "5/5  Zipping..." -ForegroundColor Cyan
Compress-Archive -Path "$publish\*" -DestinationPath "$publish.zip" -Force

Write-Host ""
Write-Host "Release ready:" -ForegroundColor Green
Write-Host "  $publish.zip"
Write-Host "Tag it:  git tag v$Version; git push origin v$Version"
