# Pardigon

Procedural cinematic grain for the web.

Pardigon is a small TypeScript and WebGL2 library that adds texture and atmosphere to websites. The grain is generated live on the GPU with a GLSL shader. It does not use pre-rendered noise textures or generate pixels on the CPU. It can also react to the light and dark areas of an image or video.

[Explore the live demo](https://pardigon.vercel.app)

![Version](https://img.shields.io/github/package-json/v/quentinecrepont/Pardigon?style=flat-square&color=ff5a00&label=version)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![WebGL2](https://img.shields.io/badge/renderer-WebGL2-173d80?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)
[![License](https://img.shields.io/badge/license-MIT-5d7b3d?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/quentinecrepont/Pardigon?style=flat-square&color=f0b429)](https://github.com/quentinecrepont/Pardigon/stargazers)

| | |
| --- | --- |
| **Language** | TypeScript |
| **Renderer** | WebGL2 / GLSL |
| **Runtime dependencies** | 0 |
| **Module format** | ES modules |
| **Browser requirement** | WebGL2 |

## Highlights

- Procedural WebGL2 grain
- Custom grain colour
- Optional chromatic grain
- Luminance response for images and videos
- Text masks and local grain surfaces
- 5 backdrop blend modes
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

## Why Pardigon

After 10 years as an art director, I know how easily digital images can feel too clean.

A subtle layer of grain can make a big difference. Visuals feel more organic and interesting. So I built Pardigon to bring that texture to websites and web applications. It gives you direct control over the grain's size, strength, colour, detail and movement.

The library stays small and leaves the final look to you.

## About the name

Pardigon takes its name from [*Après-midi à Pardigon*](https://www.musee-orsay.fr/en/artworks/apres-midi-pardigon-151), a 1907 painting by French Neo-Impressionist artist Henri-Edmond Cross.

Cross built the landscape from small touches of colour. Seen together, they create light, depth and atmosphere. Pardigon follows the same idea: many small variations form a single texture.

The painting's light and Mediterranean atmosphere also inspired the project's colours:

- Sunset Orange — `#f45a0a`
- Mediterranean Blue — `#0f3477`
- Calanque Beige — `#ede5d6`
- Sail White — `#fefff8`
- Ultramarine Black — `#00050f`

## Creative direction through technical decisions

The code was developed with AI assistance. I decided what Pardigon should do, defined how it should look and move, set its limits, tested every feature and tuned the presets.

Here are a few examples of those decisions:

#### 1) Animating texture the right way

The first version of `Fog` created a new noise pattern every few frames. It looked like pixels were being replaced.

Fog needed to move instead of jumping. I made it travel across the `X` and `Y` axes while slowly changing shape. Film grain stayed in place and changed over time. These became 2 animation modes: `flow` for moving textures and `evolve` for textures that change in place.

#### 2) Shaping the grain

Large blurred grain showed another problem. It turned into large, soft blocks with very little detail.

`complexity` adds smaller details. `character` creates clusters and calmer areas. `scaleX` and `scaleY` stretch or compress the grain in each direction. Together, these controls make the grain feel more like a material.

#### 3) Giving every texture its own flow

Timing changes how a texture feels. Running everything at `30 FPS` or `60 FPS` made the `8mm` preset feel too modern.

Pardigon controls its frame rate separately from the screen. `8mm` runs at `12 FPS`, while `16mm` runs at `14 FPS`.

`continuity` controls how the grain changes between frames. At `0`, every frame is new. Higher values make the change smoother.

#### 4) Adding the right imperfections

Old film is not perfectly stable. `flicker` creates small changes in brightness. `dirt` adds occasional marks that briefly appear on the image.

I kept both effects subtle and used them only where they made sense. They make `8mm` and `16mm` feel closer to real film. The cleaner presets remain untouched.

#### 5) Making grain belong to the image

Uniform grain can feel like a layer placed on top of an image. I wanted the texture to work with the image instead.

`luminance` can place more grain in the `shadows`, `midtones` or `highlights`. A local `target` keeps it inside one area. `mask: "text"` keeps it inside a line of text. `chromatic` creates separate red, green and blue variations in the grain.

Pardigon reads a selected image, video or canvas instead of capturing the whole page. This keeps the result consistent and avoids heavy CPU work.

#### 6) Keeping it smooth on mobile

A visual effect should not make a website feel slow. I tested Pardigon on desktop and mobile, including recent iPhones with high-resolution screens.

Those tests led to `quality: "auto"`. Pardigon can lower its internal resolution, detail and frame rate when performance drops. It returns to full quality when the device recovers.

The chosen `intensity`, `speed` and `character` stay the same, so the visual direction is preserved.

## Install

Install Pardigon from npm:

```bash
npm install pardigon
```

## Quick start

Pardigon uses ES modules and requires a browser with WebGL2. Call `createGrain()` in the browser after the page has loaded.

```ts
import { createGrain } from "pardigon";

const grain = createGrain({
  target: document.body,
  preset: "8mm",
  quality: "auto",
  respectReducedMotion: true,
});
```

All options are optional. Without a `target`, Pardigon uses `document.body`. Any option you add replaces the matching value from the preset.

## Choose a preset

Pardigon includes 6 starting points:

- `8mm` for large film grain running at a low frame rate
- `16mm` for smaller film grain
- `35mm` for subtle, detailed film grain
- `paper` for a static organic texture
- `pixel` for sharp digital noise
- `fog` for large, soft layers that move like fog

Use a preset directly:

```ts
createGrain({ target: document.body, preset: "16mm" });
```

Preset names are lowercase in the API. You can also import a preset and change one or more of its values:

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

### Text masks

Use `mask: "text"` on a single line of text to show the grain only inside its letters:

```ts
createGrain({
  target: document.querySelector("h2") as HTMLElement,
  preset: "16mm",
  color: "#90ff00",
  mask: "text",
});
```

The text stays in the page and remains accessible. The mask follows the text where the browser places it, including its alignment, indent and `text-transform`. Pardigon updates the mask when the element changes size, the text changes or its web font finishes loading. The grain itself is still generated on the GPU.

### Luminance-dependent grain

Use an image, video or canvas as a source when you want the grain to react to its light and dark areas:

```ts
const frame = document.querySelector("#media-frame") as HTMLElement;
const image = document.querySelector("#portrait") as HTMLImageElement;

createGrain({
  target: frame,
  preset: "35mm",
  luminance: {
    source: image,
    response: 0.75,
    range: "midtones",
    fit: "cover",
  },
});
```

`response: 0` keeps the grain even across the image. `response: 1` gives the strongest effect. `range` chooses which tones receive more grain: `shadows`, `midtones` or `highlights`.

Images and videos hosted on the same website work directly. Media hosted elsewhere must allow cross-origin access (CORS). Pardigon cannot use normal HTML content as a luminance source.

A canvas source is read again for every grain frame. When the grain is static, call `grain.update({})` after drawing on the canvas.

If your website can work without the grain, check for WebGL2 support before creating it:

```ts
import { createGrain, isWebGL2Supported } from "pardigon";

if (isWebGL2Supported()) {
  createGrain({ target: document.body, preset: "35mm" });
}
```

## Advanced controls

Advanced settings give you more control over shape, timing and movement. You can apply grain to any HTML element:

```ts
createGrain({
  target: document.querySelector("#grain-preview") as HTMLElement,
  intensity: 0.03,
  color: "#ffffff",
  blendMode: "soft-light",
  size: 128,
  scaleX: 600,
  scaleY: 20,
  blur: 1,
  complexity: 0.42,
  character: 0.7,
  chromatic: 0.12,
  continuity: 0.8,
  flicker: 0.25,
  dirt: 0.2,
  animated: true,
  speed: 1.2,
  fps: 60,
  animationMode: "flow",
});
```

`scaleX` and `scaleY` stretch the grain horizontally and vertically. `100 / 100` keeps its original shape. `600 / 20` makes it wide and thin. This happens inside the shader and does not add another noise calculation or render pass.

## Animation

`evolve` changes the grain without moving it across the image. It works well for film grain. `flow` moves the grain across the `X` and `Y` axes while its shape changes. It works better for fog and atmospheric textures.

`fps` controls the grain's frame rate separately from the screen. Lower values create a more stepped rhythm. Pardigon allows up to `60 FPS` on larger screens and limits screens of `768px` or less to `24 FPS` to protect mobile performance.

`continuity` controls how the grain changes between frames. At `0`, every frame is new. Higher values make the change smoother. In `flow` mode, it also changes the shape of the grain as it moves.

## Film flicker

`flicker` adds small, irregular changes in brightness. It combines slow changes, small differences between frames and occasional short jumps. `0` turns it off and `1` gives the strongest effect.

The black or white layer never goes above `9%` opacity. The CPU calculates 1 brightness value for each rendered frame, then the GPU applies it with the grain. Flicker stops with the animation and respects reduced-motion settings.

## Film dirt

`dirt` adds a few black spots and occasional light marks inspired by dust and damage on physical film. Each mark stays in place for `2` to `6` grain frames before changing. The marks do not move like particles.

The shader creates these marks with simple irregular shapes. It does not use image files, generate pixels on the CPU or add another render pass. `0` turns the effect off and `1` gives the strongest result.

## Blend modes

`blendMode` controls how the grain mixes with the content behind it:

- `normal` keeps the original result
- `soft-light` adds gentle contrast
- `overlay` adds stronger contrast
- `multiply` makes the texture darker
- `screen` makes the texture lighter

The browser applies the blend mode after the shader draws the transparent canvas. Invalid or unsupported values use `normal` instead.

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

`pause()` freezes the grain on its current frame and `play()` resumes it. They do not change `animated`, so a static preset such as `paper` stays static after `play()`. Use `update({ animated: true })` to animate it. While the grain is paused, `update()` applies new settings to the still frame.

`destroy()` stops the effect and removes its canvas, observers and event listeners.

## Performance metrics

`getMetrics()` reports current performance data. When the browser supports `EXT_disjoint_timer_query_webgl2`, it also measures GPU draw time:

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

`gpuTimeMs` measures the time used to draw Pardigon, not the device's total GPU usage. The [live demo](https://pardigon.vercel.app) also measures page FPS and frame stability. These measurements work even when the browser does not provide a GPU timer.

- `effectiveFps` is the current target after mobile and automatic quality limits.
- `actualFps` is the number of frames drawn during the latest `1`-second sample.
- `lateFrames` counts the frames that missed the current target. Frames skipped because of a lower `fps` setting do not count.
- `renderedFrames` counts successful grain frames.
- `frameTimeP95Ms` helps reveal stutters: `95%` of measured frame intervals are equal to or lower than this value.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `target` | Element that receives the grain | `document.body` |
| `preset` | Built-in visual starting point | none |
| `respectReducedMotion` | Freezes animation when reduced motion is requested | `true` |
| `quality` | Keeps full quality with `fixed` or adjusts it with `auto` | `fixed` |
| `mask` | Keeps grain inside a single line of text when set to `text` | `none` |
| `luminance` | Makes grain react to an image, video or canvas | disabled |
| `intensity` | Grain strength, from `0` to `1` | `0.06` |
| `color` | Grain tint as `#RGB` or `#RRGGBB` | `#ffffff` |
| `blendMode` | `normal`, `soft-light`, `overlay`, `multiply` or `screen` | `normal` |
| `size` | Grain scale in CSS pixels | `1` |
| `scaleX` | Horizontal grain scale as a percentage | `100` |
| `scaleY` | Vertical grain scale as a percentage | `100` |
| `blur` | Softens and connects the noise, from `0` to `1` | `0` |
| `complexity` | Adds medium and fine detail, from `0` to `1` | `0.35` |
| `character` | Changes the grain from even to clustered, from `0` to `1` | `0` |
| `chromatic` | Separates the red and blue grain channels, from `0` to `1` | `0` |
| `continuity` | Makes changes between grain frames smoother, from `0` to `1` | `0` |
| `flicker` | Adds small, irregular changes in brightness, from `0` to `1` | `0` |
| `dirt` | Adds film dust and spots, from `0` to `1` | `0` |
| `animated` | Animates or freezes the grain | `true` |
| `speed` | Animation speed multiplier | `1` |
| `fps` | Temporal frame rate, from `1` to `60` | `24` |
| `animationMode` | `evolve` or `flow` | `evolve` |

Numbers outside their range are clamped to it. Other invalid values throw an error and leave the grain unchanged: unknown names, colours that are not `#RGB` or `#RRGGBB`, numbers that are `NaN` or infinite, and a `target` that is not an HTML element. `blendMode` is the only exception. It falls back to `normal`, because browser support varies.

## Performance

The shader draws `1` triangle for each grain surface. Static grain does not run a continuous animation loop. Animated grain never goes above the selected frame rate. It pauses when the page is hidden or when a local target leaves the screen. Reduced-motion settings make the grain static by default.

If the browser loses its WebGL connection, Pardigon rebuilds the GPU resources when the connection returns.

On high-density screens, render resolution is limited to `1x` device pixel ratio on screens of `768px` or less and `1.5x` on larger screens. The actual cost depends on the screen, the device, the grain's complexity and the number of active grain surfaces.

With `quality: "auto"`, Pardigon watches frame stability while the grain runs. It lowers quality after `2` poor `1`-second samples and raises it again after `5` stable samples. This delay stops the quality from changing too often.

Slow frames do not always come from Pardigon. Power-saving modes, such as Low Power Mode on iPhone, can limit the browser to `30 FPS`. Before lowering quality, Pardigon tests its lowest level for `1` second. If the frames do not get faster, it restores the previous quality and treats that frame rate as normal.

The `4` quality levels reduce internal resolution first, remove the extra detail layer second and lower the frame rate last. The lowest level uses `55%` of the original render resolution and `75%` of the selected frame rate. It does not change the original settings.

Blend modes are applied after WebGL draws the grain, so their cost may not appear in `gpuTimeMs`. Check page FPS and frame stability when testing them. Always test Pardigon on the phones and computers your project needs to support.

## Roadmap

### Overview

- [x] Better performance measurements
- [x] Automatic quality
- [x] Masks and local regions
- [x] More control over timing
- [x] Grain character
- [x] Film dirt and impurities
- [x] Film flicker
- [x] Blend modes
- [x] Independent horizontal and vertical scale
- [x] Luminance-dependent grain for images and videos
- [x] Optional chromatic grain
- [ ] Later explorations

Checked features are available in the public API.

### 1. Better performance measurements

The metrics API shows target and actual FPS, late frames, total rendered frames, P95 frame intervals, internal render scale, active complexity and GPU draw time when the browser provides it.

The frame scheduler keeps rates such as `24 FPS` close to their target, even on a `60 Hz` screen. Most measurements also work on iOS. Only `gpuTimeMs` is unavailable when the browser does not provide GPU timing.

### 2. Automatic quality

`quality: "auto"` lowers internal resolution, the optional detail layer and frame rate when performance drops. Creative settings such as `intensity`, `color`, `size`, `character`, `continuity`, `flicker`, `dirt`, `speed` and `animationMode` keep their selected values. `quality: "fixed"` always keeps full quality.

### 3. Masks and local regions

`mask: "text"` keeps the grain inside a single line of text. Pardigon updates the text mask only when its layout changes. The animated grain stays procedural and GPU-generated.

Local targets and small moving canvases avoid drawing grain where it is not needed. Radial, directional and image masks may be added later.

### 4. More control over timing

At `0`, `continuity` creates a completely new grain pattern for every frame. At `1`, the grain changes smoothly. Values between them keep part of the previous pattern. Any value above `0` needs `1` extra noise calculation in the shader.

Current preset values:

- `8mm`: `0.2`
- `16mm`: `0.1`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 5. Grain character

`character` changes how the grain is distributed without changing its size, colour, movement or average intensity. `0` keeps it even. Higher values create stronger clusters and calmer areas.

Current preset values:

- `8mm`: `1`
- `16mm`: `0.4`
- `35mm`: `0`
- `paper`: `0.12`
- `pixel`: `0`
- `fog`: `0.63`

### 6. Film dirt and impurities

`dirt` creates a few black spots and occasional light marks. Each mark stays for a short, irregular time before disappearing or changing position.

Current preset values:

- `8mm`: `0.4`
- `16mm`: `0.08`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 7. Film flicker

`flicker` combines slow changes in brightness, small differences between frames and occasional sharper jumps. Its opacity is limited, and the effect stops when the animation stops or reduced motion is active.

Current preset values:

- `8mm`: `0.18`
- `16mm`: `0.12`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 8. Blend modes

`blendMode` uses the browser to apply `normal`, `soft-light`, `overlay`, `multiply` or `screen` to the complete grain layer. `normal` is the default and is also used when another value is not supported.

### 9. Independent horizontal and vertical scale

`scaleX` and `scaleY` stretch the grain in each direction. `100` keeps the original scale. This only changes coordinates inside the shader, so it does not add another texture, noise calculation or render pass.

### 10. Luminance-dependent grain

`luminance` lets the grain react to the shadows, midtones or highlights of an image, video or canvas. An image is sent to the GPU once. A video updates whenever Pardigon draws a new grain frame. When enabled, this feature adds `1` texture sample per pixel and does not change existing presets.

For an HTML component, use the component as the `target` and its image or video as `luminance.source`. Pardigon does not capture the whole page. This avoids heavy CPU work and extra dependencies.

### 11. Optional chromatic grain

`chromatic` creates small differences between the red, green and blue parts of the grain. The shader balances their brightness to avoid making the image lighter. `0` keeps the grain monochrome, while `1` gives the strongest colour separation.

This option adds `2` extra noise calculations only when it is enabled. Existing presets stay at `0`, so their current appearance does not change.

### Later explorations

- More procedural noise functions
- Deeper film-stock behaviour
- A WebGPU renderer, while keeping WebGL2 as the main version

## Local development

To work on Pardigon locally, use Node.js `20.19` or a later `20.x` release, or Node.js `22.12` or newer.

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

Repository: [github.com/quentinecrepont/Pardigon](https://github.com/quentinecrepont/Pardigon)

## License

The Pardigon library source code is available under the MIT License. The Pardigon name, branding and separate demo-site assets are not covered by this license.
