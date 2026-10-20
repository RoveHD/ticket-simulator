# Startbildschirm IT-Ticket-Simulator (Codex CLI / ChatGPT)
$Model = if ($env:SIM_MODEL) { $env:SIM_MODEL } else { "gpt-6-luna" }  # ChatGPT 6 Luna (offizielle ID)

Set-Location $PSScriptRoot
Clear-Host
Write-Host "=============================================="
Write-Host "   IT-TICKET-SIMULATOR - Sysadmin Career Mode"
Write-Host "=============================================="
Write-Host "Modell: $Model`n"

function Fehler($msg) { Write-Host "`nFEHLER: $msg`n" -ForegroundColor Red; Read-Host "Enter zum Beenden"; exit 1 }

# 1) Node/npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fehler "Node.js/npm fehlt. Installieren: https://nodejs.org (LTS), danach erneut starten."
}

# 2) Codex CLI
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Host "Codex CLI ist nicht installiert." -ForegroundColor Yellow
  Write-Host "Benoetigt: Codex CLI + ChatGPT-Konto mit Codex-Kontingent (z. B. Plus/Pro/Business)."
  $a = Read-Host "Jetzt installieren (npm install -g @openai/codex)? [j/N]"
  if ($a -notmatch '^[jJyY]$') { Fehler "Abgebrochen - ohne Codex CLI kein Simulator." }
  npm install -g @openai/codex
  if ($LASTEXITCODE -ne 0) { Fehler "Installation fehlgeschlagen." }
}

# 3) Anmeldung
codex login status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nicht bei ChatGPT angemeldet. Anmeldung startet ..." -ForegroundColor Yellow
  codex login
  if ($LASTEXITCODE -ne 0) { Fehler "Anmeldung fehlgeschlagen." }
}

# 4) Statistik-Kurzinfo
if (Test-Path stats/karriere.md) {
  Select-String -Path stats/karriere.md -Pattern "Aktuelles Level|Ticketnummer|Abgeschlossene Tickets|Durchschnittliche Punktzahl" |
    ForEach-Object { ($_.Line -replace '^\|\s*','' -replace '\s*\|\s*$','' -replace '\s*\|\s*',': ') }
  Write-Host ""
}

Write-Host "Hinweis: Jede Antwort verbraucht Codex-Kontingent. Ist es aufgebraucht,"
Write-Host "meldet Codex ein Limit - dann spaeter fortsetzen (Fortschritt bleibt gespeichert).`n"
Read-Host "Enter = Simulation starten"

codex -m $Model "Start"
