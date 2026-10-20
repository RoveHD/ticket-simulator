# IT-Ticket-Simulator (Codex CLI / ChatGPT)

Systemadministrator-Training: ChatGPT simuliert über die Codex CLI eine Unternehmens-IT samt Tickets und bewertet dich.

## Start

- **Windows:** `start.cmd` doppelklicken
- **Linux/macOS:** `./start.sh`

Der Startbildschirm prüft Node.js, Codex CLI (bietet Installation an) und ChatGPT-Anmeldung, zeigt den Karrierestand und startet dann mit Modell **ChatGPT 6 Luna** (`gpt-6-luna`).
Voraussetzung: ChatGPT-Konto mit Codex-Kontingent. Anderes Modell: Umgebungsvariable `SIM_MODEL` setzen.

Codex liest `AGENTS.md` automatisch, dort steht das komplette Regelwerk.

## Befehle im Chat

`Start` / `Nächstes Ticket` · `Hilfe` (kleiner Hinweis, gibt Abzug) · `Aufgeben` · `Statistik`

## Dateien

- `AGENTS.md`: Simulator-Regeln
- `stats/karriere.md`: Gesamtstatistik, wird nach jedem Ticket aktualisiert
- `stats/berichte/`: Abschlussberichte
- `.sim/intern/`: versteckte Ticketdaten (Ursache, Referenzzeit). **Nicht reinschauen**, das wäre Spoiler.

Nach jeder Session committen, damit der Fortschritt erhalten bleibt.
