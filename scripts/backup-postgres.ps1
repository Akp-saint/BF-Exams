param([string]$BackupDir = "backups")
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL est requis" }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$file = Join-Path $BackupDir ("resultats-{0}.dump" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
& pg_dump --format=custom --no-owner --file=$file $env:DATABASE_URL
Write-Output "Sauvegarde créée: $file"
