## IT-Ticket-Simulator – portable Windows-EXE

Systemadministrator-Training: ChatGPT (GPT-6 Luna über die Codex CLI) simuliert eine Unternehmens-IT mit Tickets und bewertet dich.

### Download
- `TicketSimulator.exe`: direkt starten
- `TicketSimulator.zip`: dieselbe EXE gezippt

### Start
1. EXE in einen eigenen Ordner legen (z. B. USB-Stick) und doppelklicken. Kein Node.js nötig.
2. Fehlt die Codex CLI, lädt die EXE die portable Version (ca. 170 MB) in den Unterordner `codex\`.
3. ChatGPT-Anmeldung durchführen. Voraussetzung: ChatGPT-Konto mit Codex-Kontingent.

Die EXE ist nicht signiert, SmartScreen warnt daher: „Weitere Informationen“ → „Trotzdem ausführen“.

### Funktionen
- **Karriere-Modus:** ein Ticket nach dem anderen, Bewertung mit 100 Punkten, Level 1–6
- **Speedrun-Modus:** zufällige Tickets während einer Schicht (60/120/240 simulierte Minuten), SLA je Priorität, Highscores
- Statistik und Abschlussberichte lokal einsehbar
- Modell wählbar (Standard `gpt-6-luna`)
- Alle Daten bleiben im Ordner der EXE
