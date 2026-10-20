# IT-Ticket-Simulator (Codex CLI / ChatGPT)

Systemadministrator-Training: ChatGPT simuliert über die Codex CLI eine Unternehmens-IT samt Tickets und bewertet dich.

## Start

```bash
npm install -g @openai/codex   # einmalig
cd ticket-simulator
codex                          # mit ChatGPT-Konto anmelden
```

Dann eingeben: `Start`

Codex liest `AGENTS.md` automatisch, dort steht das komplette Regelwerk.

## Befehle im Chat

`Start` / `Nächstes Ticket` · `Hilfe` (kleiner Hinweis, gibt Abzug) · `Aufgeben` · `Statistik`

## Dateien

- `AGENTS.md`: Simulator-Regeln
- `stats/karriere.md`: Gesamtstatistik, wird nach jedem Ticket aktualisiert
- `stats/berichte/`: Abschlussberichte
- `.sim/intern/`: versteckte Ticketdaten (Ursache, Referenzzeit). **Nicht reinschauen**, das wäre Spoiler.

Nach jeder Session committen, damit der Fortschritt erhalten bleibt.
