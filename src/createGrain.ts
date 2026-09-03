import { grainPresets } from "./presets";
import type {
  GrainInstance,
  GrainMetrics,
  GrainOptions,
  GrainPresetName,
  GrainQualityMode,
  GrainSettings,
} from "./types";

export type {
  GrainAnimationMode,
  GrainInstance,
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
  size: 1,
  animated: true,
  blur: 0,
  complexity: 0.35,
  character: 0,
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
uniform float u_pixelRatio;
uniform float u_time;
uniform float u_blur;
uniform float u_complexity;
uniform float u_character;
uniform float u_speed;
uniform float u_fps;
uniform float u_animationMode;

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

void main() {
  // Plusieurs pixels voisins partagent une même zone lorsque u_size augmente.
  float cellSize = max(u_size * u_pixelRatio, 1.0);
  vec2 grainPosition = gl_FragCoord.xy / cellSize;

  // Le temps est postérisé indépendamment du rafraîchissement de l'écran.
  float temporalFrame = floor(u_time * u_fps);
  float sampledTime = temporalFrame / u_fps;
  float animationTime = sampledTime * u_speed;
  bool usesFlow = u_animationMode > 0.5;

  vec2 basePosition = grainPosition;
  vec2 baseSeed = vec2(
    floor(temporalFrame * u_speed) * 17.0,
    floor(temporalFrame * u_speed) * 29.0
  );

  if (usesFlow) {
    // Le champ glisse lentement et ondule sur les deux axes.
    vec2 baseFlow = vec2(
      animationTime * 0.42 + sin(animationTime * 0.31) * 0.35,
      animationTime * 0.17 + cos(animationTime * 0.23) * 0.28
    );
    basePosition += baseFlow;
    baseSeed = vec2(0.0);
  }

  float noise = valueNoise(basePosition, baseSeed);

  // Une deuxième couche se déplace dans une autre direction.
  // Le déphasage entre les deux crée une évolution sans régénération brutale.
  if (u_complexity > 0.001) {
    vec2 detailPosition = grainPosition * 3.15;
    vec2 detailSeed = baseSeed * 1.37 + vec2(71.0, 113.0);

    if (usesFlow) {
      vec2 detailFlow = vec2(
        -animationTime * 0.36 + cos(animationTime * 0.19) * 0.4,
        animationTime * 0.51 + sin(animationTime * 0.27) * 0.32
      );
      detailPosition += detailFlow;
      detailSeed = vec2(71.0, 113.0);
    }

    float detailNoise = valueNoise(detailPosition, detailSeed);
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
    vec2 characterSeed = baseSeed * 0.61 + vec2(149.0, 211.0);
    float characterNoise = valueNoise(characterPosition, characterSeed);
    float characterEnvelope = smoothstep(0.12, 0.88, characterNoise);
    float localDensity = mix(0.25, 1.75, characterEnvelope);
    centeredNoise *= mix(1.0, localDensity, u_character);
    centeredNoise = clamp(centeredNoise, -1.0, 1.0);
  }

  // Les valeurs positives déposent la teinte choisie, les négatives du noir.
  float positiveGrain = step(0.0, centeredNoise);
  vec3 grainColor = mix(vec3(0.0), u_color, positiveGrain);
  float grainAlpha = abs(centeredNoise) * u_intensity;

  // Le canvas utilise un alpha prémultiplié : RGB doit donc déjà contenir alpha.
  // Cela conserve le même mélange visuel et évite les aplats opaques sur WebKit/iOS.
  outColor = vec4(grainColor * grainAlpha, grainAlpha);
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
  uniforms: {
    intensity: WebGLUniformLocation;
    color: WebGLUniformLocation;
    size: WebGLUniformLocation;
    pixelRatio: WebGLUniformLocation;
    time: WebGLUniformLocation;
    blur: WebGLUniformLocation;
    complexity: WebGLUniformLocation;
    character: WebGLUniformLocation;
    speed: WebGLUniformLocation;
    fps: WebGLUniformLocation;
    animationMode: WebGLUniformLocation;
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

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = createProgram(gl, vertexShader, fragmentShader);
    vertexArray = gl.createVertexArray();

    if (!vertexArray) {
      throw new Error("Pardigon: impossible de créer le vertex array WebGL2.");
    }

    const resources: RendererResources = {
      vertexShader,
      fragmentShader,
      program,
      vertexArray,
      uniforms: {
        intensity: getUniform(gl, program, "u_intensity"),
        color: getUniform(gl, program, "u_color"),
        size: getUniform(gl, program, "u_size"),
        pixelRatio: getUniform(gl, program, "u_pixelRatio"),
        time: getUniform(gl, program, "u_time"),
        blur: getUniform(gl, program, "u_blur"),
        complexity: getUniform(gl, program, "u_complexity"),
        character: getUniform(gl, program, "u_character"),
        speed: getUniform(gl, program, "u_speed"),
        fps: getUniform(gl, program, "u_fps"),
        animationMode: getUniform(gl, program, "u_animationMode"),
      },
    };

    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    return resources;
  } catch (error) {
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
    size: Math.max(options.size ?? preset?.size ?? DEFAULT_SETTINGS.size, 0.1),
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
    speed: Math.max(options.speed ?? preset?.speed ?? DEFAULT_SETTINGS.speed, 0.05),
    fps: clamp(options.fps ?? preset?.fps ?? DEFAULT_SETTINGS.fps, 1, 60),
    animationMode:
      options.animationMode
      ?? preset?.animationMode
      ?? DEFAULT_SETTINGS.animationMode,
  };
  let colorComponents = hexToRgb(settings.color);

  const isFullscreenTarget = target === document.body || target === document.documentElement;
  const previousTargetPosition = target.style.position;
  const didSetTargetPosition = !isFullscreenTarget && getComputedStyle(target).position === "static";

  const canvas = document.createElement("canvas");
  canvas.dataset.grainOverlay = "";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: isFullscreenTarget ? "fixed" : "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: isFullscreenTarget ? "2147483647" : "1",
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
  let lastRenderTimestamp = -Infinity;
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
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
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

  const render = (): void => {
    const currentResources = resources;
    if (!currentResources || gl.isContextLost()) return;

    const { uniforms } = currentResources;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.intensity, settings.intensity);
    gl.uniform3f(uniforms.color, ...colorComponents);
    gl.uniform1f(uniforms.size, settings.size);
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);
    gl.uniform1f(uniforms.time, elapsedTime);
    gl.uniform1f(uniforms.blur, settings.blur);
    gl.uniform1f(uniforms.complexity, getEffectiveComplexity());
    gl.uniform1f(uniforms.character, settings.character);
    gl.uniform1f(uniforms.speed, settings.speed);
    gl.uniform1f(uniforms.fps, getEffectiveFps());
    gl.uniform1f(uniforms.animationMode, settings.animationMode === "flow" ? 1 : 0);
    const gpuQuery = startGpuTimer();
    try {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    } else if (timestamp - lastRenderTimestamp >= 1000 / targetFps) {
      render();
      lastRenderTimestamp = timestamp;
    }
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
      animationFrameId = requestAnimationFrame(loop);
    }
  };

  const stopLoop = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    previousTimestamp = null;
    qualitySampleStartedAt = null;
    qualityFrameIntervals = [];
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
  resize();
  startLoop();

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

      if (resolvedOptions.size !== undefined) {
        settings.size = Math.max(resolvedOptions.size, 0.1);
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

      if (resolvedOptions.speed !== undefined) {
        settings.speed = Math.max(resolvedOptions.speed, 0.05);
      }

      if (resolvedOptions.fps !== undefined) {
        settings.fps = clamp(resolvedOptions.fps, 1, 60);
      }

      if (resolvedOptions.animationMode !== undefined) {
        settings.animationMode = resolvedOptions.animationMode;
      }

      if (resolvedOptions.respectReducedMotion !== undefined) {
        respectReducedMotion = resolvedOptions.respectReducedMotion;
      }

      let qualityChanged = false;
      if (resolvedOptions.quality !== undefined) {
        qualityMode = resolvedOptions.quality === "auto" ? "auto" : "fixed";
        qualityChanged = qualityLevel !== 0;
        qualityLevel = 0;
        resetQualitySamples();
      }

      if (shouldAnimate()) startLoop();
      else stopLoop();
      if (qualityChanged) resize();
      else render();
    },

    getMetrics(): GrainMetrics {
      pollGpuTimer();
      return {
        gpuTimeMs,
        gpuTimerSupported: gpuTimerExtension !== null,
        quality: qualityMode,
        qualityLevel,
        renderScale: getQualityLevel().renderScale,
        effectiveFps: getEffectiveFps(),
        effectiveComplexity: getEffectiveComplexity(),
      };
    },

    pause(): void {
      if (destroyed) return;
      settings.animated = false;
      stopLoop();
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
