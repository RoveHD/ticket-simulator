#!/usr/bin/env bash
# Startbildschirm IT-Ticket-Simulator (Codex CLI / ChatGPT)
MODEL="${SIM_MODEL:-gpt-6-luna}"   # ChatGPT 6 Luna (offizielle ID)

cd "$(dirname "$0")" || exit 1
clear
cat <<'BANNER'
==============================================
   IT-TICKET-SIMULATOR – Sysadmin Career Mode
==============================================
BANNER
echo "Modell: $MODEL"
echo

fehler() { echo; echo "❌ $1"; echo; exit 1; }

# 1) Node/npm
if ! command -v npm >/dev/null 2>&1; then
  fehler "Node.js/npm fehlt. Installieren: https://nodejs.org (LTS), danach erneut starten."
fi

# 2) Codex CLI
if ! command -v codex >/dev/null 2>&1; then
  echo "⚠️  Codex CLI ist nicht installiert."
  echo "   Benötigt wird: Codex CLI + ChatGPT-Konto mit Codex-Kontingent (z. B. Plus/Pro/Business)."
  read -rp "   Jetzt installieren (npm install -g @openai/codex)? [j/N] " a
  [[ "$a" =~ ^[jJyY]$ ]] || fehler "Abgebrochen – ohne Codex CLI kein Simulator."
  npm install -g @openai/codex || fehler "Installation fehlgeschlagen."
fi

# 3) Anmeldung
if ! codex login status >/dev/null 2>&1; then
  echo "⚠️  Nicht bei ChatGPT angemeldet. Anmeldung startet …"
  codex login || fehler "Anmeldung fehlgeschlagen."
fi

# 4) Statistik-Kurzinfo
if [[ -f stats/karriere.md ]]; then
  grep -E "Aktuelles Level|Nächste Ticketnummer|Abgeschlossene Tickets|Durchschnittliche Punktzahl" stats/karriere.md \
    | sed -E 's/^\| *//; s/ *\| */: /; s/ *\|$//'
  echo
fi

echo "Hinweis: Jede Antwort verbraucht Codex-Kontingent. Ist es aufgebraucht,"
echo "meldet Codex ein Limit – dann später fortsetzen (Fortschritt bleibt gespeichert)."
echo
read -rp "Enter = Simulation starten … " _

codex -m "$MODEL" "Start"
