# IT-Ticket-Simulator (Codex CLI / ChatGPT)

Systemadministrator-Training: ChatGPT simuliert über die Codex CLI eine Unternehmens-IT samt Tickets und bewertet dich.

## Start

- **Windows:** `start.cmd` doppelklicken
- **Linux/macOS:** `./start.sh`

Voraussetzungen: Node.js (LTS) und ein ChatGPT-Konto mit Codex-Kontingent. Fehlt die Codex CLI, bietet das Programm die Installation an; ist niemand angemeldet, startet es die Anmeldung.

## Hauptmenü (`sim.js`)

1. **Neues Ticket starten**: Codex mit GPT-6 Luna startet das nächste Ticket
2. **Offenes Ticket fortsetzen**: macht beim letzten Stand weiter
3. **Statistik anzeigen**: lokal, kein Kontingent nötig
4. **Abschlussberichte anzeigen**: lokal
5. **Modell ändern**: Standard `gpt-6-luna`, wird in `config.json` gespeichert
6. **Fortschritt sichern**: `git commit` + `git push`
7. **Beenden**

Eine Codex-Sitzung beendest du mit `/quit`, danach bist du wieder im Menü.

## Befehle im Chat

`Start` / `Nächstes Ticket` · `Fortsetzen` · `Hilfe` (kleiner Hinweis, gibt Abzug) · `Aufgeben` · `Statistik`

## Dateien

- `sim.js`: Hauptprogramm mit Menü
- `AGENTS.md`: Simulator-Regeln
- `stats/karriere.md`: Gesamtstatistik, wird nach jedem Ticket aktualisiert
- `stats/berichte/`: Abschlussberichte
- `.sim/intern/`: versteckte Ticketdaten (Ursache, Referenzzeit). **Nicht reinschauen**, das wäre Spoiler.

Nach jeder Session über Menüpunkt 6 sichern, sonst geht der Fortschritt verloren.
