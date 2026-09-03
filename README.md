# Pardigon

#### Current version: v0.1.0

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
- Independent animation speed and frame rate
- Live updates without restarting the renderer
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

## Control the effect

Update it, pause it, restart it, or remove it:

```ts
grain.update({ intensity: 0.08, size: 4, complexity: 0.6 });
grain.update({ color: "#4b8dff" });
grain.update({ preset: "fog", intensity: 0.05 });
grain.update({ respectReducedMotion: false });
const metrics = grain.getMetrics();
grain.pause();
grain.play();
grain.destroy();
```

`destroy()` removes the canvas, observers, animation frame and event listeners. Nothing is left running in the background.

`getMetrics()` returns the latest measured shader draw time when the browser supports `EXT_disjoint_timer_query_webgl2`:

```ts
const { gpuTimeMs, gpuTimerSupported } = grain.getMetrics();
```

This measures Pardigon's draw call, not the device's total GPU usage. The [live demo](https://pardigon.vercel.app) also shows page FPS and frame stability with `requestAnimationFrame`, including on browsers that do not expose the GPU timer.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `target` | Element that receives the canvas overlay | `document.body` |
| `preset` | Built-in visual starting point | none |
| `respectReducedMotion` | Freezes animation when reduced motion is requested | `true` |
| `intensity` | Grain strength, from `0` to `1` | `0.06` |
| `color` | Grain tint as `#RGB` or `#RRGGBB` | `#ffffff` |
| `size` | Grain scale in CSS pixels | `1` |
| `blur` | Softens and connects the noise, from `0` to `1` | `0` |
| `complexity` | Adds medium and fine detail, from `0` to `1` | `0.35` |
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

Performance varies between devices, so test Pardigon on the hardware that matters to your project.

## Roadmap

Pardigon will stay focused on procedural grain, texture and atmosphere. These are the current areas of development.

### 1. Better performance measurements

The first step is to record the current cost on desktop and mobile devices. The metrics API may grow to include:

- Effective rendering FPS
- Dropped frames
- Number of rendered frames
- Internal render scale
- GPU draw time when the browser makes it available

These measurements will help compare presets and future changes. They will also provide useful information on iOS, where GPU timing is often unavailable.

### 2. Automatic quality

A future `quality: "auto"` option could adjust the internal resolution, shader complexity and rendering rate when a device starts losing frames.

Adjustments should be gradual and should preserve the selected intensity, colour and motion. The visual direction must remain stable while Pardigon reduces its rendering cost.

### 3. Masks and local regions

Grain could be placed inside a specific part of an element instead of covering the complete surface. Planned mask types include:

- Radial areas
- Horizontal or vertical gradients
- Pointer-controlled areas
- Image masks

Small interactive regions should use a small moving canvas where possible. A 200 × 200 pixel reveal should only render that area instead of processing the complete element.

### 4. More temporal control

The animation system could offer three clear temporal styles:

- `cut` for a new state on each grain frame
- `morph` for continuous transformation
- `flow` for spatial movement and evolution

A `persistence` control could define how long a shape remains visible. Low persistence would suit fast film grain. High persistence would create more natural fog and slow atmospheric layers.

### 5. Grain character

A grain character control could change how the texture is formed without adding a long list of technical settings. It may control:

- Uniform or clustered grain
- Fine and coarse grain distribution
- Size variation
- Soft or strong contrast

The shader must remain small enough for fullscreen use on mobile devices.

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
