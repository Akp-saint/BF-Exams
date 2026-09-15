param([string]$OutputDir = "nginx/certs")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
  -keyout "$OutputDir/resultats.local.key" `
  -out "$OutputDir/resultats.local.crt" `
  -subj "/CN=resultats.local" `
  -addext "subjectAltName=DNS:resultats.local,DNS:localhost"
Write-Output "Certificats locaux générés dans $OutputDir (ne pas utiliser en production)."
