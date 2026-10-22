# Ticket Simulator

Eine eigenständige Desktop-App als IT-Trainingsplatz mit integriertem Chat, Karriere, Speedrun-Schichten und Abschlussberichten. Die Oberfläche nutzt deine bestehende ChatGPT-Anmeldung über die lokale Codex-Komponente – wie JORY. Kein API-Key, kein Kopieren zwischen Chats und keine Terminalbedienung während der Simulation.

## Starten

- **Windows:** `start.cmd` doppelklicken. Die Desktop-App öffnet sich in einem eigenen Fenster.
- **Linux/macOS:** `./start.sh` oder `npm start`.
- **Portable Windows-Version:** `dist/TicketSimulator.exe` in einen eigenen beschreibbaren Ordner legen und starten. Node.js ist hierfür nicht nötig.

Für den Quellcode wird **Node.js 22 oder neuer** benötigt. Einmal `npm install` ausführen, danach `start.cmd` oder `npm start`. Die fertige EXE enthält Electron und braucht weder Node.js noch einen Browser. Fenster schließen beendet auch die interne Hintergrundverbindung. Eine zweite Instanz aktiviert das bereits geöffnete Fenster.

## ChatGPT-Verbindung

Die Windows-App-Komponente unter `%LOCALAPPDATA%\OpenAI\Codex\bin\<Version>\codex.exe` wird automatisch erkannt. Alternativ werden eine vorhandene portable Codex-Version und installierte CLI-Versionen gesucht. Die Anmeldung bleibt im bestehenden Konto-Speicher; die Anwendung liest keine Tokens in die Oberfläche und verwendet keine API-Keys als Ersatz.

1. In der vorhandenen ChatGPT-/Codex-App mit deinem ChatGPT-Konto anmelden.
2. Im Simulator **Einstellungen → Verbindung erneut prüfen** wählen.
3. Ein Ticket starten. Die KI-Antwort und alle weiteren Aktionen erscheinen direkt in der Simulation.

Die App muss eine lokal nutzbare Codex-Komponente und ChatGPT-Anmeldung bereitstellen. Eine reine ChatGPT-Webanmeldung reicht dafür nicht. Falls die automatische Suche eine andere Installation nicht findet, kann `CODEX_BIN` auf die vorhandene Codex-Programmdatei gesetzt werden. Es werden keine Komponenten automatisch heruntergeladen, Konten geändert oder kostenpflichtigen API-Fallbacks aktiviert. KI-Antworten nutzen das vorhandene ChatGPT-/Codex-Kontingent; die Simulationstexte werden an OpenAI übermittelt.

## Bedienung

**Navigation:** Sechs Hauptpunkte halten die obere Leiste kompakt: Leitstelle, Spielen, Fortschritt, Auswertung, Casino und Optionen. Spielen bündelt Einsatz und Speedrun; Fortschritt führt zu Missionen, Battlepass, Meisterung, Karriere und Rängen; Auswertung enthält Berichte und Rekorde. Untermenüs lassen sich mit Enter oder den Pfeiltasten öffnen und mit Escape schließen. Ein zweites Escape führt wie bisher ins Hauptmenü.

**Hauptmenü:** Beim ersten Start wählst du verpflichtend einen Begleiter. Danach führt das Spielmenü zu Karriere, Speedrun, Erfolgen und Optionen. Ein offener Einsatz wird über „Einsatz fortsetzen“ weitergeführt. Über die Navigation oder Escape außerhalb eines Eingabefelds kehrst du ins Menü zurück. Die Oberfläche verwendet einen durchgehenden 8-Bit-Arcade-Stil mit Pixelschrift, segmentierten Balken, Pixelrahmen und eigenen Basis-/Lord-Sprites für alle neun Begleiter. Der helle Modus bietet eine warme Pixelpalette.

**Musik und Effekte:** Ein eigener Happy-Funk-Loop mit synkopiertem Bass, Marimba-Melodie und synthetischer Percussion bei 114 BPM begleitet das Menü und wird im Einsatz ruhiger. Menüaktionen, neue Tickets, Abschlüsse und Rangaufstiege haben eigene Klänge. Audio startet nach der ersten Bedienung. Unter **Optionen → Audio / Mixer** lassen sich Musik und Effekte separat ausschalten und regeln; der Tonknopf schaltet alles stumm, auch während einer KI-Anfrage. Audioänderungen werden sofort gespeichert und bleiben beim Trainingsreset erhalten. Ausgeblendete/minimierte Fenster pausieren die Wiedergabe. Zusätzlich ist die bereitgestellte OGG-Datei als **Pixel Rush** unter Optionen → Audio / Mixer → Soundtrack auswählbar. Die Musikdatei liegt lokal im Spiel; es werden keine Streamingdienste genutzt. Die Quelldatei bleibt unverändert.

**Missionen, Battlepass und Sammlung:** In Karriere findest du sechs Tagesmissionen, acht Wochenmissionen und 178 dauerhafte Ziele. Tageswechsel ist um 00:00 UTC, Wochenwechsel montags um 00:00 UTC. Der kostenlose Battlepass hat 40 Stufen ohne Ablaufdatum und jetzt **80 Belohnungen**: Jede Stufe behält ihre bisherige Hauptbelohnung und erhält einen Bonus. Dazu gehören 20 ausrüstbare Extras (vier Menükulissen, vier Begleiterauren, vier Cursor-Spuren, vier Profilbanner und vier Sieges-Finisher) und 20 Arkanstaubpakete mit insgesamt 1.750 Staub. Im Profil unter **Looks & Effekte** lassen sich die Extras ansehen, ausrüsten und wieder auf Standard zurücksetzen. Vorschauen verändern keine Freischaltung. Arkanstaub wird automatisch einmalig im Spinwheel-Konto berücksichtigt, auch für bereits erreichte Passstufen. Die bisherigen Begleiter, Titel, Abzeichen und ihre IDs bleiben erhalten; neue Rahmen kommen weiterhin aus Meisterungen. Karriere-XP, Begleiter-EP, Pass-EP und Rangpunkte bleiben getrennt. Reduzierte Bewegung deaktiviert Cursor- und Siegesanimationen; aktive Spuren erzeugen nur kurzlebige, begrenzte Partikel ohne Leerlauf-Schleife.

**Charaktere und Seltenheiten:** Acht eigene Tierhelden mit jeweils eigenem Basis- und Lordbild: Schlange/Korallenviper, Wolf/Schattenwolf, Drache/Frostdrache, Sonnenfuchs und Sturmrabe. Drei Basistiere sind sofort verfügbar; zusätzliche Tiere werden auf Pass-Stufe 6, 10, 18, 26 und 34 freigeschaltet. Die Sammlung bietet Filter und ausrüstbare Porträts, Titel und Abzeichen mit den Seltenheiten Gewöhnlich, Selten, Episch, Legendär und Mythisch. Gesperrte Belohnungen sind nur als Vorschau sichtbar.

**Spinwheel-Belohnungen:** 15 gewichtete Ergebnisse umfassen Arkanstaub, die bisherigen drei Profilbelohnungen, fünf exklusive Looks & Effekte und zwei EP-Pakete. 150 Begleiter-EP werden dem beim Dreh gewählten Tier gutgeschrieben; 250 Pass-EP erhöhen den Battlepassfortschritt. Ist der Pass bereits auf Stufe 40, gibt dieses Paket stattdessen 150 Begleiter-EP. Gewinne sind sofort dauerhaft gespeichert; ein erneuter Request mit derselben ID oder Neuladen vergibt keine zweite Belohnung. Das Rad benötigt eine abgeschlossene Begleiterwahl. Alte Spin-Belege und Gewinne bleiben gültig. Rangpunkte, technische Bewertung und gelöste Fallzahlen werden nicht verändert.

**Begleiter und Profil:** Schlange, Wolf oder Drache begleiten dich ab der verpflichtenden Erstwahl. Nur der im Einsatz ausgewählte Begleiter erhält dessen EP: 100 pro gelöstem Fall, bei passenden Fachgebieten +50 %. Es gibt keine spielerische Levelobergrenze. Die Kosten steigen: Stufe 2 braucht insgesamt 600 EP, Stufe 10 16.200 EP und Stufe 20 62.700 EP (418–627 gelöste Fälle). Ab Stufe 20 kannst du zwischen Einsätzen die Tierart wechseln und danach weiterleveln; Formen derselben Tierart bleiben wählbar. Jeder Begleiter behält seinen Fortschritt. Das große Portrait links unten und das Profil oben rechts öffnen die Auswahl für Titel, Abzeichen und Form.

**Fachmeisterung:** DNS, DHCP, Backup, Identität, Netzwerk, Security, Cloud, Virtualisierung, Storage, Clients und Plattformdiagnose zählen tatsächlich gelöste Fälle ihrer bekannten Fallfamilien. Titel und Abzeichen nutzen deinen gemeinsamen Fachfortschritt. Bilder und Formen verdient jedes Tier separat durch Einsätze mit diesem Begleiter: Lord 50 Lösungen/10 auf Stufe 4+, Silber-Lord 100/25, Ultimativer Gold-Lord 200/60, Ewiger Lord 1.000/400 und Astral-Lord 2.500/1.000. Das Basistier muss ebenfalls freigeschaltet sein. Die Tierauswahl unter Meisterung zeigt Porträts und eigene Zähler; sie wechselt nicht den aktiven Begleiter. Speedruns zählen erst nach Schichtende anhand tatsächlich gelöster Tickets. Alte Fälle ohne gespeicherte Tierzuordnung werden keinem Tier zugeschrieben. Beim Umstieg bleiben bereits verdiente Formen und belegte Level erhalten. Training zurücksetzen setzt auch Missionen, Pass, Meisterungen und Sammlung zurück und erstellt vorher eine Sicherung.

**Neue Fachgebiete:** Linux hat eine eigene Meisterung; bereits gespeicherte, gelöste Linux-Fälle zählen zusätzlich zu ihren bisherigen Fachgebieten. Hardwarediagnose & Reparatur sowie Hardwareberatung & Verkauf haben eigene Missionen, Titel, Abzeichen und persönliche Begleiterzähler. Linux gibt Wolf/Rabe den Fachbonus, Reparatur Drache und Beratung Schlange/Fuchs; verwandte Begleitervarianten haben dieselben Boni. Pro Lösung wird höchstens ein Fachbonus vergeben.

**Hardwarefälle:** Auf allen sechs Stufen gibt es physische Defekte und Beschaffungsaufträge. Reparaturfälle trainieren Eingrenzung, Daten- und Geräteschutz, Ersatzteilwahl, Garantieabwicklung und abschließende Funktionsprüfung. Beratung trainiert Bedarfsklärung, Preis-Leistung, Reparatur gegen Aufrüstung/Neukauf, Kompatibilität und Folgekosten. Mindestens drei vorab festgelegte Angebote mit **simulierten Trainingspreisen in EUR** ermöglichen eine begründete Empfehlung und ein konkretes Abraten. Die Preise sind fiktive Angebote mit Preisstand und klarer Netto-/Bruttobasis, keine aktuellen Marktpreise. Die Engine gibt keine automatische Kaufempfehlung; der Spieler entscheidet und lässt seine geprüfte, dokumentierte Entscheidung vom Auftraggeber bestätigen. Auch eine begründete Nichtkaufempfehlung kann den Auftrag lösen. Es findet kein echter Kauf statt.

**Technikberatung:** Zur Meisterung Hardwareberatung & Verkauf gehören auch Fernseher, Beamer und Streaming, Handys/Tablets, Router und Heimnetz, Gaming-PCs/Konsolen, Kopfhörer/Audio, Smartwatches, Smart Home, Foto/Video/Heimkino, Haushaltsgeräte/Ladetechnik sowie Drucker, 3D-Druck und Werkstatttechnik. Zwölf zusätzliche Fallfamilien decken diese Produkte, vernetzte Gesamtsysteme und barrierearme Technik ab. Beratungen können für Privatkunden, Haushalte, Vereine oder Unternehmen stattfinden. Die Kriterien passen zum Gerät: etwa verbleibende Sicherheitsupdates und Tarifkosten beim Handy, Anschlussart und realistischer Durchsatz beim Router oder Empfang, Raum, Apps und HDMI-Funktionen beim Fernseher. Empfehlungen und Abraten beziehen sich auf konkrete Anforderungen und Angebote, einschließlich Zubehör, Abos, Reparatur, Refurbished und Mehrjahreskosten. Weitere technische Geräte können innerhalb einer passenden Produktfamilie beraten werden.

**Fallvielfalt:** 78 Themenfamilien enthalten mindestens sechs kuratierte Hauptursachen. Levelgerechte Auslöser, Symptome und Auswirkungen ergeben über 22.000 Kombinationen. Die Planung wählt zufällig und berücksichtigt die vollständige gespeicherte Variantenhistorie auch nach Neustarts; ungenutzte Kombinationen derselben Schwierigkeitsstufe gehen vor Wiederholungen. Erst nach vollständiger Ausschöpfung des jeweiligen Katalogs beginnt eine kontrollierte Rotation. Die KI formuliert den konkreten Fall innerhalb der festgelegten Unternehmensumgebung; technischer Schwerpunkt und einzelne Formulierungen können sich weiterhin ähneln.

**Spielansichten:** Alle Bereiche teilen die Gestaltung des Hauptmenüs. Die Spielnavigation führt zu Einsatz, Speedrun, Karriere und Optionen. Im Einsatz zeigen Statusleiste und Mitarbeiterkarte den aktuellen Fall. Aktionen und Befehle werden direkt eingegeben und mit Enter oder „Aktion ausführen“ gesendet. Eigene Entwürfe bleiben erhalten. Die Speedrun-Auswahl nutzt Karten für Schichtdauer und sechs Schwierigkeitsgrade.

**Abschlussanimationen:** Siege und Niederlagen haben eigene Ergebnisbildschirme mit hochzählender Bewertung, XP-Zuwachs, Rangfortschritt, Partikeln und gestaffelten Freischaltungen. Die Animationen verändern keine gespeicherten Werte und vergeben keine doppelten Belohnungen. Die Betriebssystem-Einstellung „Bewegung reduzieren“ wird respektiert.

**Spielgefühl:** Abgeschlossene Einsätze bringen XP, eine Erfolgsserie und dauerhafte Missionen. Rangpunkte werden separat bewertet. Bei Abschluss zeigt die App Bewertung, XP und neu freigeschaltete Erfolge. Die XP werden aus gespeicherten UI-Berichten berechnet und sind vom fachlichen Karrierelevel getrennt. Alte reine Markdown-Berichte erhalten keine geschätzten XP. Ein Trainingsreset setzt auch XP und Missionen zurück.

**Schwierigkeit:** Die sechs Stufen haben je zwölf bis vierzehn Szenariofamilien. Ab Stufe 4 kommen Linux-Fälle hinzu, von systemd und Dateirechten bis zu Container-Netzen, HA und Wiederanlauf. Hardwaredefekte und Beschaffungsberatung gibt es auf jeder Stufe. Stufe 1 behandelt überschaubare Arbeitsplatzfälle; Stufe 6 verlangt die Diagnose einer komplexen Infrastrukturkette mit mehreren plausiblen Hypothesen, korrelierten Befunden und sicherem Wiederanlauf beziehungsweise eine kritische Beschaffungsplanung mit Migration und Mehrjahreskosten. Die Auswahl vermeidet zuletzt verwendete Szenarien. Die KI erzeugt konkrete Varianten mit unterschiedlichen Mitarbeitern und Abteilungen. Bereits laufende Tickets behalten ihre festgelegte Ursache und Schwierigkeit.

**Speedrun-Leitstelle:** Neue Tickets erscheinen nach Aktionen entsprechend der simulierten Schichtzeit als Meldungen. Ist die Warteschlange leer, springt **„Auf nächste Meldung warten“** bis zum nächsten geplanten Eingang oder zum Schichtende. Das erhöht ausschließlich die Wartezeit; ein neu eingehendes Ticket wird ohne zusätzliche Wechselminute geöffnet. Neue Schichten enthalten auch bei großen Zufallsabständen mindestens drei Meldungen. Bestehende Ankunftspläne bleiben unverändert. Die Liste zeigt Mitarbeiter, Abteilung, Priorität, Status und SLA; sie lässt sich durchsuchen und nach Priorität, Wartezeit, SLA, Eingang, Mitarbeiter oder Abteilung sortieren. „Übernehmen“ wechselt das aktive Ticket und kostet eine simulierte Minute. Angefangene Textentwürfe bleiben beim Wechsel innerhalb der geöffneten App pro Ticket erhalten. Neue Ankünfte unterbrechen das aktuelle Ticket nicht. Bei alten Spielständen ohne strukturierte Ticketliste werden fehlende Angaben beim nächsten Simulationszug ergänzt.

**Rangsystem:** Jeder der sechs Einsatzränge hat drei Stufen: IT-Support 1 → 2 → 3 → Fortgeschrittener IT-Support 1 und so weiter bis Infrastruktur-Experte 3. Die Karriere beginnt bei IT-Support 1 mit 0 RR. Je 100 RR steigst du eine Stufe auf; bei Verlust unter die Grenze geht es sofort zurück. Die Ticketstufe bleibt innerhalb eines Hauptrangs gleich und steigt erst beim nächsten Hauptrang. Gute Leistungen bringen Rangpunkte; aktive Arbeitszeit über Referenz, unnötige Prüfungen und Fehländerungen kosten Punkte. Auf den ersten drei Haupträngen gibt es ab 70 Punkten einen Einstiegsbonus und kleinere Abzüge. Perfekte Fälle bringen dort maximal +33/+25/+18 RR; das Verlustlimit beträgt 12/20/30 RR. Vier saubere Supportfälle mit je 95 Punkten innerhalb der Referenzzeit reichen von 0 RR für IT-Support 2. Ab Hauptrang 4 gelten maximal +10/+9/+7 RR und 59/73/92 RR Verlust. Die Faktoren richten sich nach dem Hauptrang, nicht nach den 18 Einzelstufen. Alte Abschlüsse behalten ihre Regelversion; ein alter Spielstand übernimmt seinen Hauptrang, Stufe 1 und seine lokalen RR. Ein bereits vollendeter Maximalrang bleibt vollendet. Speedruns verändern den Rang nicht. **Trainingsdaten zurücksetzen** beginnt nach Bestätigung wieder mit Ticket #1001, IT-Support 1, 0 RR und neuer Begleiterwahl; Anmeldung, Modell, Darstellung und Audio bleiben erhalten.

Vor jedem Reset wird der bisherige UI-Spielstand unter `.sim/backups/before-reset-*.json` gesichert. Zur Wiederherstellung die App schließen, die aktuelle `.sim/ui-state.json` separat sichern und durch die gewünschte Sicherungsdatei ersetzen. Alte Terminal-Dateien bleiben erhalten, werden nach dem Reset jedoch nicht mehr in den UI-Spielstand eingebunden; der Reset gilt für die Desktop-/Web-Oberfläche.

- **Übersicht:** echter lokaler Fortschritt und Einstieg in die Trainingsmodi.
- **Simulation:** Aktionen oder simulierte Befehle eingeben. Enter sendet, Shift+Enter fügt eine Zeile ein. Abbrechen verwirft die laufende Antwort und erhält den letzten bestätigten Spielstand.
- **Speedrun:** 60, 120 oder 240 simulierte Minuten, Level 1–6. Neue Tickets erscheinen während der Schicht. `Wechsel S03`, `Aufgeben S03` und `Schicht beenden` werden im Chat verarbeitet.
- **Karriere:** Rangpunkte, Statistik, Missionen, Battlepass und Fachmeisterschaften. Speedruns beeinflussen das Karriere-Level nicht.
- **Berichte:** gespeicherte Auswertungen abgeschlossener Einsätze.
- **Einstellungen:** ChatGPT-Verbindung prüfen und ein für dein Konto verfügbares Modell wählen. Standard ist `gpt-6-luna`.

Ein laufender Einsatz wird nicht durch einen neuen überschrieben. Nach Neustart über **Simulation** fortsetzen. „Hinweis anfordern“ zählt als Hilfe; „Einsatz aufgeben“ beendet die Simulation mit einer Auswertung.

Verständliche Prüfaufträge in Alltagssprache funktionieren ebenfalls, etwa „schauen, ob der betroffene User gesperrt ist“. Ursache, Referenzzeit und ursprüngliche Konfiguration bleiben im Spielstand fest gespeichert; die KI liefert bei Folgeaktionen nur Änderungen am Simulationszustand. Die Darstellung lässt sich unter **Einstellungen → Darstellung** zwischen Dunkel und Hell umstellen und bleibt gespeichert.

## Spielstände und Sicherheit

Die Desktop-App speichert neben der portablen EXE (im Quellbetrieb im Projektordner) atomar in **`.sim/ui-state.json`**: Verlauf, festgelegte interne Umgebung, Ticketursachen, Zeiten und Berichte. Vorab festgelegte Ursachen und Referenzzeiten dürfen sich während eines Tickets nicht ändern. Interne Daten werden nicht über die Browser-API ausgeliefert. Die KI ist zusätzlich angewiesen, im öffentlichen Text keine vorzeitigen Lösungen zu verraten; wie bei jeder KI-Simulation lässt sich die inhaltliche Befolgung nicht vollständig technisch garantieren.

Vorhandene `stats/karriere.md`, `stats/berichte/*.md` und Speedrun-Berichte werden angezeigt und bleiben unverändert. Alte CLI-Sitzungen in `.sim/intern/` und neue GUI-Sitzungen sind getrennte Spielstände; offene CLI-Tickets lassen sich weiter mit `node sim.js` fortsetzen. Solange eine alte CLI-Sitzung offen ist, blockiert die GUI den Start eines neuen Einsatzes. Für eine Sicherung `.sim/` und `stats/` kopieren. Die GUI führt keine Git-Commits oder Pushes aus.

Alle eingegebenen Systembefehle sind **Simulationsdaten**. Die KI läuft ohne Shell-, Browser-, Plugin- oder App-Werkzeuge in einem isolierten temporären Arbeitsverzeichnis. Die HTTP-API verwendet einen Sitzungstoken, Host-/Origin-Prüfungen und eine feste Liste öffentlicher Dateien. Nur den Simulator lokal öffnen; es ist kein Mehrbenutzerserver.

## Entwicklung und Build

```sh
npm start
npm test
npm run build
```

`npm run build` erstellt die portable Windows-Desktop-App `dist/TicketSimulator.exe` mit Electron und eigenem App-Icon. Die EXE ist nicht signiert. GitHub Actions führt Tests aus und baut bei relevanten Änderungen; die lokale Arbeit veröffentlicht nichts automatisch.

- `ui/`: Oberfläche ohne Framework und externe Schrift-/Bildabfragen.
- `server/index.js`: lokale HTTP-API und Sessionverwaltung.
- `server/codex.js`: App-Erkennung, ChatGPT-Verbindungsprüfung und isolierte KI-Ausführung.
- `server/simulation.js`: Antwortschema, Validierung, Persistenz und Simulatoradapter.
- `electron/main.cjs`: Desktop-Fenster, isolierte Darstellung, Instanzschutz und geordnetes Beenden.
- `launch.js`: Start der Desktop-App aus dem Quellcode.
- `sim.js`: weiterhin verfügbares ursprüngliches CLI-Menü.
- `AGENTS.md`: unveränderte Spielregeln.

`npm test` prüft Backend und Speicherung mit temporären Daten und simulierten KI-Antworten. `npm run test:desktop` startet zusätzlich das echte Electron-Fenster unsichtbar in einem isolierten Testverzeichnis, kontrolliert Darstellung und Renderer-Isolation und prüft, dass die Hintergrundverbindung beim Beenden geschlossen wird.


### Arcane Arcade (1.7.3)

Im Hauptmenü und in der Spielnavigation findest du das Arcane Casino und die lokale Bestenliste. Das Spinwheel kostet 100 Arkanstaub: 300 gibt es zum Start, 40 pro gelöstem Karrierefall (+10 bei sauberer Lösung) und 20 pro gelöstem Speedrun-Ticket. Die 15 veröffentlichten Gewinnchancen summieren sich auf 100 %. Exklusive Titel, Abzeichen und Looks & Effekte erscheinen nach dem Gewinn im Profil; Duplikate geben 150 Staub. Der Spielstand speichert Spins und Belohnungen atomar.

Die Bestenliste enthält deine echten lokalen Einsätze. Karriere und Speedruns sind getrennt; 60-, 120- und 240-Minuten-Schichten werden separat verglichen. Gleiche Punktzahlen teilen denselben Platz.

Neue arkan klingende Sounds werden lokal synthetisiert. Audio bleibt über die Optionen regelbar; kurze Runenpartikel pausieren bei ausgeblendeter App und werden bei reduzierter Bewegung unterdrückt.
