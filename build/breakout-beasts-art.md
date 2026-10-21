# Freigestellte Tierportraits für Lord-Rahmen

Erstellt mit dem eingebauten ImageGen-Werkzeug im Edit-Modus. Jeweils das vorhandene Lord-Portrait war die Identitätsreferenz; Originalbilder bleiben unverändert. Ziel: Vordergrundmotiv mit Alpha-Kanal, damit die UI den Hintergrund still und nur das Tier animieren kann.

Alle finalen Bilder: PNG RGBA, 1086 × 1448 (3:4), Alphakanalbereich 0–255.

| Tier | Referenz | Ausgabe | ImageGen-Ergebnis |
|---|---|---|---|
| Wolf | `ui/characters/wolf-lord.png` | `ui/characters/wolf-lord-breakout.png` | `C:\Users\elias\.codex\generated_images\01a15ddf-29b8-7400-905f-f2e283fcd016\exec-0e3a0306-bb51-4648-b2cd-c4432272a49c.png` |
| Nachtwolf | `ui/characters/wolf-night-lord.png` | `ui/characters/wolf-night-lord-breakout.png` | `C:\Users\elias\.codex\generated_images\01a15ddf-29b8-7400-905f-f2e283fcd016\exec-e434a689-c331-4344-9b9a-e598770f1061.png` |
| Fuchs | `ui/characters/fox-lord.png` | `ui/characters/fox-lord-breakout.png` | `C:\Users\elias\.codex\generated_images\01a15ddf-29b8-7400-905f-f2e283fcd016\exec-da8d70ce-97ff-4fb2-b590-963251f5bd8c.png` |
| Rabe | `ui/characters/raven-lord.png` | `ui/characters/raven-lord-breakout.png` | `C:\Users\elias\.codex\generated_images\01a15ddf-29b8-7400-905f-f2e283fcd016\exec-2a632a66-a2c1-4743-821d-5c0de27b9576.png` |

## Prompts

### Wolf
Isolate only the silver-gray wolf bust with its gold crown, blue crystal armor, face, fur markings and amber eyes. Preserve identity, pose, costume, colors and lighting. Vertical 3:4 composition, fill canvas; crown/ears fully inside with slight transparent margin; chest ends at bottom edge. Genuine transparent alpha outside the complete character. Remove all background, halo, stars, crystals and particles. Keep clean fur/armor silhouette. No text or watermark.

### Nachtwolf
Isolate only the dark charcoal night-wolf bust with its gold crown, purple crystal armor, glowing violet eyes, face, fur markings, neck and shoulders. Preserve identity, costume, pose, colors and lighting. Vertical 3:4 composition, fill canvas; ears and crown fully inside with slight transparent margin; armor ends at bottom edge. Genuine transparent alpha outside the complete character. Remove all background, halo, stars, crystals and particles. Keep clean fur/armor silhouette. No text or watermark.

### Fuchs
Isolate only the orange-and-cream fox bust with its gold crown, gold/black crystal armor, green eyes, muzzle, ears, fur, neck and shoulders. Preserve the same fox identity, friendly confident expression, costume, palette and lighting. Vertical 3:4 composition, fill canvas; ears and crown fully inside with slight transparent margin; armor ends at bottom edge. Genuine transparent alpha outside the complete character. Remove all background, halo, stars, floating crystals and particles. Clean fur and armor silhouette. No text or watermark.

### Rabe
Isolate only the black raven bust with its gold crown, blue crystal armor, long beak, glowing blue eye, neck, feathers and shoulders. Preserve the same raven identity, pose, costume, blue/black/gold palette and dramatic lighting. Vertical 3:4 composition, fill canvas; crown and beak fully inside with slight transparent margin; armor ends at bottom edge. Genuine transparent alpha outside the complete bird character. Remove all background, halo, stars, floating crystals and particles. Keep individual feather and armor edges clean. No text or watermark.

## Prüfung

Alle vier Bilder visuell geprüft. Pillow bestätigt RGBA, ein transparentes Alpha-Minimum von 0 und ein opakes Maximum von 255. Der Anteil vollständig transparenter Pixel liegt je Motiv zwischen 19,33 % und 22,91 %. ImageGen teilt die Büste bis an die untere Leinwandkante ein; dadurch sind die unteren Eckpixel teilweise Teil der Schulter/Rüstung. Keine Änderung oder Entfernung an den Quellportraits vorgenommen.
