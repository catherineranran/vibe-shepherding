# Herding Sheep on the Ili Grassland
Made by Claude Opus 5.5.

> **vibe-shepherding** is a clone of [hyraland/shepherd](https://github.com/hyraland/shepherd) (MIT), live at **https://ranranli.net/vibe-shepherding/**.
> Differences from the original: the realistic sheep is a CGTrader model licensed to the original author only, so it isn't included here;
> the sheep in this copy are generated in code (`src/sheepProcedural.js`). To use the original model, see [CREDITS.md](CREDITS.md).
> All on-screen text is in English, and a small "credit to @hyraland" line sits at the bottom of the page.

A first-person sheep-herding scene built with three.js: an endless east–west river valley with meadows and a winding stream on the valley floor,
spruce-covered slopes on both sides, and snow mountains on the eastern horizon. Looking toward the sun, the stream flows down to a low lake far downstream,
and the lake and the stream glitter with broken gold light.
The meadow is dotted with wildflowers common on the Ili grasslands — buttercups, globeflowers, yarrow, meadow cranesbill and wild poppies — and you'll wander
through patches where one kind takes over, with bumblebees among the flowers. The wind, the stream, the buzzing and the skylarks are synthesized live; the sheep
bleats are real recordings (see CREDITS.md). Now and then a live-generated dombra küy drifts in from far away (two strings strummed together in a galloping rhythm,
the melody descending from high up, over a bowed drone).
The snow line rises and falls with the mountains: snow lingers in the gullies and rock shows on the ridges.
Realistic lighting (sun shadows, blue skylight, drifting cloud shadows), fine grass rippling under gusts of wind, and the flock gathered in front of you.
Top-right UI: instructions, credits and a music toggle.

## Run

```bash
python3 serve.py
```

- **Release** http://localhost:8000/
- **Dev** http://localhost:8000/dev.html: adds a look-tuning panel (G to show/hide; changes are written back to `tuning.json`), number keys 1–4 / M to switch sheep models, and `window.__yili` in the console. The "⋯" menu moves to the left of the panel.

three.js is loaded from a CDN, so you need to be online.

## Controls

| Input | What it does |
| --- | --- |
| Click / `+` / `Enter` | Call a sheep (up to 50) |
| Double-click / `−` / `Backspace` | Send a sheep away |
| Drag / arrow keys | Look around; by default you walk where you're looking and the flock follows |
| Space | Stop / keep walking |
| R | Switch walking mode: free roam (walk where you look) / follow a fixed loop (centered on where you are) |
| "⋯" at the top right | Instructions, credits, music on / off |
| Esc | Close the instructions / credits card and the menu |

## The endless valley

- You can keep walking along the valley (east–west) forever: terrain and trees are generated around you in 256 m chunks as you go.
- Across the valley, as you near the forested slopes on either side, your path slowly turns away along the forest edge.
- The snow mountains on the horizon are a distant ring that moves with you, like a skybox with no parallax, so you can never reach them.
- At the start you're placed near the starting point, facing downstream at a spot where you can see over the grassy slopes to the lake, with the flock in front of you.
- The lake downstream moves with you too: its near shore is always about 500 m away, so you can only gaze at it from afar. You can see it from the grassy slopes; walk into a hollow between two slopes and the slope ahead hides it.

## Dev: look-tuning panel

The panel at the top right of the dev version (`dev.html`; press **G** to show / hide) shows the frame rate at the top, followed by these groups:

- **Grass**: two-tone toggle, lit color, lit deep color (blade roots and denser tufts), shadow color, light/shadow edge, edge softness, amount of dark patches, wildflowers (0 = none), hidden hues
- **Spruce forest**: lit color, shadow color (the near trees and the forest on far slopes change together; tuned separately from the grass), hidden hues (some branches quietly switch to other hues, the same trick as the grass)
- **Sheep**: illustrated-shading toggle (off = realistic materials), lit / shadow colors, how far the shadow leans toward the grass shadow, light/shadow edge, softness,
  texture detail (0 = flat), fluffy bump, rim light, overall brightness, sunny-side boost
- **Stream & lake**: water color (the dark water bed), sky reflection, ripple fineness, sun glitter strength (stream and lake), distant glitter color (the golden light on far water toward the sun), lake color
- **Sky & sun**: sun elevation, sun azimuth (0 = west along the valley; turning the sun doesn't turn the valley), sunlight / skylight strength,
  zenith / horizon colors, horizon band height, distant haze, atmosphere, exposure (affects only the realistic parts: water, forest, mountains), bloom (the glow around the sun and the water glitter); cloud shadow cover, strength (cloud shadow is a layer between lit and shadow; 1 = as dark as cast shadows), edge softness, drift speed
- **Sound**: master volume, wind & grass, stream, sheep bleats, bumblebees, skylarks, music (0 = off), music style (dombra küy / steppe tune), "Play some music now" (for previewing)

Colors are picked as they finally appear on screen (exposure and tone mapping are compensated). Every change is saved in the browser
and, through `serve.py`, written back to **tuning.json** in the project root, which is used as the default on startup (the release version only reads it).

At the bottom of the panel are **presets**: pick one, then click "Apply this preset". "Open meadow" is bright grass and sky; "Deep blue sky" has a deeper blue sky and higher exposure. Presets don't change the sheep settings.

## Dev: comparing sheep models

- In the main scene, press number keys **1–4** to switch models, or **M** to cycle through them; you can also use `?sheep=woolly|cgtrader|dibarts|cartoon`.
  The choice is remembered in the browser, and the current model's name briefly appears at the bottom left when you switch.
- `compare.html`: the models stand side by side under the same lighting; switch between graze / look up / walk / trot.

| Key | Model | Notes |
| --- | --- | --- |
| 1 | Woolly sheep (procedural) | This clone's default sheep: a body of wool puffs, wool "trousers", drooping ears; code in `src/sheepProcedural.js` |
| 2 | Realistic Sheep · WildMesh3D (CGTrader) | The original's model, not included in this clone (see CREDITS.md). Realistic textures; the head nods / turns on its own |
| 3 | Sheep · DibArts | Low-poly (put the model in `models/` yourself) |
| 4 | Cartoon sheep · _Yen_ | Cartoon, high-poly; the head nods / turns on its own (put the model in `models/` yourself) |

All of these are static models without skeletons: the legs swing in the vertex shader in step with the gait (diagonal legs in phase), and the body sways when walking and leans forward when grazing.

## Structure

- `src/main.js`: scene setup, lighting and shadows, input (mouse / touch / keyboard), render loop; only the dev version (`window.YILI_DEV`) loads the tuning panel and model switching
- `src/walker.js`: first-person walking (walk where you look / follow a fixed loop) and the camera
- `src/flock.js`: flock behavior (gathering in front of you; grazing / travelling, following the herd, separation / alignment / cohesion; while travelling some sheep stop for a few bites, fall behind and trot to catch up, so the flock slowly churns)
- `src/sheep.js`: the sheep "rig" (posed by the flock logic) and contact shadows
- `src/sheepProcedural.js`: the procedural sheep (this clone's default look)
- `src/sheepPack.js`, `src/sheepKey.js`, `tools/pack-sheep.mjs`: encrypted packing and decrypting loader for the sheep model
- `src/sheepModels.js`: loading external glTF models, normalizing them, leg swing and head turning (when the head dips or turns, the neck stretches and bends by weight, so head and body never come apart)
- `src/grass.js`: two layers of short grass that follow the camera (grows in tufts; the two layers alternate blade by blade with no visible seam; gusts of wind roll through and bent grass catches the light; cloud shadows and sun shadows; no grass in the stream)
- `src/scenery.js`: Schrenk's spruces (procedural: slender columnar crowns; tiers of drooping branches built from crossed "branch cards" whose texture of needled twigs with ragged, light-leaking edges is painted at runtime; the whole crown is lit as one; every tree differs in height, girth and lean; replaced by a simpler version beyond 450 m; lit / shadow colors are tuned under "Spruce forest" in the panel)
- `src/terrain.js`: valley terrain and shading (forest floor; the stream's rippling reflections and sun glitter — dense fine sparkles plus a soft glow in the reflection zone, turning gold along the far light path toward the sun; natural wet banks; distant wildflowers; snow in the gullies), chunk meshes, the horizon ring, the lake downstream
- `src/world.js`: chunk management for the endless valley (terrain and trees generated as you walk; coarser meshes in the distance)
- `src/rivers.js`: analytic definition of the stream (one set of parameters shared by JS and GLSL)
- `src/sky.js`: blue sky (a light band from zenith to horizon), the sun, clouds overhead
- `src/bees.js`: bumblebees (flying between flowers near you and hovering over them)
- `src/ui.js`: the "⋯" menu at the top right, the instructions and credits cards, and the "credit to @hyraland" line
- `src/audio.js`: sound (synthesized live with Web Audio, positioned in stereo)
- `src/musicKuy.js`: background music (default) — a live-generated dombra küy: two strings tuned a fourth apart and strummed together, the melody on the upper string and an open-string drone or parallel fourths on the lower one; a galloping 2/4 pattern; D Mixolydian, with repeated motifs and sequences descending all the way back to the tonic; a bowed bass drone, with a hand drum usually joining from the second part; free-tempo intro → galloping section (theme A recurring, with B and C in between, parts linked by a bar of open-string gallop, getting a little faster) → slowing ending; each piece lasts 40–50 seconds, followed by a rest of a dozen seconds or so
- `src/musicSong.js`: alternative background music (selectable in the dev panel) — a steppe tune: dombra in a 6/8 hoofbeat rhythm with a sybyzgy-style flute melody in folk-song form (A, A′, B, A′)
- `src/flowers.js`: nearby wildflowers in five flower shapes by color (distant flowers are painted onto the ground); they bloom low in the grass and gradually dissolve into ground speckles with distance
- `src/noiseTexture.js`: a pre-baked noise texture shared by the shaders (with a matching CPU sampler, used for placing trees)
- `src/post.js`: bloom (smooth glow built from progressively scaled levels; small highlights bloom into round halos) and Khronos PBR Neutral tone mapping
- `src/config.js`: sun direction, light intensities, palette, grass two-tone defaults, the sheep limit and other parameters
- `src/devPanel.js`, `src/tuning.js`: the dev version's tuning panel and parameter storage (tuning.json; read-only in the release version)
- `src/sheepShader.js`: illustrated sheep shading (the same amount of light as the grass: sun facing × cloud shadow × cast shadow)

## License

The source code is MIT-licensed (see [LICENSE](LICENSE)). The sheep model (`assets/sheep.pack`, not included in this clone) and the sheep sounds (`assets/sounds/`) aren't covered by the MIT license; see [CREDITS.md](CREDITS.md) for their terms.
