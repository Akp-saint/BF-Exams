param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL est requis" }
& pg_restore --clean --if-exists --no-owner --dbname=$env:DATABASE_URL $BackupFile
Write-Output "Restauration terminée: $BackupFile"
