# Pardigon

#### Current version: v0.7.0

Procedural cinematic grain for the web.

Pardigon is a small TypeScript and WebGL2 library that adds texture and atmosphere to websites. A GLSL shader generates the grain on the GPU in real time, without image textures, videos or CPU pixel generation.

[Explore the live demo](https://pardigon.vercel.app)

## Why Pardigon

After ten years as an art director, I know how easily digital images can feel too clean.

A subtle layer of grain can make a visual feel more organic and interesting. I built Pardigon to bring that material quality to websites and web applications, with direct control over the grain's size, strength, colour, detail and movement.

The library stays small and leaves the final look to the person using it.

## About the name

Pardigon is named after [*Après-midi à Pardigon*](https://www.musee-orsay.fr/en/artworks/apres-midi-pardigon-151), a 1907 painting by French Neo-Impressionist artist Henri-Edmond Cross.

Cross built the landscape from separate touches of colour that come together in the eye. Pardigon follows a similar principle: many small variations become one texture. The painting's light and Mediterranean atmosphere also shaped the visual direction of the project.

## Creative direction and process

Visual tests shaped Pardigon from the start. Each shader change had to improve the material on screen and stay practical on a full-size website.

An early version of Fog simply renewed the noise after a set interval. The result resembled pixels being replaced. Fog needed to travel through the image, so I redirected the animation toward translation on the X and Y axes while the noise continued to change shape. Film grain kept its position and renewed its structure. Those two behaviours became `evolve` and `flow`.

Large blurred grain exposed another problem. It became a soft mass of digital blocks with very little structure. That test led to `complexity`, which adds secondary detail, and `character`, which creates clusters and calmer areas without using a texture or another render pass.

The timing also needed to match the material. Running every effect at 30 or 60 FPS made the 8mm preset feel too modern. Pardigon now controls its rendering cadence independently from the screen, with 8mm set to 12 FPS and 16mm set to 14 FPS.

I used AI assistance to help write and iterate on the TypeScript, WebGL2 and GLSL implementation. I chose what Pardigon should do, set its technical limits, reviewed the noise in motion, tested it on desktop and iPhone, and tuned the presets. Those browser tests decided which changes stayed.

## Highlights

- Procedural WebGL2 grain
- Custom grain colour
- Five backdrop blend modes
- Fullscreen and local element overlays
- Separate `evolve` and `flow` animation modes
- Adjustable detail, clustering and continuity
- Film-style exposure flicker
- Procedural film dirt
- Independent animation speed and frame rate
- Live updates without restarting the renderer
- Automatic quality based on frame stability
- Mobile resolution and frame-rate limits
- Automatic pause for hidden pages and off-screen targets
- Reduced-motion support
- WebGL context recovery
- No runtime dependencies

## Install

Pardigon is currently installed directly from GitHub:

```bash
npm install github:quentinecrepont/Pardigon
```

The package is not published on npm yet.

## Quick start

Pardigon runs in the browser, uses ES modules and requires WebGL2. Call `createGrain()` on the client after the DOM is available.

```ts
import { createGrain } from "pardigon";

const grain = createGrain({
  target: document.body,
  preset: "8mm",
  quality: "auto",
  respectReducedMotion: true,
});
```

Every option is optional. `target` defaults to `document.body`, while explicit values override the selected preset.

## Choose a preset

Pardigon includes six starting points:

- `8mm` for coarse, low-frame-rate film grain
- `16mm` for slightly finer film grain
- `35mm` for subtle, detailed film grain
- `paper` for a static organic texture
- `pixel` for hard digital noise
- `fog` for large, soft layers in motion

Use one directly:

```ts
createGrain({ target: document.body, preset: "16mm" });
```

Preset names are lowercase in the API. Their values can also be imported and changed directly:

```ts
import { createGrain, grainPresets } from "pardigon";

createGrain({
  target: document.body,
  ...grainPresets.fog,
  speed: 0.7,
});
```

## Simple adjustments

A preset can be adjusted with a few familiar controls:

```ts
createGrain({
  target: document.body,
  preset: "35mm",
  intensity: 0.04,
  color: "#4b8dff",
  animated: true,
});
```

When the effect is optional, check for WebGL2 first:

```ts
import { createGrain, isWebGL2Supported } from "pardigon";

if (isWebGL2Supported()) {
  createGrain({ target: document.body, preset: "35mm" });
}
```

## Advanced controls

Advanced settings provide more control over structure, timing and movement. Any HTML element can become a local grain surface:

```ts
createGrain({
  target: document.querySelector("#grain-preview") as HTMLElement,
  intensity: 0.03,
  color: "#ffffff",
  blendMode: "soft-light",
  size: 128,
  blur: 1,
  complexity: 0.42,
  character: 0.7,
  continuity: 0.8,
  flicker: 0.25,
  dirt: 0.2,
  animated: true,
  speed: 1.2,
  fps: 60,
  animationMode: "flow",
});
```

## Animation

`evolve` creates new grain states without moving the noise field. It suits film grain. `flow` moves the field across the X and Y axes while its shapes evolve, which works better for fog and atmospheric textures.

`fps` sets the grain's temporal frame rate independently from the screen. Lower values create a more stepped rhythm. Wider viewports can render up to 60 FPS, while viewports of 768px or less are limited to 24 FPS to protect mobile performance.

`continuity` controls the relationship between successive grain states. A value of `0` keeps a hard renewal. Higher values connect the states through a smoother transformation. In `flow` mode, continuity changes the moving field's shape over time.

## Film flicker

`flicker` adds small, irregular exposure changes. Its signal combines slow brightness drift, frame-level instability and occasional short jumps. `0` disables it and `1` applies the strongest setting.

The black or white overlay is capped at 9% opacity. Pardigon calculates one temporal value per rendered frame on the CPU, then the GPU composites it with the grain. Flicker stops with the animation and follows reduced-motion settings.

## Film dirt

`dirt` adds sparse black spots and occasional light marks inspired by dust and damage on physical film. Each mark stays fixed for two to six grain frames before changing. There is no smooth particle movement.

The fragment shader builds the marks from large spatial cells and simple irregular shapes. This adds no texture asset, CPU pixel generation or extra render pass. `0` disables the layer and `1` applies the strongest setting.

## Blend modes

`blendMode` controls how the complete grain canvas interacts with the content behind it:

- `normal` keeps the original result
- `soft-light` integrates the grain gently with contrast
- `overlay` produces a stronger contrast response
- `multiply` favours darker texture
- `screen` favours lighter texture

The browser compositor applies the blend mode after the shader draws the transparent canvas. Invalid and unsupported values fall back to `normal`.

## Control the effect

The same instance can be updated, paused, restarted or removed:

```ts
grain.update({ intensity: 0.08, size: 4, complexity: 0.6, character: 0.7 });
grain.update({ continuity: 0.8 });
grain.update({ flicker: 0.25 });
grain.update({ dirt: 0.2 });
grain.update({ color: "#4b8dff" });
grain.update({ blendMode: "overlay" });
grain.update({ preset: "fog", intensity: 0.05 });
grain.update({ quality: "auto" });
grain.update({ respectReducedMotion: false });
const metrics = grain.getMetrics();
grain.pause();
grain.play();
grain.destroy();
```

`destroy()` removes the canvas, observers, animation frame and event listeners.

## Performance metrics

`getMetrics()` reports the latest shader draw time when the browser supports `EXT_disjoint_timer_query_webgl2`:

```ts
const {
  gpuTimeMs,
  gpuTimerSupported,
  quality,
  qualityLevel,
  renderScale,
  effectiveFps,
  effectiveComplexity,
  actualFps,
  renderedFrames,
  lateFrames,
  frameTimeP95Ms,
} = grain.getMetrics();
```

`gpuTimeMs` measures Pardigon's draw call rather than the device's total GPU usage. The [live demo](https://pardigon.vercel.app) also measures page FPS and frame stability with `requestAnimationFrame`, including on browsers that do not expose the GPU timer.

`effectiveFps` is the active target after mobile and automatic-quality limits. `actualFps` is the measured draw rate from the latest one-second sample. `lateFrames` counts frames missed from that target, while refreshes intentionally skipped by a lower `fps` setting are ignored. `renderedFrames` counts successful draw calls, and `frameTimeP95Ms` reports the 95th percentile of the intervals between them.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `target` | Element that receives the canvas overlay | `document.body` |
| `preset` | Built-in visual starting point | none |
| `respectReducedMotion` | Freezes animation when reduced motion is requested | `true` |
| `quality` | Uses `fixed` quality or adapts cost with `auto` | `fixed` |
| `intensity` | Grain strength, from `0` to `1` | `0.06` |
| `color` | Grain tint as `#RGB` or `#RRGGBB` | `#ffffff` |
| `blendMode` | `normal`, `soft-light`, `overlay`, `multiply` or `screen` | `normal` |
| `size` | Grain scale in CSS pixels | `1` |
| `blur` | Softens and connects the noise, from `0` to `1` | `0` |
| `complexity` | Adds medium and fine detail, from `0` to `1` | `0.35` |
| `character` | Changes the grain from evenly distributed to clustered, from `0` to `1` | `0` |
| `continuity` | Links successive grain states, from `0` to `1` | `0` |
| `flicker` | Adds irregular exposure variation, from `0` to `1` | `0` |
| `dirt` | Adds sparse film dust and spots, from `0` to `1` | `0` |
| `animated` | Animates or freezes the grain | `true` |
| `speed` | Animation speed multiplier | `1` |
| `fps` | Temporal frame rate, from `1` to `60` | `24` |
| `animationMode` | `evolve` or `flow` | `evolve` |

## Performance

The shader draws one triangle for each grain surface. Static grain has no continuous render loop. Animated grain uses the selected frame rate as an upper limit and pauses when the page is hidden or a local target leaves the viewport. Reduced-motion settings make the grain static by default.

Pardigon rebuilds its GPU resources if the browser loses and restores the WebGL context.

Render resolution is capped on high-density screens at 1x device pixel ratio on viewports of 768px or less, and 1.5x on wider viewports. The actual cost depends on screen size, device, grain complexity and the number of active surfaces.

With `quality: "auto"`, Pardigon checks frame stability inside the animation loop. It lowers quality after two poor one-second samples and waits for five stable samples before moving back up. This delay avoids rapid changes between levels.

The four quality levels reduce internal resolution first, remove the detail layer second and lower rendering FPS last. The minimum level uses 55% of the base render resolution, removes the additional detail layer and uses 75% of the selected frame rate. It does not overwrite the original settings.

Blend-mode composition happens after the WebGL draw and may not appear in `gpuTimeMs`. Compare page FPS and frame stability when testing those modes. Test the library on the phones and computers your project actually targets.

## Roadmap

### Overview

- [x] Better performance measurements
- [x] Automatic quality
- [ ] Masks and local regions
- [x] More temporal control
- [x] Grain character
- [x] Film dirt and impurities
- [x] Film flicker
- [x] Blend modes
- [ ] Later explorations

Checked sections are available in the public API.

### 1. Better performance measurements

The metrics API reports target and actual FPS, late frames, total rendered frames, P95 render intervals, internal render scale, effective complexity and GPU draw time when the browser exposes it.

The frame scheduler carries its remaining time between screen refreshes, which keeps rates such as 24 FPS close to their requested average on a 60 Hz display. These measurements also work on iOS when GPU timing is unavailable, except for `gpuTimeMs` itself.

### 2. Automatic quality

`quality: "auto"` adjusts internal resolution, the optional detail layer and rendering rate when frame stability drops. Intensity, colour, size, character, continuity, flicker, dirt and motion keep their selected values. `quality: "fixed"` keeps the full-quality level.

### 3. Masks and local regions

This part is still being explored. Possible masks include radial areas, directional gradients, pointer-controlled regions and image masks.

A small reveal should render a small moving canvas where possible. For example, a 200 × 200 pixel pointer mask should not process the complete element behind it.

### 4. More temporal control

`continuity` ranges from a hard renewal at `0` to a continuous transformation at `1`. Intermediate values retain part of the previous visual structure. Values above `0` need one additional noise sample in the shader.

Current preset values:

- `8mm`: `0.2`
- `16mm`: `0.1`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 5. Grain character

`character` changes the distribution of grain without changing its size, colour, movement or average intensity. A value of `0` keeps an even distribution. Higher values form stronger clusters and calmer areas inside the existing shader.

Current preset values:

- `8mm`: `1`
- `16mm`: `0.4`
- `35mm`: `0`
- `paper`: `0.12`
- `pixel`: `0`
- `fog`: `0.63`

### 6. Film dirt and impurities

`dirt` creates sparse black spots and occasional light marks. Each mark stays attached to a film frame for a short, irregular lifetime before disappearing or changing position.

Current preset values:

- `8mm`: `0.4`
- `16mm`: `0.08`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 7. Film flicker

`flicker` combines slow exposure drift, small frame-level changes and occasional sharper jumps. The opacity is capped, and the effect follows the animation and reduced-motion state.

Current preset values:

- `8mm`: `0.18`
- `16mm`: `0.12`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 8. Blend modes

`blendMode` uses the browser compositor to apply `normal`, `soft-light`, `overlay`, `multiply` or `screen` to the complete canvas. `normal` remains the default and fallback, so existing presets keep their original appearance.

### Later explorations

- Luminance-dependent grain for images and videos
- Optional chromatic grain
- More procedural noise functions
- Deeper film-stock behaviour
- A WebGPU renderer with WebGL2 kept as the main implementation

Luminance-dependent grain needs access to the source image or video. A WebGL canvas cannot read the HTML content behind it directly, so this work requires a separate rendering path and careful mobile testing.

## Local development

Development requires Node.js 20.19 or newer, or Node.js 22.12 or newer.

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

Repository: [github.com/quentinecrepont/Pardigon](https://github.com/quentinecrepont/Pardigon)

## License

The Pardigon library source code is available under the MIT License. The Pardigon name, branding and separate demo-site assets are not covered by this license.

## Status

Pardigon requires WebGL2, uses ES modules and has no runtime dependencies.
