# Realms of Shadow & Leaf

Et realtidsstrategispil i *Age of Empires II*-stil, sat i en fantasy-verden inspireret af Ringenes Herre og Warhammer Fantasy.
Spil som **Wood Elves** (Athel Loren) eller **Orcs** (Mordor / Greenskins) mod én AI-modstander.

Spillet er bygget som en ren web-app (HTML5 Canvas + JavaScript, ingen build-step, ingen eksterne biblioteker) og er designet til touch på Android-telefoner. Det kan installeres som app (PWA) direkte fra Chrome.

## Spil det på din telefon

1. Host mappen på en webserver (se nedenfor) og åbn adressen i **Chrome på Android**.
2. Tryk på menuen (⋮) → **"Føj til startskærm"** / **"Installer app"**. Spillet åbner så i fuld skærm uden browser-UI og virker offline.

### Hurtigste hosting: GitHub Pages
Repoet er klar til GitHub Pages: gå til *Settings → Pages*, vælg branch `main` og mappe `/ (root)`. Spillet ligger derefter på
`https://<brugernavn>.github.io/<repo>/`.

### Lokalt på en computer (samme wifi som telefonen)
```bash
cd Aoe-lotr
python3 -m http.server 8080
# åbn http://<computerens-ip>:8080 på telefonen
```

> Spillet skal serveres over http(s) (ikke `file://`), fordi det bruger ES-moduler og en service worker.

## Sådan spiller du
- **Træk** med én finger = flyt kameraet. **Knib** = zoom.
- **Tryk** på en enhed/bygning = markér. **Dobbelttryk** = markér alle af samme type på skærmen.
- Med enheder markeret: tryk på jorden = flyt, på en fjende = angrib, på træ/mine/bær/vildt = saml (arbejdere), på en byggeplads = byg.
- **Hold fingeren** på jorden med militær markeret = angrib-flyt. Med en bygning markeret = sæt samlingspunkt.
- Knapperne til venstre: ledig arbejder, bycenter, hele hæren, boks-markering.
- Målet: ødelæg alle fjendens bygninger.

## Indhold i v1.0
- To folk med hver 9 unikke enheder (arbejder, spejder, infanteri, skytter, kavaleri, belejring, helt) og 13 bygninger med egen grafik.
- Fire ressourcer (mad, træ, guld, sten), bær, vildt (hjorte, vildsvin), guld-/stenårer, marker med gensåning.
- Tre tidsaldre, 20 teknologier (smedje, økonomi, elite-opgraderinger, unikke teknologier).
- Procedurelt genererede kort i tre størrelser med flod, vadesteder, klipper, skove og to biomer (elverskov → ørkenlagt ødeland), kæmpeedderkopper i de mørke skove.
- Tågekrig (fog of war), minikort, tårne, helte med regeneration, angrib-flyt, samlingspunkter, kø-produktion.
- AI-modstander i tre sværhedsgrader med økonomistyring, byggerækkefølge, forskning, forsvar og angrebsbølger.
- Procedurel grafik og lyd (ingen billed- eller lydfiler), dansk/engelsk.
- Autosave (hvert 20. sekund, ved pause og når appen går i baggrunden) og "Fortsæt kamp" fra menuen.

## Struktur
```
index.html / style.css      – skærme og HUD
src/main.js                 – menu, controller (markering/kommandoer), spilløkke
src/game.js                 – simulationen (økonomi, kamp, bygninger, tåge, sejr)
src/ai.js                   – AI-modstanderen
src/render.js               – isometrisk rendering, partikler, minikort
src/sprites.js              – procedurel grafik (enheder, bygninger, træer, ikoner)
src/data.js                 – alle tal: enheder, bygninger, teknologier, tidsaldre
src/map.js / pathfinding.js – kortgenerator og A*
src/ui.js / input.js / audio.js / i18n.js
```

## Idéer til næste versioner
Flere folk (Dværge, Mennesker af Gondor, Skaven, Vampyrgrever…), mure og porte, flere AI-modstandere og holdspil, kampagne/scenarier, gem/indlæs, multiplayer.
