$ErrorActionPreference = "Stop"

function New-RandomSecret([int]$Length) {
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').Replace('=', 'C')
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
New-Item -ItemType Directory -Force -Path "nginx\certs" | Out-Null

if (-not (Test-Path "nginx\certs\resultats.local.crt") -or -not (Test-Path "nginx\certs\resultats.local.key")) {
  $certPath = (Resolve-Path "nginx\certs").Path
  docker run --rm -v "${certPath}:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
    -keyout /certs/resultats.local.key -out /certs/resultats.local.crt `
    -subj /CN=resultats.local -addext subjectAltName=DNS:resultats.local,DNS:localhost
  Write-Host "Certificat HTTPS local créé dans nginx\certs."
}

if (-not (Test-Path ".env")) {
  $postgresPassword = New-RandomSecret 24
  $csrfSecret = New-RandomSecret 48
  $adminPassword = New-RandomSecret 18
  @"
NODE_ENV=production
PORT=3000
POSTGRES_DB=resultats
POSTGRES_USER=resultats
POSTGRES_PASSWORD=$postgresPassword
CSRF_SECRET=$csrfSecret
PUBLIC_BASE_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.gov.bf
ADMIN_PASSWORD=$adminPassword
ADMIN_FULL_NAME=Administrateur DGEC
ADMIN_ROLE=superadmin
"@ | Set-Content -Encoding ascii ".env"
  Write-Host "Fichier .env local créé."
  Write-Host "Mot de passe initial administrateur : $adminPassword"
  Write-Host "Conservez ce mot de passe dans un gestionnaire sécurisé."
} else {
  Write-Host "Le fichier .env existe déjà ; aucun secret n'a été remplacé."
}

Write-Host ""
Write-Host "Étape suivante :"
Write-Host "  docker compose up -d --build"
Write-Host "  docker compose exec app npm run admin:create"
Write-Host ""
Write-Host "Vérification :"
Write-Host "  docker compose ps"
Write-Host "  docker compose logs -f app"
