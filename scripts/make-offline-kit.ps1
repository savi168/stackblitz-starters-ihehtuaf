# =============================================================================
# Offline kit — makes the whole BUILD chain work without internet.
#
# The frontend part is already in the repo (vendor/npm-cache, committed):
#   npm ci --offline --cache vendor/npm-cache
#
# This script adds the .NET side on YOUR machine (needs internet ONCE):
# it mirrors every NuGet package (incl. the self-contained win-x64 runtime)
# into vendor/nuget — afterwards restore/publish work fully offline.
#
#   .\scripts\make-offline-kit.ps1
#
# vendor/nuget is gitignored (hundreds of MB): keep it on a network share or
# copy it with the repo when moving to the closed environment.
# =============================================================================
param([string]$Runtime = 'win-x64')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "1/3  Mirroring NuGet packages (incl. $Runtime runtime pack) into vendor/nuget..." -ForegroundColor Cyan
dotnet restore backend/RegReport.Api/RegReport.Api.csproj -r $Runtime --packages vendor/nuget
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed' }
dotnet restore backend/RegReport.Api/RegReport.Api.csproj --packages vendor/nuget
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore (portable) failed' }

Write-Host "2/3  Refreshing the npm offline cache (vendor/npm-cache, committed)..." -ForegroundColor Cyan
npm ci --cache vendor/npm-cache
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

Write-Host "3/3  Verifying an OFFLINE npm install works from the cache..." -ForegroundColor Cyan
Remove-Item node_modules -Recurse -Force
npm ci --offline --cache vendor/npm-cache
if ($LASTEXITCODE -ne 0) { throw 'offline npm ci failed — cache incomplete' }

Write-Host ""
Write-Host "Offline kit ready." -ForegroundColor Green
Write-Host "Without internet, from now on:"
Write-Host "  Front:   npm ci --offline --cache vendor/npm-cache   ; npm run build"
Write-Host "  Backend: dotnet restore backend/RegReport.Api/RegReport.Api.csproj -r $Runtime --packages vendor/nuget"
Write-Host "           dotnet publish backend/RegReport.Api/RegReport.Api.csproj -c Release -r $Runtime --self-contained --no-restore"
Write-Host "Keep vendor/nuget with the repo (network share / copied folder) — it is gitignored."
