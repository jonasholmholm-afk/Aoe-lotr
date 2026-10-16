# Billedguide (AI-genereret grafik)

Rå billeder (fra ChatGPT m.fl.) lægges i `assets/raw/` (ikke i git) og køres gennem værktøjet, som fjerner den ensfarvede baggrund, trimmer, nedskalerer og gemmer som WebP i `assets/art/` samt opdaterer `manifest.json`:

```bash
python3 -m http.server 8123 &          # værktøjet bruger spillets egen kode i en headless browser
node tools/process-art.mjs b_elves_tc assets/raw/elf-tc.png
```

Spillet indlæser filerne i `"files"` i `assets/art/manifest.json` og falder tilbage til den tegnede grafik, hvis en fil mangler. En PNG lagt direkte i `assets/art/` virker også; så fjernes baggrunden ved indlæsning.

## Fælles stilblok (sættes foran alle prompts)
> Painterly isometric real-time-strategy game sprite in the style of Age of Empires II Definitive Edition, high-fantasy Lord of the Rings / Warhammer Fantasy world. True 2:1 isometric view (camera rotated 45°, tilted about 30° down), object seen from the front-left, light from the top-left with soft shadows. Single object centered, fully visible, nothing cropped, no text, no watermark, no people. Rich detail, crisp edges, clean readable silhouette. Plain flat solid magenta background (#FF00FF).

## Filnavne
| Fil | Motiv | Bemærkning |
|---|---|---|
| `b_elves_tc.png` … `b_elves_shrine.png` | elverbygninger (tc, house, lumber, mine, mill, farm, barracks, range, stable, smith, tower, siege, shrine) | grundfladen (diamanten) skal fylde billedets bredde og røre bunden |
| `b_orcs_tc.png` … `b_orcs_shrine.png` | orkbygninger (samme roller) | samme |
| `tree_mallorn_1..4.png`, `tree_oak_1..4.png`, `tree_pine_1..4.png`, `tree_blight_1..4.png` | træer | stammen i bunden, midt i billedet |
| `node_gold.png`, `node_stone.png`, `node_berry.png`, `node_carcass.png` | ressourcer | |
| `tex_grass_elf.png`, `tex_grass_mid.png`, `tex_grass_blight.png`, `tex_dirt.png`, `tex_forest_elf.png`, `tex_forest_blight.png` | sømløse teksturer (512×512), set lige oppefra | behold baggrund (ingen fjernelse) |
| `menu_bg.png` | menubaggrund, 9:16 | behold baggrund |
| `icon_food.png`, `icon_wood.png`, `icon_gold.png`, `icon_stone.png`, `icon_pop.png` | HUD-ikoner, 128×128 | |

## Finjustering
I `manifest.json` kan hvert billede få `scale`, `dx`, `dy` (pixelforskydning) og `tolerance` (0–120, hvor meget af baggrundsfarven der fjernes).
