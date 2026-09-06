import { grainPresets } from "./presets";
import { resolveBlendMode } from "./blendMode";
import { calculateFrameSchedule } from "./frameScheduler";
import { calculateFlickerExposure } from "./flicker";
import type {
  GrainInstance,
  GrainMaskMode,
  GrainMetrics,
  GrainOptions,
  GrainPresetName,
  GrainQualityMode,
  GrainSettings,
} from "./types";

export type {
  GrainAnimationMode,
  GrainBlendMode,
  GrainInstance,
  GrainMaskMode,
  GrainMetrics,
  GrainOptions,
  GrainPresetName,
  GrainQualityMode,
  GrainSettings,
  GrainUpdateOptions,
} from "./types";

const DEFAULT_SETTINGS: Readonly<GrainSettings> = Object.freeze({
  intensity: 0.06,
  color: "#ffffff",
  blendMode: "normal",
  size: 1,
  scaleX: 100,
  scaleY: 100,
  animated: true,
  blur: 0,
  complexity: 0.35,
  character: 0,
  continuity: 0,
  flicker: 0,
  dirt: 0,
  speed: 1,
  fps: 24,
  animationMode: "evolve",
});

const AUTO_QUALITY_LEVELS = [
  { renderScale: 1, complexityScale: 1, fpsScale: 1 },
  { renderScale: 0.85, complexityScale: 1, fpsScale: 1 },
  { renderScale: 0.7, complexityScale: 0, fpsScale: 1 },
  { renderScale: 0.55, complexityScale: 0, fpsScale: 0.75 },
] as const;

const AUTO_QUALITY_SAMPLE_DURATION_MS = 1_000;
const AUTO_QUALITY_SLOW_FRAME_MS = 24;
const AUTO_QUALITY_POOR_SAMPLE_COUNT = 2;
const AUTO_QUALITY_STABLE_SAMPLE_COUNT = 5;
const PERFORMANCE_SAMPLE_DURATION_MS = 1_000;

const VERTEX_SHADER = `#version 300 es
void main() {
  // Un seul grand triangle couvre tout le canvas, sans vertex buffer.
  vec2 position = vec2(
    (gl_VertexID == 2) ? 3.0 : -1.0,
    (gl_VertexID == 1) ? 3.0 : -1.0
  );
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float u_intensity;
uniform vec3 u_color;
uniform float u_size;
uniform vec2 u_scale;
uniform float u_pixelRatio;
uniform float u_time;
uniform float u_blur;
uniform float u_complexity;
uniform float u_character;
uniform float u_continuity;
uniform float u_flickerExposure;
uniform float u_dirt;
uniform float u_speed;
uniform float u_fps;
uniform float u_animationMode;
uniform float u_maskEnabled;
uniform sampler2D u_maskTexture;

out vec4 outColor;

// Transforme une position 2D en nombre pseudo-aléatoire entre 0 et 1.
float hash(vec2 position) {
  vec3 p = fract(vec3(position.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Bruit continu : quatre cellules sont interpolées au lieu d'être remplacées.
float valueNoise(vec2 position, vec2 seedOffset) {
  vec2 cell = floor(position);
  vec2 fraction = fract(position);
  vec2 smoothCurve = fraction * fraction * (3.0 - 2.0 * fraction);
  vec2 crispCurve = smoothstep(vec2(0.44), vec2(0.56), fraction);
  vec2 curve = mix(crispCurve, smoothCurve, u_blur);

  float topLeft = hash(cell + seedOffset);
  float topRight = hash(cell + vec2(1.0, 0.0) + seedOffset);
  float bottomLeft = hash(cell + vec2(0.0, 1.0) + seedOffset);
  float bottomRight = hash(cell + vec2(1.0, 1.0) + seedOffset);
  float top = mix(topLeft, topRight, curve.x);
  float bottom = mix(bottomLeft, bottomRight, curve.x);
  return mix(top, bottom, curve.y);
}

// Links neighbouring noise states without storing textures or previous frames.
float morphNoise(
  vec2 position,
  vec2 seedScale,
  vec2 seedOffset,
  float animationTime
) {
  float currentSlice = floor(animationTime);
  float transition = fract(animationTime);
  transition = transition * transition * transition
    * (transition * (transition * 6.0 - 15.0) + 10.0);

  float currentNoise = valueNoise(
    position,
    seedOffset + currentSlice * seedScale
  );
  float nextNoise = valueNoise(
    position,
    seedOffset + (currentSlice + 1.0) * seedScale
  );
  return mix(currentNoise, nextNoise, transition);
}

float temporalNoise(
  vec2 position,
  vec2 seedScale,
  vec2 seedOffset,
  float temporalFrame,
  float animationTime,
  bool usesFlow
) {
  if (usesFlow) {
    // Flow already preserves its field while moving it. Continuity makes that
    // field evolve as well, at a rate independent from the display refresh.
    if (u_continuity < 0.001) {
      return valueNoise(position, seedOffset);
    }

    return morphNoise(
      position,
      seedScale,
      seedOffset,
      animationTime * u_continuity
    );
  }

  if (u_continuity < 0.001) {
    float hardFrame = floor(temporalFrame * u_speed);
    return valueNoise(
      position,
      seedOffset + hardFrame * seedScale
    );
  }

  // At 0, the phase advances by roughly one state per grain frame. At 1,
  // it advances by one smoothly interpolated state per second.
  float temporalRate = mix(u_fps, 1.0, u_continuity);
  return morphNoise(
    position,
    seedScale,
    seedOffset,
    animationTime * temporalRate
  );
}

// Sparse marks that stay attached to a film frame for a short, irregular time.
// One large spatial cell can contain at most one mark, which keeps the layer
// light and prevents it from turning into another continuous noise pattern.
vec2 filmDirt(vec2 fragmentPosition, float temporalFrame) {
  vec2 dirtPosition = fragmentPosition / max(120.0 * u_pixelRatio, 1.0);
  vec2 dirtCell = floor(dirtPosition);
  vec2 localPosition = fract(dirtPosition);

  float cellRandom = hash(dirtCell + vec2(19.0, 61.0));
  float lifetime = floor(mix(2.0, 7.0, cellRandom));
  float dirtFrame = floor(temporalFrame * u_speed / lifetime);
  vec2 eventSeed = dirtCell + dirtFrame * vec2(43.0, 79.0);
  float eventRandom = hash(eventSeed);
  float shapeRandom = hash(eventSeed + vec2(31.0, 97.0));

  float threshold = mix(0.997, 0.88, u_dirt);
  float presence = step(threshold, eventRandom);
  vec2 center = 0.12 + 0.76 * fract(
    vec2(shapeRandom * 17.17, shapeRandom * 43.71)
  );
  vec2 offset = localPosition - center;

  float radiusRandom = fract(shapeRandom * 71.53);
  float radius = mix(0.014, 0.052, radiusRandom * radiusRandom);
  float aspect = mix(0.68, 1.42, fract(shapeRandom * 29.41));
  vec2 warpedOffset = vec2(offset.x * aspect, offset.y);
  warpedOffset += vec2(offset.y * offset.y, offset.x * offset.x)
    * (fract(vec2(shapeRandom * 11.3, shapeRandom * 23.9)) - 0.5)
    * 3.2;

  float distanceToMark = length(warpedOffset) - radius;
  float antialiasWidth = max(fwidth(distanceToMark), 0.001);
  float mark = presence
    * (1.0 - smoothstep(-antialiasWidth, antialiasWidth, distanceToMark));
  float opacityVariation = mix(0.58, 1.0, fract(shapeRandom * 53.27));
  float dirtAlpha = mark * mix(0.12, 0.65, u_dirt) * opacityVariation;
  float lightMark = step(0.9, fract(shapeRandom * 37.19));

  return vec2(dirtAlpha, lightMark);
}

void main() {
  // Plusieurs pixels voisins partagent une même zone lorsque u_size augmente.
  float cellSize = max(u_size * u_pixelRatio, 1.0);
  // 100 / 100 garde les proportions d'origine. Une valeur plus grande étire
  // les formes sur l'axe concerné, sans ajouter d'échantillon de bruit.
  vec2 grainScale = max(u_scale / 100.0, vec2(0.01));
  vec2 grainPosition = gl_FragCoord.xy / (cellSize * grainScale);

  // Le temps est postérisé indépendamment du rafraîchissement de l'écran.
  float temporalFrame = floor(u_time * u_fps);
  float sampledTime = temporalFrame / u_fps;
  float animationTime = sampledTime * u_speed;
  bool usesFlow = u_animationMode > 0.5;

  vec2 basePosition = grainPosition;
  vec2 baseSeedScale = vec2(17.0, 29.0);

  if (usesFlow) {
    // Le champ glisse lentement et ondule sur les deux axes.
    vec2 baseFlow = vec2(
      animationTime * 0.42 + sin(animationTime * 0.31) * 0.35,
      animationTime * 0.17 + cos(animationTime * 0.23) * 0.28
    );
    basePosition += baseFlow;
  }

  float noise = temporalNoise(
    basePosition,
    baseSeedScale,
    vec2(0.0),
    temporalFrame,
    animationTime,
    usesFlow
  );

  // Une deuxième couche se déplace dans une autre direction.
  // Le déphasage entre les deux crée une évolution sans régénération brutale.
  if (u_complexity > 0.001) {
    vec2 detailPosition = grainPosition * 3.15;
    vec2 detailSeedScale = baseSeedScale * 1.37;

    if (usesFlow) {
      vec2 detailFlow = vec2(
        -animationTime * 0.36 + cos(animationTime * 0.19) * 0.4,
        animationTime * 0.51 + sin(animationTime * 0.27) * 0.32
      );
      detailPosition += detailFlow;
    }

    float detailNoise = temporalNoise(
      detailPosition,
      detailSeedScale,
      vec2(71.0, 113.0),
      temporalFrame,
      animationTime,
      usesFlow
    );
    noise = mix(noise, detailNoise, u_complexity * 0.34);

    // Une transformation ridged ajoute du relief sans nouvel échantillon de bruit.
    if (u_complexity > 0.65) {
      float ridgedNoise = 1.0 - abs(detailNoise * 2.0 - 1.0);
      float ridgeAmount = (u_complexity - 0.65) / 0.35;
      noise = mix(noise, ridgedNoise, ridgeAmount * 0.12);
    }
  }

  // Le mélange de fréquences réduit le contraste : on le restaure légèrement.
  noise = clamp(0.5 + (noise - 0.5) * (1.0 + u_complexity * 0.35), 0.0, 1.0);

  float centeredNoise = noise * 2.0 - 1.0;

  // Une carte de densité plus large regroupe le grain sans créer d'aplat coloré.
  // Les valeurs positives et négatives gardent le même équilibre : seule leur
  // présence locale devient plus ou moins forte.
  if (u_character > 0.001) {
    vec2 characterPosition = basePosition * 0.28 + vec2(43.0, 79.0);
    vec2 characterSeedScale = baseSeedScale * 0.61;
    float characterNoise = temporalNoise(
      characterPosition,
      characterSeedScale,
      vec2(149.0, 211.0),
      temporalFrame,
      animationTime,
      usesFlow
    );
    float characterEnvelope = smoothstep(0.12, 0.88, characterNoise);
    float localDensity = mix(0.25, 1.75, characterEnvelope);
    centeredNoise *= mix(1.0, localDensity, u_character);
    centeredNoise = clamp(centeredNoise, -1.0, 1.0);
  }

  // Les valeurs positives déposent la teinte choisie, les négatives du noir.
  float positiveGrain = step(0.0, centeredNoise);
  vec3 grainColor = mix(vec3(0.0), u_color, positiveGrain);
  float grainAlpha = abs(centeredNoise) * u_intensity;

  // Flicker adds a subtle black or white exposure layer below the grain.
  float flickerAlpha = abs(u_flickerExposure);
  vec3 flickerColor = u_flickerExposure >= 0.0
    ? vec3(1.0)
    : vec3(0.0);

  // Both layers use premultiplied alpha for reliable WebKit/iOS blending.
  float combinedAlpha = grainAlpha + flickerAlpha * (1.0 - grainAlpha);
  vec3 combinedColor = grainColor * grainAlpha
    + flickerColor * flickerAlpha * (1.0 - grainAlpha);

  // Dirt sits above flicker and grain. Most marks are black; a small minority
  // are white, like dust and damage catching light in a film copy.
  if (u_dirt > 0.001) {
    vec2 dirt = filmDirt(gl_FragCoord.xy, temporalFrame);
    vec3 dirtColor = vec3(dirt.y);
    combinedColor = dirtColor * dirt.x + combinedColor * (1.0 - dirt.x);
    combinedAlpha = dirt.x + combinedAlpha * (1.0 - dirt.x);
  }

  // A text mask is rasterized only when its layout changes. The GPU samples
  // that alpha map here, so every animated grain frame stays inside the glyphs.
  if (u_maskEnabled > 0.5) {
    vec2 maskSize = vec2(textureSize(u_maskTexture, 0));
    vec2 maskUv = gl_FragCoord.xy / maskSize;
    float maskAlpha = texture(u_maskTexture, maskUv).a;
    combinedColor *= maskAlpha;
    combinedAlpha *= maskAlpha;
  }

  outColor = vec4(combinedColor, combinedAlpha);
}
`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function percentile(values: readonly number[], ratio: number): number {
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor(sortedValues.length * ratio),
  );
  return sortedValues[index] ?? 0;
}

function normalizeHexColor(value: string): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());

  if (!match?.[1]) {
    throw new Error(`Pardigon: couleur hexadécimale invalide (${value}).`);
  }

  const hex = match[1].length === 3
    ? [...match[1]].map((character) => character.repeat(2)).join("")
    : match[1];
  return `#${hex.toLowerCase()}`;
}

function hexToRgb(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function resolvePreset(
  name: GrainPresetName | undefined,
): Readonly<GrainSettings> | undefined {
  if (name === undefined) return undefined;

  const preset = grainPresets[name];

  if (!preset) {
    throw new Error(`Pardigon: preset inconnu (${String(name)}).`);
  }

  return preset;
}

function resolveMaskMode(value: GrainMaskMode | undefined): GrainMaskMode {
  if (value === undefined || value === "none") return "none";
  if (value === "text") return "text";

  throw new Error(`Pardigon: masque inconnu (${String(value)}).`);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Pardigon: impossible de créer un shader WebGL2.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Erreur GLSL inconnue.";
    gl.deleteShader(shader);
    throw new Error(`Pardigon: compilation du shader impossible. ${message}`);
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Pardigon: impossible de créer le programme WebGL2.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Erreur de liaison inconnue.";
    gl.deleteProgram(program);
    throw new Error(`Pardigon: liaison du programme impossible. ${message}`);
  }

  return program;
}

function getUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);

  if (location === null) {
    throw new Error(`Pardigon: uniform GLSL introuvable (${name}).`);
  }

  return location;
}

interface RendererResources {
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  program: WebGLProgram;
  vertexArray: WebGLVertexArrayObject;
  maskTexture: WebGLTexture;
  uniforms: {
    intensity: WebGLUniformLocation;
    color: WebGLUniformLocation;
    size: WebGLUniformLocation;
    scale: WebGLUniformLocation;
    pixelRatio: WebGLUniformLocation;
    time: WebGLUniformLocation;
    blur: WebGLUniformLocation;
    complexity: WebGLUniformLocation;
    character: WebGLUniformLocation;
    continuity: WebGLUniformLocation;
    flickerExposure: WebGLUniformLocation;
    dirt: WebGLUniformLocation;
    speed: WebGLUniformLocation;
    fps: WebGLUniformLocation;
    animationMode: WebGLUniformLocation;
    maskEnabled: WebGLUniformLocation;
    maskTexture: WebGLUniformLocation;
  };
}

interface GpuTimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

function createRendererResources(
  gl: WebGL2RenderingContext,
): RendererResources {
  let vertexShader: WebGLShader | null = null;
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  let vertexArray: WebGLVertexArrayObject | null = null;
  let maskTexture: WebGLTexture | null = null;

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = createProgram(gl, vertexShader, fragmentShader);
    vertexArray = gl.createVertexArray();
    maskTexture = gl.createTexture();

    if (!vertexArray) {
      throw new Error("Pardigon: impossible de créer le vertex array WebGL2.");
    }

    if (!maskTexture) {
      throw new Error("Pardigon: impossible de créer la texture du masque.");
    }

    const resources: RendererResources = {
      vertexShader,
      fragmentShader,
      program,
      vertexArray,
      maskTexture,
      uniforms: {
        intensity: getUniform(gl, program, "u_intensity"),
        color: getUniform(gl, program, "u_color"),
        size: getUniform(gl, program, "u_size"),
        scale: getUniform(gl, program, "u_scale"),
        pixelRatio: getUniform(gl, program, "u_pixelRatio"),
        time: getUniform(gl, program, "u_time"),
        blur: getUniform(gl, program, "u_blur"),
        complexity: getUniform(gl, program, "u_complexity"),
        character: getUniform(gl, program, "u_character"),
        continuity: getUniform(gl, program, "u_continuity"),
        flickerExposure: getUniform(gl, program, "u_flickerExposure"),
        dirt: getUniform(gl, program, "u_dirt"),
        speed: getUniform(gl, program, "u_speed"),
        fps: getUniform(gl, program, "u_fps"),
        animationMode: getUniform(gl, program, "u_animationMode"),
        maskEnabled: getUniform(gl, program, "u_maskEnabled"),
        maskTexture: getUniform(gl, program, "u_maskTexture"),
      },
    };

    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    gl.uniform1i(resources.uniforms.maskTexture, 0);
    return resources;
  } catch (error) {
    if (maskTexture) gl.deleteTexture(maskTexture);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (program) gl.deleteProgram(program);
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    throw error;
  }
}

function deleteRendererResources(
  gl: WebGL2RenderingContext,
  resources: RendererResources | null,
): void {
  if (!resources || gl.isContextLost()) return;
  gl.deleteVertexArray(resources.vertexArray);
  gl.deleteTexture(resources.maskTexture);
  gl.deleteProgram(resources.program);
  gl.deleteShader(resources.vertexShader);
  gl.deleteShader(resources.fragmentShader);
}

export function isWebGL2Supported(): boolean {
  if (typeof document === "undefined") return false;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2");

  if (!context) return false;

  context.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

export function createGrain(options: GrainOptions = {}): GrainInstance {
  if (typeof document === "undefined") {
    throw new Error("Pardigon: createGrain() nécessite un navigateur.");
  }

  const target = options.target ?? document.body;
  const preset = resolvePreset(options.preset);

  if (!target) {
    throw new Error("Pardigon: aucun élément cible disponible.");
  }

  const settings: GrainSettings = {
    intensity: clamp(
      options.intensity ?? preset?.intensity ?? DEFAULT_SETTINGS.intensity,
      0,
      1,
    ),
    color: normalizeHexColor(
      options.color ?? preset?.color ?? DEFAULT_SETTINGS.color,
    ),
    blendMode: resolveBlendMode(
      options.blendMode ?? preset?.blendMode ?? DEFAULT_SETTINGS.blendMode,
    ),
    size: Math.max(options.size ?? preset?.size ?? DEFAULT_SETTINGS.size, 0.1),
    scaleX: Math.max(
      options.scaleX ?? preset?.scaleX ?? DEFAULT_SETTINGS.scaleX,
      1,
    ),
    scaleY: Math.max(
      options.scaleY ?? preset?.scaleY ?? DEFAULT_SETTINGS.scaleY,
      1,
    ),
    animated: options.animated ?? preset?.animated ?? DEFAULT_SETTINGS.animated,
    blur: clamp(options.blur ?? preset?.blur ?? DEFAULT_SETTINGS.blur, 0, 1),
    complexity: clamp(
      options.complexity ?? preset?.complexity ?? DEFAULT_SETTINGS.complexity,
      0,
      1,
    ),
    character: clamp(
      options.character ?? preset?.character ?? DEFAULT_SETTINGS.character,
      0,
      1,
    ),
    continuity: clamp(
      options.continuity ?? preset?.continuity ?? DEFAULT_SETTINGS.continuity,
      0,
      1,
    ),
    flicker: clamp(
      options.flicker ?? preset?.flicker ?? DEFAULT_SETTINGS.flicker,
      0,
      1,
    ),
    dirt: clamp(
      options.dirt ?? preset?.dirt ?? DEFAULT_SETTINGS.dirt,
      0,
      1,
    ),
    speed: Math.max(options.speed ?? preset?.speed ?? DEFAULT_SETTINGS.speed, 0.05),
    fps: clamp(options.fps ?? preset?.fps ?? DEFAULT_SETTINGS.fps, 1, 60),
    animationMode:
      options.animationMode
      ?? preset?.animationMode
      ?? DEFAULT_SETTINGS.animationMode,
  };
  let colorComponents = hexToRgb(settings.color);
  let maskMode = resolveMaskMode(options.mask);

  const isFullscreenTarget = target === document.body || target === document.documentElement;
  const previousTargetPosition = target.style.position;
  const didSetTargetPosition = !isFullscreenTarget && getComputedStyle(target).position === "static";

  const canvas = document.createElement("canvas");
  const maskCanvas = document.createElement("canvas");
  canvas.dataset.grainOverlay = "";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: isFullscreenTarget ? "fixed" : "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: isFullscreenTarget ? "2147483647" : "1",
    mixBlendMode: settings.blendMode,
  });

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    throw new Error("Pardigon: WebGL2 n'est pas disponible dans ce navigateur.");
  }

  const getGpuTimerExtension = (): GpuTimerExtension | null =>
    gl.getExtension("EXT_disjoint_timer_query_webgl2") as GpuTimerExtension | null;

  let resources: RendererResources | null = createRendererResources(gl);
  let gpuTimerExtension = getGpuTimerExtension();
  let pendingGpuQuery: WebGLQuery | null = null;
  let gpuTimeMs: number | null = null;
  let lastGpuSampleTimestamp = -Infinity;

  let animationFrameId: number | null = null;
  let elapsedTime = 0;
  let previousTimestamp: number | null = null;
  let lastRenderTimestamp: number | null = null;
  let pixelRatio = 1;
  let destroyed = false;
  let targetVisible = true;
  let respectReducedMotion = options.respectReducedMotion ?? true;
  let qualityMode: GrainQualityMode = options.quality === "auto" ? "auto" : "fixed";
  let qualityLevel = 0;
  let qualitySampleStartedAt: number | null = null;
  let qualityFrameIntervals: number[] = [];
  let poorQualitySampleCount = 0;
  let stableQualitySampleCount = 0;
  let renderedFrames = 0;
  let lateFrames = 0;
  let actualFps: number | null = null;
  let frameTimeP95Ms: number | null = null;
  let performanceSampleStartedAt = performance.now();
  let performanceSampleRenderedFrames = 0;
  let performanceFrameIntervals: number[] = [];
  let previousPerformanceRenderTimestamp: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let maskMutationObserver: MutationObserver | null = null;
  const reducedMotionQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  if (didSetTargetPosition) {
    target.style.position = "relative";
  }
  target.appendChild(canvas);

  const getQualityLevel = () =>
    AUTO_QUALITY_LEVELS[qualityLevel] ?? AUTO_QUALITY_LEVELS[0];

  const getDeviceFpsLimit = (): number => window.innerWidth <= 768 ? 24 : 60;

  const getEffectiveFps = (): number => {
    const requestedFps = Math.min(settings.fps, getDeviceFpsLimit());
    return Math.max(1, requestedFps * getQualityLevel().fpsScale);
  };

  const getEffectiveComplexity = (): number =>
    settings.complexity * getQualityLevel().complexityScale;

  const resetQualitySamples = (): void => {
    qualitySampleStartedAt = null;
    qualityFrameIntervals = [];
    poorQualitySampleCount = 0;
    stableQualitySampleCount = 0;
  };

  const sampleAdaptiveQuality = (
    timestamp: number,
    frameInterval: number,
  ): boolean => {
    if (qualityMode !== "auto" || frameInterval <= 0 || frameInterval >= 250) {
      return false;
    }

    qualitySampleStartedAt ??= timestamp;
    qualityFrameIntervals.push(frameInterval);

    if (timestamp - qualitySampleStartedAt < AUTO_QUALITY_SAMPLE_DURATION_MS) {
      return false;
    }

    const frameTimeP95 = percentile(qualityFrameIntervals, 0.95);
    const slowFrames = qualityFrameIntervals.filter(
      (interval) => interval > AUTO_QUALITY_SLOW_FRAME_MS,
    ).length;
    const slowFrameRatio = slowFrames / qualityFrameIntervals.length;
    const isPoor = frameTimeP95 > 28 || slowFrameRatio > 0.18;
    const isStable = frameTimeP95 < 20 && slowFrameRatio < 0.05;

    poorQualitySampleCount = isPoor ? poorQualitySampleCount + 1 : 0;
    stableQualitySampleCount = isStable ? stableQualitySampleCount + 1 : 0;
    qualitySampleStartedAt = timestamp;
    qualityFrameIntervals = [];

    if (
      poorQualitySampleCount >= AUTO_QUALITY_POOR_SAMPLE_COUNT
      && qualityLevel < AUTO_QUALITY_LEVELS.length - 1
    ) {
      qualityLevel += 1;
      poorQualitySampleCount = 0;
      stableQualitySampleCount = 0;
      return true;
    }

    if (
      stableQualitySampleCount >= AUTO_QUALITY_STABLE_SAMPLE_COUNT
      && qualityLevel > 0
    ) {
      qualityLevel -= 1;
      poorQualitySampleCount = 0;
      stableQualitySampleCount = 0;
      return true;
    }

    return false;
  };

  const pollGpuTimer = (): void => {
    const extension = gpuTimerExtension;
    const query = pendingGpuQuery;
    if (!extension || !query || gl.isContextLost()) return;

    const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean;
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT) as boolean;

    if (!available && !disjoint) return;

    if (available && !disjoint) {
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      gpuTimeMs = nanoseconds / 1_000_000;
    } else if (disjoint) {
      gpuTimeMs = null;
    }

    gl.deleteQuery(query);
    pendingGpuQuery = null;
  };

  const startGpuTimer = (): WebGLQuery | null => {
    pollGpuTimer();

    const extension = gpuTimerExtension;
    const now = performance.now();
    if (
      !extension
      || pendingGpuQuery
      || now - lastGpuSampleTimestamp < 1_000
      || gl.isContextLost()
    ) {
      return null;
    }

    const query = gl.createQuery();
    if (!query) return null;

    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    lastGpuSampleTimestamp = now;
    return query;
  };

  const finishGpuTimer = (query: WebGLQuery | null): void => {
    const extension = gpuTimerExtension;
    if (!extension || !query || gl.isContextLost()) return;
    gl.endQuery(extension.TIME_ELAPSED_EXT);
    pendingGpuQuery = query;
  };

  const recordRenderedFrame = (timestamp: number): void => {
    renderedFrames += 1;
    performanceSampleRenderedFrames += 1;

    if (previousPerformanceRenderTimestamp !== null) {
      const interval = timestamp - previousPerformanceRenderTimestamp;
      if (interval > 0) performanceFrameIntervals.push(interval);
    }

    previousPerformanceRenderTimestamp = timestamp;
  };

  const updatePerformanceSample = (timestamp: number): void => {
    const sampleDuration = timestamp - performanceSampleStartedAt;
    if (sampleDuration < PERFORMANCE_SAMPLE_DURATION_MS) return;

    actualFps = (performanceSampleRenderedFrames * 1_000) / sampleDuration;
    frameTimeP95Ms = performanceFrameIntervals.length > 0
      ? percentile(performanceFrameIntervals, 0.95)
      : null;
    performanceSampleStartedAt = timestamp;
    performanceSampleRenderedFrames = 0;
    performanceFrameIntervals = [];
  };

  const resetPerformanceSample = (timestamp = performance.now()): void => {
    performanceSampleStartedAt = timestamp;
    performanceSampleRenderedFrames = 0;
    performanceFrameIntervals = [];
    previousPerformanceRenderTimestamp = null;
    actualFps = null;
    frameTimeP95Ms = null;
  };

  const updateMaskTexture = (): void => {
    const currentResources = resources;
    if (!currentResources || gl.isContextLost() || maskMode !== "text") return;

    const context = maskCanvas.getContext("2d");
    if (!context) {
      throw new Error("Pardigon: impossible de créer le masque texte.");
    }

    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    const style = getComputedStyle(target);
    const cssWidth = canvas.width / pixelRatio;
    const cssHeight = canvas.height / pixelRatio;
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const textTransform = style.textTransform;
    const rawText = target.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const text = textTransform === "uppercase"
      ? rawText.toUpperCase()
      : textTransform === "lowercase"
        ? rawText.toLowerCase()
        : rawText;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = "#ffffff";
    context.textBaseline = "alphabetic";
    context.textAlign = style.textAlign === "center"
      ? "center"
      : style.textAlign === "right" || style.textAlign === "end"
        ? "right"
        : "left";
    context.direction = style.direction === "rtl" ? "rtl" : "ltr";
    context.font = [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      style.fontSize,
      style.fontFamily,
    ].join(" ");

    const spacedContext = context as CanvasRenderingContext2D & {
      letterSpacing?: string;
    };
    if ("letterSpacing" in spacedContext) {
      spacedContext.letterSpacing = style.letterSpacing;
    }

    const x = context.textAlign === "center"
      ? cssWidth / 2
      : context.textAlign === "right"
        ? cssWidth - paddingRight
        : paddingLeft;
    const metrics = context.measureText(text);
    const fontAscent = metrics.fontBoundingBoxAscent
      || metrics.actualBoundingBoxAscent;
    const fontDescent = metrics.fontBoundingBoxDescent
      || metrics.actualBoundingBoxDescent;
    const contentHeight = cssHeight - paddingTop - paddingBottom;
    const y = paddingTop
      + (contentHeight - fontAscent - fontDescent) / 2
      + fontAscent;
    context.fillText(text, x, y);
    context.setTransform(1, 0, 0, 1, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentResources.maskTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      maskCanvas,
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  };

  const render = (timestamp = performance.now()): void => {
    const currentResources = resources;
    if (!currentResources || gl.isContextLost()) return;

    const { uniforms } = currentResources;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.intensity, settings.intensity);
    gl.uniform3f(uniforms.color, ...colorComponents);
    gl.uniform1f(uniforms.size, settings.size);
    gl.uniform2f(uniforms.scale, settings.scaleX, settings.scaleY);
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);
    gl.uniform1f(uniforms.time, elapsedTime);
    gl.uniform1f(uniforms.blur, settings.blur);
    gl.uniform1f(uniforms.complexity, getEffectiveComplexity());
    gl.uniform1f(uniforms.character, settings.character);
    gl.uniform1f(uniforms.continuity, settings.continuity);
    gl.uniform1f(uniforms.dirt, settings.dirt);
    gl.uniform1f(
      uniforms.flickerExposure,
      shouldAnimate()
        ? calculateFlickerExposure(
            elapsedTime,
            settings.flicker,
            getEffectiveFps(),
            settings.speed,
          )
        : 0,
    );
    gl.uniform1f(uniforms.speed, settings.speed);
    gl.uniform1f(uniforms.fps, getEffectiveFps());
    gl.uniform1f(uniforms.animationMode, settings.animationMode === "flow" ? 1 : 0);
    gl.uniform1f(uniforms.maskEnabled, maskMode === "text" ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentResources.maskTexture);
    const gpuQuery = startGpuTimer();
    try {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      recordRenderedFrame(timestamp);
    } finally {
      finishGpuTimer(gpuQuery);
    }
  };

  const shouldAnimate = (): boolean =>
    settings.animated
    && !(respectReducedMotion && reducedMotionQuery?.matches === true);

  const loop = (timestamp: number): void => {
    if (destroyed || !shouldAnimate() || gl.isContextLost()) {
      animationFrameId = null;
      previousTimestamp = null;
      return;
    }

    const frameInterval = previousTimestamp === null ? 0 : timestamp - previousTimestamp;
    if (previousTimestamp !== null) {
      elapsedTime += Math.min(frameInterval, 100) / 1000;
    }
    previousTimestamp = timestamp;
    const qualityChanged = sampleAdaptiveQuality(timestamp, frameInterval);
    // La cadence reste fluide ; speed ne ralentit que le mouvement du champ.
    const targetFps = getEffectiveFps();
    if (qualityChanged) {
      resize();
      lastRenderTimestamp = timestamp;
    } else {
      const schedule = calculateFrameSchedule(
        timestamp,
        lastRenderTimestamp,
        targetFps,
      );

      if (schedule.shouldRender) {
        lateFrames += schedule.lateFrames;
        render(timestamp);
        lastRenderTimestamp = schedule.nextRenderTimestamp;
      }
    }
    updatePerformanceSample(timestamp);
    animationFrameId = requestAnimationFrame(loop);
  };

  const startLoop = (): void => {
    if (
      !destroyed
      && !document.hidden
      && targetVisible
      && shouldAnimate()
      && !gl.isContextLost()
      && animationFrameId === null
    ) {
      resetQualitySamples();
      resetPerformanceSample();
      lastRenderTimestamp = null;
      animationFrameId = requestAnimationFrame(loop);
    }
  };

  const stopLoop = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    previousTimestamp = null;
    lastRenderTimestamp = null;
    qualitySampleStartedAt = null;
    qualityFrameIntervals = [];
    resetPerformanceSample();
    actualFps = 0;
  };

  const resize = (): void => {
    // Le grain n'a pas besoin de la pleine résolution Retina d'une interface.
    // Sur téléphone, 1 pixel de rendu par pixel CSS réduit fortement la charge GPU.
    const pixelRatioLimit = window.innerWidth <= 768 ? 1 : 1.5;
    const basePixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioLimit);
    pixelRatio = basePixelRatio * getQualityLevel().renderScale;
    const width = isFullscreenTarget ? window.innerWidth : target.clientWidth;
    const height = isFullscreenTarget ? window.innerHeight : target.clientHeight;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    updateMaskTexture();
    render();
  };

  const handleVisibilityChange = (): void => {
    if (document.hidden) stopLoop();
    else startLoop();
  };

  const handleReducedMotionChange = (): void => {
    if (shouldAnimate()) startLoop();
    else {
      stopLoop();
      render();
    }
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    stopLoop();
    resources = null;
    gpuTimerExtension = null;
    pendingGpuQuery = null;
    gpuTimeMs = null;
  };

  const handleContextRestored = (): void => {
    if (destroyed) return;

    try {
      resources = createRendererResources(gl);
      gpuTimerExtension = getGpuTimerExtension();
      lastGpuSampleTimestamp = -Infinity;
      resize();
      startLoop();
    } catch (error) {
      resources = null;
      console.error("Pardigon: restauration du contexte WebGL2 impossible.", error);
    }
  };

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  reducedMotionQuery?.addEventListener("change", handleReducedMotionChange);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  if (!isFullscreenTarget && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(target);
  }
  if (!isFullscreenTarget && "IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      targetVisible = entry?.isIntersecting ?? true;
      if (targetVisible) startLoop();
      else stopLoop();
    });
    intersectionObserver.observe(target);
  }
  if (!isFullscreenTarget && "MutationObserver" in window) {
    maskMutationObserver = new MutationObserver(() => {
      if (destroyed || maskMode !== "text") return;
      updateMaskTexture();
      render();
    });
    maskMutationObserver.observe(target, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }
  resize();
  startLoop();
  void document.fonts?.ready.then(() => {
    if (!destroyed && maskMode === "text") resize();
  });

  return {
    update(nextOptions): void {
      if (destroyed) return;

      const nextPreset = resolvePreset(nextOptions.preset);
      const resolvedOptions = nextPreset
        ? { ...nextPreset, ...nextOptions }
        : nextOptions;

      if (resolvedOptions.intensity !== undefined) {
        settings.intensity = clamp(resolvedOptions.intensity, 0, 1);
      }

      if (resolvedOptions.color !== undefined) {
        settings.color = normalizeHexColor(resolvedOptions.color);
        colorComponents = hexToRgb(settings.color);
      }

      if (resolvedOptions.blendMode !== undefined) {
        settings.blendMode = resolveBlendMode(resolvedOptions.blendMode);
        canvas.style.mixBlendMode = settings.blendMode;
      }

      if (resolvedOptions.size !== undefined) {
        settings.size = Math.max(resolvedOptions.size, 0.1);
      }

      if (resolvedOptions.scaleX !== undefined) {
        settings.scaleX = Math.max(resolvedOptions.scaleX, 1);
      }

      if (resolvedOptions.scaleY !== undefined) {
        settings.scaleY = Math.max(resolvedOptions.scaleY, 1);
      }

      if (resolvedOptions.animated !== undefined) {
        settings.animated = resolvedOptions.animated;
      }

      if (resolvedOptions.blur !== undefined) {
        settings.blur = clamp(resolvedOptions.blur, 0, 1);
      }

      if (resolvedOptions.complexity !== undefined) {
        settings.complexity = clamp(resolvedOptions.complexity, 0, 1);
      }

      if (resolvedOptions.character !== undefined) {
        settings.character = clamp(resolvedOptions.character, 0, 1);
      }

      if (resolvedOptions.continuity !== undefined) {
        settings.continuity = clamp(resolvedOptions.continuity, 0, 1);
      }

      if (resolvedOptions.flicker !== undefined) {
        settings.flicker = clamp(resolvedOptions.flicker, 0, 1);
      }

      if (resolvedOptions.dirt !== undefined) {
        settings.dirt = clamp(resolvedOptions.dirt, 0, 1);
      }

      if (resolvedOptions.speed !== undefined) {
        settings.speed = Math.max(resolvedOptions.speed, 0.05);
      }

      if (resolvedOptions.fps !== undefined) {
        settings.fps = clamp(resolvedOptions.fps, 1, 60);
        lastRenderTimestamp = null;
      }

      if (resolvedOptions.animationMode !== undefined) {
        settings.animationMode = resolvedOptions.animationMode;
      }

      if (resolvedOptions.respectReducedMotion !== undefined) {
        respectReducedMotion = resolvedOptions.respectReducedMotion;
      }

      if (resolvedOptions.mask !== undefined) {
        maskMode = resolveMaskMode(resolvedOptions.mask);
        updateMaskTexture();
      }

      let qualityChanged = false;
      if (resolvedOptions.quality !== undefined) {
        qualityMode = resolvedOptions.quality === "auto" ? "auto" : "fixed";
        qualityChanged = qualityLevel !== 0;
        qualityLevel = 0;
        resetQualitySamples();
        lastRenderTimestamp = null;
      }

      if (shouldAnimate()) startLoop();
      else stopLoop();
      if (qualityChanged) resize();
      else render();
    },

    getMetrics(): GrainMetrics {
      pollGpuTimer();
      updatePerformanceSample(performance.now());
      const isAnimationRunning = animationFrameId !== null;
      return {
        gpuTimeMs,
        gpuTimerSupported: gpuTimerExtension !== null,
        quality: qualityMode,
        qualityLevel,
        renderScale: getQualityLevel().renderScale,
        effectiveFps: getEffectiveFps(),
        effectiveComplexity: getEffectiveComplexity(),
        actualFps: isAnimationRunning ? actualFps : 0,
        renderedFrames,
        lateFrames,
        frameTimeP95Ms: isAnimationRunning ? frameTimeP95Ms : null,
      };
    },

    pause(): void {
      if (destroyed) return;
      settings.animated = false;
      stopLoop();
      render();
    },

    play(): void {
      if (destroyed) return;
      settings.animated = true;
      startLoop();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      maskMutationObserver?.disconnect();
      if (pendingGpuQuery && !gl.isContextLost()) {
        gl.deleteQuery(pendingGpuQuery);
      }
      pendingGpuQuery = null;
      deleteRendererResources(gl, resources);
      resources = null;
      if (!gl.isContextLost()) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
      if (didSetTargetPosition && target.style.position === "relative") {
        target.style.position = previousTargetPosition;
      }
    },
  };
}
