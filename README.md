# Pardigon

#### Current version: v0.4.0

Procedural cinematic grain for the web.

Pardigon is a small TypeScript and WebGL2 library for adding texture and atmosphere to websites. The grain is generated on the GPU with a GLSL shader. No image textures. No videos. No CPU pixel generation.

[Explore the live demo](https://pardigon.vercel.app)

## Why Pardigon

After ten years as an art director, I know that digital images can feel too clean.

A subtle layer of grain can change that. It can make a visual feel more organic and interesting.

I built Pardigon to bring this idea to websites and web applications. The grain is generated on the GPU in real time, with simple controls for its size, strength, colour, detail and movement.

Pardigon stays small, lightweight and easy to use. It gives developers and designers more material to work with, while leaving the final look in their hands.

Clean is useful. Character is better.

## About the name

Pardigon is named after [*Après-midi à Pardigon*](https://www.musee-orsay.fr/en/artworks/apres-midi-pardigon-151), a 1907 painting by French Neo-Impressionist artist Henri-Edmond Cross.

Cross built the landscape from separate touches of colour that come together in the eye. Pardigon works from a similar idea: many small variations become one texture. The painting's light and Mediterranean atmosphere also reflect the visual direction of the project.

## Highlights

- Procedural grain rendered with WebGL2
- Custom grain colour
- Fullscreen or local element overlays
- Film-like evolution and flowing noise
- Adjustable grain character and clustering
- Independent animation speed and frame rate
- Live updates without restarting the renderer
- Automatic quality based on frame stability
- Mobile-aware resolution and frame-rate limits
- Automatic pause when the page or target is hidden
- Reduced-motion support
- WebGL context recovery
- No runtime dependencies

Small surface. Plenty of control.

## Install

Install Pardigon directly from GitHub:

```bash
npm install github:quentinecrepont/Pardigon
```

The package is not currently published on npm. Once it is available there, the command will be:

```bash
npm install pardigon
```

## Basic use

Pardigon runs in the browser, uses ES modules, and requires WebGL2. Call `createGrain()` on the client after the DOM is available.

```ts
import { createGrain } from "pardigon";

const grain = createGrain({
  target: document.body,
  preset: "8mm",
  quality: "auto",
  respectReducedMotion: true,
});
```

Options can override any value from a preset:

```ts
createGrain({
  target: document.body,
  preset: "35mm",
  intensity: 0.04,
  color: "#4b8dff",
});
```

Check for WebGL2 when the effect is optional:

```ts
import { createGrain, isWebGL2Supported } from "pardigon";

if (isWebGL2Supported()) {
  createGrain({ target: document.body, preset: "35mm" });
}
```

Any HTML element can become a local grain surface:

```ts
createGrain({
  target: document.querySelector("#grain-preview") as HTMLElement,
  intensity: 0.03,
  color: "#ffffff",
  size: 128,
  blur: 1,
  complexity: 0.42,
  character: 0.7,
  continuity: 0.8,
  animated: true,
  speed: 1.2,
  fps: 60,
  animationMode: "flow",
});
```

## Animation modes

- `evolve` creates a new grain state over time without moving the noise field. It works well for film grain.
- `flow` moves the noise across the X and Y axes while it evolves. It works well for fog and slow atmospheric textures.

`fps` controls the grain's temporal frame rate independently from the screen refresh rate. A value of `12`, for example, gives film grain a more stepped rhythm. Wider viewports can render up to `60` FPS. Viewports of `768px` or less are limited to `24` FPS to protect mobile performance.

`continuity` controls how strongly one grain state is connected to the next. `0` keeps the original cut-like animation. Higher values create a smoother transformation. In `flow` mode, it adds shape evolution to the existing spatial movement.

## Control the effect

Update it, pause it, restart it, or remove it:

```ts
grain.update({ intensity: 0.08, size: 4, complexity: 0.6, character: 0.7 });
grain.update({ continuity: 0.8 });
grain.update({ color: "#4b8dff" });
grain.update({ preset: "fog", intensity: 0.05 });
grain.update({ quality: "auto" });
grain.update({ respectReducedMotion: false });
const metrics = grain.getMetrics();
grain.pause();
grain.play();
grain.destroy();
```

`destroy()` removes the canvas, observers, animation frame and event listeners. Nothing is left running in the background.

`getMetrics()` returns the latest measured shader draw time when the browser supports `EXT_disjoint_timer_query_webgl2`:

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

This measures Pardigon's draw call, not the device's total GPU usage. The [live demo](https://pardigon.vercel.app) also shows page FPS and frame stability with `requestAnimationFrame`, including on browsers that do not expose the GPU timer.

`effectiveFps` is the current target after mobile and automatic-quality limits. `actualFps` is the measured Pardigon draw rate over the latest one-second sample. `lateFrames` counts only frames missed from that target; refreshes intentionally skipped by a lower `fps` setting are not treated as late. `renderedFrames` counts every successful draw call since the instance was created, and `frameTimeP95Ms` reports the 95th percentile of the measured intervals between those draws.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `target` | Element that receives the canvas overlay | `document.body` |
| `preset` | Built-in visual starting point | none |
| `respectReducedMotion` | Freezes animation when reduced motion is requested | `true` |
| `quality` | Uses `fixed` quality or adapts cost with `auto` | `fixed` |
| `intensity` | Grain strength, from `0` to `1` | `0.06` |
| `color` | Grain tint as `#RGB` or `#RRGGBB` | `#ffffff` |
| `size` | Grain scale in CSS pixels | `1` |
| `blur` | Softens and connects the noise, from `0` to `1` | `0` |
| `complexity` | Adds medium and fine detail, from `0` to `1` | `0.35` |
| `character` | Changes the grain from evenly distributed to clustered, from `0` to `1` | `0` |
| `continuity` | Links successive grain states, from `0` to `1` | `0` |
| `animated` | Animates or freezes the grain | `true` |
| `speed` | Animation speed multiplier | `1` |
| `fps` | Temporal frame rate, from `1` to `60` | `24` |
| `animationMode` | `evolve` or `flow` | `evolve` |

## Built-in presets

Six starting points are included:

- `8mm` - coarse, low-frame-rate film grain
- `16mm` - slightly finer film grain
- `35mm` - subtle, detailed film grain
- `paper` - static organic texture
- `pixel` - hard, graphic digital noise
- `fog` - large, soft noise moving in flowing layers

Use one directly:

```ts
createGrain({ target: document.body, preset: "16mm" });
```

Or import its values and make it your own:

```ts
import { createGrain, grainPresets } from "pardigon";

createGrain({
  target: document.body,
  ...grainPresets.fog,
  speed: 0.7,
});
```

Preset names are lowercase in the API.

## Performance

The shader runs on the GPU and draws one triangle for each grain surface. Static grain has no continuous render loop. Animated grain uses the selected frame rate as an upper limit and pauses when the page is hidden or a local target leaves the viewport. When reduced motion is requested, the grain stays visible but becomes static by default.

If the browser loses its WebGL context, Pardigon stops rendering and rebuilds the GPU resources when the context returns.

Render resolution is limited on high-density screens: up to `1x` device pixel ratio on viewports of `768px` or less, and `1.5x` on wider viewports. The real cost still depends on screen size, device, grain complexity and the number of active surfaces.

With `quality: "auto"`, Pardigon measures frame stability in the animation loop. It lowers quality after two poor one-second samples and waits for five stable samples before moving back up. This slower recovery prevents rapid changes between levels.

The four levels reduce internal resolution first, disable the detail layer second and reduce rendering FPS last. At the lowest level, Pardigon uses `55%` of its base render resolution, no additional detail layer and `75%` of the selected frame rate. Intensity, colour, grain size, character and motion stay unchanged. The original settings are never overwritten.

Use `getMetrics()` to read the active quality level and effective values. Set `quality: "fixed"` to keep the original rendering behaviour.

Performance varies between devices, so test Pardigon on the hardware that matters to your project.

## Roadmap

Pardigon will stay focused on procedural grain, texture and atmosphere. These are the current areas of development.

### Overview

- [x] Better performance measurements
- [x] Automatic quality
- [ ] Masks and local regions
- [x] More temporal control
- [x] Grain character
- [ ] Film dirt and impurities
- [ ] Film flicker
- [ ] Later explorations

A section will be checked when its work is complete and available in the public API.

### 1. Better performance measurements

The metrics API now reports:

- Target and actual rendering FPS
- Late frames relative to Pardigon's selected cadence
- Total rendered frames
- The 95th percentile of render intervals
- Internal render scale and effective complexity
- GPU draw time when the browser makes it available

The cadence scheduler keeps its remaining time between display refreshes, so targets such as `24` FPS stay close to their requested average on a `60` Hz display. These measurements will help compare presets and future changes. They also provide useful information on iOS, where GPU timing is often unavailable.

### 2. Automatic quality

The `quality: "auto"` option adjusts internal resolution, the optional detail layer and rendering rate when frame stability drops.

Adjustments are gradual. Intensity, colour, size, character and motion keep their selected values while Pardigon reduces its rendering cost. `quality: "fixed"` keeps the full-quality level at all times.

### 3. Masks and local regions

Grain could be placed inside a specific part of an element instead of covering the complete surface. Planned mask types include:

- Radial areas
- Horizontal or vertical gradients
- Pointer-controlled areas
- Image masks

Small interactive regions should use a small moving canvas where possible. A 200 × 200 pixel reveal should only render that area instead of processing the complete element.

### 4. More temporal control

The `continuity` option controls the relationship between successive grain states:

- `0` keeps a hard renewal for film-like grain
- Intermediate values retain part of the previous visual structure
- `1` produces a continuous transformation

In `evolve` mode, the shader blends neighbouring procedural noise states. In `flow` mode, continuity adds shape evolution while the field moves across the surface. Everything remains procedural and runs in the same WebGL2 shader. Values above `0` require one additional noise sample, so the control has a real but bounded GPU cost.

Current preset values:

- `8mm`: `0.2`
- `16mm`: `0.1`
- `35mm`: `0`
- `paper`: `0`
- `pixel`: `0`
- `fog`: `0`

### 5. Grain character

The `character` option changes how grain is distributed across the surface:

- `0` keeps the grain even and preserves the original rendering
- `0.5` creates moderate local variation
- `1` creates stronger clusters and calmer areas

The control changes local grain density without changing its selected size, colour, movement or overall intensity. It runs inside the existing shader and does not use textures or another render pass.

Current preset values:

- `8mm`: `1`
- `16mm`: `0.4`
- `35mm`: `0`
- `paper`: `0.12`
- `pixel`: `0`
- `fog`: `0.63`

### 6. Film dirt and impurities

A future `dirt` control could add sparse black spots and dust marks inspired by physical film. These impurities should appear occasionally, persist for a short time and avoid the constant flicker of regular grain.

The effect should remain procedural, with no texture assets or additional CPU pixel generation. It will need careful temporal behaviour so the marks feel like film imperfections instead of another noise layer.

### 7. Film flicker

A `flicker` control could recreate the small exposure changes found in older film. The brightness would drift slightly, with occasional irregular jumps instead of a clean repeating pulse.

The first version should use one simple amount control. Its temporal signal should combine slow variation with sparse, sharper changes, while avoiding distracting flashes. The effect can remain procedural in the existing shader and should add very little rendering cost.

### Later explorations

- Luminance-dependent grain for images and videos
- Optional chromatic grain
- More procedural noise functions
- Deeper film-stock-inspired behaviour
- A WebGPU renderer while keeping WebGL2 as the main implementation

Luminance-dependent grain requires access to the source image or video. A WebGL canvas cannot directly read the HTML content behind it, so this feature will need a separate rendering path and careful mobile testing.

## Local development

Development requires Node.js 20.19 or newer, or Node.js 22.12 or newer.

Install the development dependencies:

```bash
npm install
```

Build and type-check the package:

```bash
npm run build
```

Run the public API and package-consumer tests:

```bash
npm test
```

Inspect the files included in the npm package:

```bash
npm pack --dry-run
```

Repository: [github.com/quentinecrepont/Pardigon](https://github.com/quentinecrepont/Pardigon)

## License

The Pardigon library source code is available under the MIT License. The Pardigon name, branding and separate demo-site assets are not covered by this license.

## Status

Pardigon requires WebGL2. The package uses ES modules and has no runtime dependencies.
