# Pixel-Arcade-Stil 1.7.0

Nutzerbriefing: Das gesamte Spiel soll wie die bereitgestellten 8-Bit-Referenzen aussehen. Die Referenzen zeigen segmentierte Statusbalken, einen Retro-Arcadeautomaten und Pixelchips. Motiv, Fortschritt und Spielablauf bleiben erhalten.

## Gestaltung und gespeicherte Assets

- `ui/pixel.css`: gemeinsame Palette in Dunkelviolett, Creme, Korallrot, Türkis und Gold; kantige Konturen und Schatten; segmentierte Fortschrittsbalken; gestufte Animationen; heller Pixelmodus.
- `ui/menu.js`: eigener Arcade-Automat als SVG mit ganzzahligen Pixelkoordinaten, ohne Verwendung des Casino-Referenzbildes als Spielinhalt.
- `ui/app.js` und `ui/progression.js`: Pixel-Icons, Rangwappen und 16 verschiedene Pixel-Abzeichen. Die Grafiken werden als kleine gefüllte SVG-Blöcke erzeugt.
- `ui/characters/pixel-atlas-a.png`: Schlange und Wolf, oben Basis-/unten Lord-Formen.
- `ui/characters/pixel-atlas-b.png`: Drache und Korallenviper, gleiche Anordnung.
- `ui/characters/pixel-atlas-c.png`: Fuchs und Schattenwolf, gleiche Anordnung.
- `ui/characters/pixel-atlas-d.png`: Sturmrabe und Frostdrache, gleiche Anordnung.
- `ui/characters/pixel-atlas-secret.png`: geheimer Begleiter, Basis links und Lord rechts. Server und UI sperren das Bild vor seiner Freischaltung. Getrennte CSS-Silhouetten schneiden die Figuren aus dem Atlas aus.
- `assets/icon.png` und `assets/icon.ico`: Pixelvariante des bestehenden T-Appzeichens, generiert durch `build/create-icon.js`.

Die fünf Rasterbilder wurden mit dem integrierten ImageGen-Werkzeug erstellt. Die Originalporträts bleiben erhalten. Die UI zeigt die Atlaszellen über CSS-Ausschnitte; die PNG-Dateien wurden nicht nachträglich zerteilt oder per Script pixelisiert. Exakte Bildprompts, Referenzen, Ergebnisse und die Korrekturversuche am Secret-Atlas stehen in [pixel-art-a.md](pixel-art-a.md) und [pixel-art-b.md](pixel-art-b.md).

## Schrift

`ui/fonts/pixel-arcade.ttf` ist die unveränderte Silkscreen-Regular-Schrift, lokal eingebunden unter dem CSS-Alias „Pixel Arcade“. Originalquelle: https://github.com/google/fonts/tree/main/ofl/silkscreen. Copyright: The Silkscreen Project Authors. Die SIL Open Font License 1.1 liegt unter `ui/fonts/OFL-Silkscreen.txt` bei. Tickettexte nutzen eine gut lesbare System-Monospace-Schrift. Im Betrieb sind keine Font-CDNs oder weiteren Webdienste nötig.
