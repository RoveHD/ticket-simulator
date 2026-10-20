# IT-Ticket-Simulator (Codex CLI / ChatGPT)

Systemadministrator-Training: ChatGPT simuliert über die Codex CLI eine Unternehmens-IT samt Tickets und bewertet dich.

## Start

- **Windows:** `start.cmd` doppelklicken
- **Linux/macOS:** `./start.sh`

Voraussetzungen: Node.js (LTS) und ein ChatGPT-Konto mit Codex-Kontingent. Fehlt die Codex CLI, bietet das Programm die Installation an; ist niemand angemeldet, startet es die Anmeldung.

## Hauptmenü (`sim.js`)

1. **Neues Ticket starten**: Codex mit GPT-6 Luna startet das nächste Ticket
2. **Offenes Ticket fortsetzen**: macht beim letzten Stand weiter
3. **Speedrun-Modus**: zufällige Tickets kommen während einer Schicht (60/120/240 simulierte Min.) rein, mehrere gleichzeitig; so viele wie möglich lösen. SLA je Priorität, Score + Highscore
4. **Statistik anzeigen**: lokal, kein Kontingent nötig
5. **Speedrun-Highscores**: lokal
6. **Abschlussberichte anzeigen**: lokal
7. **Modell ändern**: Standard `gpt-6-luna`, wird in `config.json` gespeichert
8. **Fortschritt sichern**: `git commit` + `git push`
9. **Beenden**

Eine Codex-Sitzung beendest du mit `/quit`, danach bist du wieder im Menü.

## Befehle im Chat

`Start` / `Nächstes Ticket` · `Fortsetzen` · `Hilfe` (kleiner Hinweis, gibt Abzug) · `Aufgeben` · `Statistik`

Im Speedrun zusätzlich: `Wechsel S03` (Ticket wechseln, 1 Min.) · `Aufgeben S03` · `Schicht beenden`

## Dateien

- `sim.js`: Hauptprogramm mit Menü
- `AGENTS.md`: Simulator-Regeln
- `stats/karriere.md`: Gesamtstatistik, wird nach jedem Ticket aktualisiert
- `stats/berichte/`: Abschlussberichte
- `stats/speedrun.md` + `stats/speedrun/`: Highscores und Speedrun-Berichte
- `.sim/intern/`: versteckte Ticketdaten (Ursache, Referenzzeit). **Nicht reinschauen**, das wäre Spoiler.

Nach jeder Session über Menüpunkt 8 sichern, sonst geht der Fortschritt verloren.
