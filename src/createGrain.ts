import {
  INITIAL_ADAPTIVE_QUALITY,
  evaluateQualitySample,
  interruptQualitySampling,
  percentile,
} from "./adaptiveQuality.js";
import { calculateFlickerExposure } from "./flicker.js";
import { calculateFrameSchedule } from "./frameScheduler.js";
import {
  DEFAULT_SETTINGS,
  clamp,
  requireBoolean,
  requireFiniteNumber,
  resolveMaskMode,
  resolvePreset,
  resolveQualityMode,
  resolveSettings,
} from "./settings.js";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders.js";
import {
  buildCanvasFont,
  resolveAnchorX,
  resolveFontStretch,
  resolveTextAlign,
} from "./textMask.js";
import type {
  GrainInstance,
  GrainLuminanceFit,
  GrainLuminanceOptions,
  GrainLuminanceRange,
  GrainLuminanceSource,
  GrainMetrics,
  GrainOptions,
  GrainQualityMode,
} from "./types.js";

const AUTO_QUALITY_LEVELS = [
  { renderScale: 1, complexityScale: 1, fpsScale: 1 },
  { renderScale: 0.85, complexityScale: 1, fpsScale: 1 },
  { renderScale: 0.7, complexityScale: 0, fpsScale: 1 },
  { renderScale: 0.55, complexityScale: 0, fpsScale: 0.75 },
] as const;

const AUTO_QUALITY_SAMPLE_DURATION_MS = 1_000;
const PERFORMANCE_SAMPLE_DURATION_MS = 1_000;
const MOBILE_BREAKPOINT_PX = 768;

interface PositionedTarget {
  instances: number;
  previousPosition: string;
}

/**
 * Local targets whose static position Pardigon replaced with relative. The
 * entry is shared by every instance on the same element, so destroying one
 * of them cannot restore the position while another one still needs it.
 */
const positionedTargets = new WeakMap<HTMLElement, PositionedTarget>();

function hexToRgb(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

interface ResolvedLuminanceOptions {
  enabled: boolean;
  source: GrainLuminanceSource | null;
  response: number;
  range: GrainLuminanceRange;
  fit: GrainLuminanceFit;
}

const DEFAULT_LUMINANCE_OPTIONS: Readonly<ResolvedLuminanceOptions> =
  Object.freeze({
    enabled: false,
    source: null,
    response: 0.75,
    range: "midtones",
    fit: "cover",
  });

function isLuminanceSource(value: unknown): value is GrainLuminanceSource {
  return value instanceof HTMLImageElement
    || value instanceof HTMLVideoElement
    || value instanceof HTMLCanvasElement;
}

function getLuminanceSourceSize(
  source: GrainLuminanceSource,
): readonly [number, number] {
  if (source instanceof HTMLImageElement) {
    return [source.naturalWidth, source.naturalHeight];
  }
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth, source.videoHeight];
  }
  return [source.width, source.height];
}

function resolveLuminanceOptions(
  value: GrainLuminanceOptions | false | undefined,
  previous?: ResolvedLuminanceOptions,
): ResolvedLuminanceOptions {
  const base = previous ?? DEFAULT_LUMINANCE_OPTIONS;

  if (value === undefined) return { ...base };
  if (value === false) return { ...base, enabled: false };

  const source = value.source ?? base.source;
  if (!isLuminanceSource(source)) {
    throw new Error(
      "Pardigon: luminance.source must be an image, a video or a canvas.",
    );
  }

  const range = value.range ?? base.range;
  if (range !== "shadows" && range !== "midtones" && range !== "highlights") {
    throw new Error(`Pardigon: unknown luminance range (${String(range)}).`);
  }

  const fit = value.fit ?? base.fit;
  if (fit !== "cover" && fit !== "contain" && fit !== "stretch") {
    throw new Error(`Pardigon: unknown luminance fit (${String(fit)}).`);
  }

  const response = requireFiniteNumber(
    "luminance.response",
    value.response ?? base.response,
  );

  return {
    enabled: true,
    source,
    response: clamp(response, 0, 1),
    range,
    fit,
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Pardigon: could not create a WebGL2 shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown GLSL error.";
    gl.deleteShader(shader);
    throw new Error(`Pardigon: shader compilation failed. ${message}`);
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
    throw new Error("Pardigon: could not create the WebGL2 program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown link error.";
    gl.deleteProgram(program);
    throw new Error(`Pardigon: program linking failed. ${message}`);
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
    throw new Error(`Pardigon: GLSL uniform not found (${name}).`);
  }

  return location;
}

interface RendererResources {
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  program: WebGLProgram;
  vertexArray: WebGLVertexArrayObject;
  maskTexture: WebGLTexture;
  luminanceTexture: WebGLTexture;
  uniforms: {
    intensity: WebGLUniformLocation;
    color: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    size: WebGLUniformLocation;
    scale: WebGLUniformLocation;
    pixelRatio: WebGLUniformLocation;
    time: WebGLUniformLocation;
    blur: WebGLUniformLocation;
    complexity: WebGLUniformLocation;
    character: WebGLUniformLocation;
    chromatic: WebGLUniformLocation;
    continuity: WebGLUniformLocation;
    flickerExposure: WebGLUniformLocation;
    dirt: WebGLUniformLocation;
    speed: WebGLUniformLocation;
    fps: WebGLUniformLocation;
    animationMode: WebGLUniformLocation;
    maskEnabled: WebGLUniformLocation;
    maskTexture: WebGLUniformLocation;
    luminanceEnabled: WebGLUniformLocation;
    luminanceResponse: WebGLUniformLocation;
    luminanceRange: WebGLUniformLocation;
    luminanceFit: WebGLUniformLocation;
    sourceAspect: WebGLUniformLocation;
    targetAspect: WebGLUniformLocation;
    luminanceTexture: WebGLUniformLocation;
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
  let luminanceTexture: WebGLTexture | null = null;

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = createProgram(gl, vertexShader, fragmentShader);
    vertexArray = gl.createVertexArray();
    maskTexture = gl.createTexture();
    luminanceTexture = gl.createTexture();

    if (!vertexArray) {
      throw new Error("Pardigon: could not create the WebGL2 vertex array.");
    }

    if (!maskTexture) {
      throw new Error("Pardigon: could not create the mask texture.");
    }

    if (!luminanceTexture) {
      throw new Error("Pardigon: could not create the luminance texture.");
    }

    const resources: RendererResources = {
      vertexShader,
      fragmentShader,
      program,
      vertexArray,
      maskTexture,
      luminanceTexture,
      uniforms: {
        intensity: getUniform(gl, program, "u_intensity"),
        color: getUniform(gl, program, "u_color"),
        resolution: getUniform(gl, program, "u_resolution"),
        size: getUniform(gl, program, "u_size"),
        scale: getUniform(gl, program, "u_scale"),
        pixelRatio: getUniform(gl, program, "u_pixelRatio"),
        time: getUniform(gl, program, "u_time"),
        blur: getUniform(gl, program, "u_blur"),
        complexity: getUniform(gl, program, "u_complexity"),
        character: getUniform(gl, program, "u_character"),
        chromatic: getUniform(gl, program, "u_chromatic"),
        continuity: getUniform(gl, program, "u_continuity"),
        flickerExposure: getUniform(gl, program, "u_flickerExposure"),
        dirt: getUniform(gl, program, "u_dirt"),
        speed: getUniform(gl, program, "u_speed"),
        fps: getUniform(gl, program, "u_fps"),
        animationMode: getUniform(gl, program, "u_animationMode"),
        maskEnabled: getUniform(gl, program, "u_maskEnabled"),
        maskTexture: getUniform(gl, program, "u_maskTexture"),
        luminanceEnabled: getUniform(gl, program, "u_luminanceEnabled"),
        luminanceResponse: getUniform(gl, program, "u_luminanceResponse"),
        luminanceRange: getUniform(gl, program, "u_luminanceRange"),
        luminanceFit: getUniform(gl, program, "u_luminanceFit"),
        sourceAspect: getUniform(gl, program, "u_sourceAspect"),
        targetAspect: getUniform(gl, program, "u_targetAspect"),
        luminanceTexture: getUniform(gl, program, "u_luminanceTexture"),
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
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, luminanceTexture);
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
      new Uint8Array([128, 128, 128, 255]),
    );
    gl.uniform1i(resources.uniforms.luminanceTexture, 1);
    return resources;
  } catch (error) {
    if (luminanceTexture) gl.deleteTexture(luminanceTexture);
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
  gl.deleteTexture(resources.luminanceTexture);
  gl.deleteProgram(resources.program);
  gl.deleteShader(resources.vertexShader);
  gl.deleteShader(resources.fragmentShader);
}

interface MeasuredTextLine {
  text: string;
  left: number;
  right: number;
  top: number;
}

/**
 * Reads the rendered text of a target and where the browser placed its line,
 * in the CSS pixels of the grain canvas. Measuring the real layout keeps the
 * mask aligned with padding, text-indent, flexbox centring and line height.
 */
function measureTextLine(
  target: HTMLElement,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): MeasuredTextLine | null {
  // innerText applies text-transform and skips hidden content, like the page.
  const text = target.innerText.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const canvasRect = canvas.getBoundingClientRect();
  // CSS transforms scale client rectangles, but not the canvas buffer.
  const scale = canvasRect.width > 0 && cssWidth > 0
    ? canvasRect.width / cssWidth
    : 1;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let left = Infinity;
  let right = -Infinity;
  let top: number | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      top ??= rect.top;
    }
  }

  if (top === null) return null;
  return {
    text,
    left: (left - canvasRect.left) / scale,
    right: (right - canvasRect.left) / scale,
    top: (top - canvasRect.top) / scale,
  };
}

type CanvasTextStyle = Record<
  "letterSpacing" | "wordSpacing" | "fontStretch" | "fontVariantCaps",
  string
>;

/** Copies the text settings that the canvas font shorthand cannot express. */
function applyCanvasTextStyle(
  context: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
): void {
  // Older browsers lack some of these properties and keep their defaults.
  // Values the canvas does not accept, such as "normal" spacing, are ignored.
  const textStyle = context as unknown as CanvasTextStyle;
  if ("letterSpacing" in textStyle) textStyle.letterSpacing = style.letterSpacing;
  if ("wordSpacing" in textStyle) textStyle.wordSpacing = style.wordSpacing;
  if ("fontStretch" in textStyle) {
    textStyle.fontStretch = resolveFontStretch(style.fontStretch);
  }
  if ("fontVariantCaps" in textStyle) {
    textStyle.fontVariantCaps = style.fontVariantCaps;
  }
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
    throw new Error("Pardigon: createGrain() requires a browser.");
  }

  // A missing element from querySelector() must not silently become a
  // fullscreen overlay.
  if (options.target !== undefined && !(options.target instanceof HTMLElement)) {
    throw new Error(
      `Pardigon: target must be an HTMLElement (${String(options.target)}).`,
    );
  }

  const target = options.target ?? document.body;

  if (!target) {
    throw new Error("Pardigon: no target element is available.");
  }

  // Every option is validated before the canvas and WebGL context exist.
  let settings = resolveSettings(
    options,
    resolvePreset(options.preset) ?? DEFAULT_SETTINGS,
  );
  let colorComponents = hexToRgb(settings.color);
  let maskMode = resolveMaskMode(options.mask);
  let luminanceOptions = resolveLuminanceOptions(options.luminance);
  let qualityMode: GrainQualityMode = resolveQualityMode(options.quality);
  let respectReducedMotion = requireBoolean(
    "respectReducedMotion",
    options.respectReducedMotion ?? true,
  );

  const isFullscreenTarget = target === document.body || target === document.documentElement;

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
    throw new Error("Pardigon: WebGL2 is not available in this browser.");
  }

  const getGpuTimerExtension = (): GpuTimerExtension | null =>
    gl.getExtension("EXT_disjoint_timer_query_webgl2") as GpuTimerExtension | null;

  let resources: RendererResources | null;
  try {
    resources = createRendererResources(gl);
  } catch (error) {
    // Browsers cap live WebGL contexts, so a failed setup must release its own.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }
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
  let paused = false;
  let targetVisible = true;
  let adaptiveQuality = INITIAL_ADAPTIVE_QUALITY;
  let qualitySampleStartedAt: number | null = null;
  let qualityFrameIntervals: number[] = [];
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
  let contentObserver: MutationObserver | null = null;
  let pixelRatioQuery: MediaQueryList | null = null;
  let luminanceTextureReady = false;
  let luminanceUploadFailed = false;
  let lastUploadedVideoTime = -1;
  const reducedMotionQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  let positionEntry: PositionedTarget | undefined;

  const getQualityLevel = () =>
    AUTO_QUALITY_LEVELS[adaptiveQuality.level] ?? AUTO_QUALITY_LEVELS[0];

  const getDeviceFpsLimit = (): number =>
    window.innerWidth <= MOBILE_BREAKPOINT_PX ? 24 : 60;

  const getEffectiveFps = (): number => {
    const requestedFps = Math.min(settings.fps, getDeviceFpsLimit());
    return Math.max(1, requestedFps * getQualityLevel().fpsScale);
  };

  const getEffectiveComplexity = (): number =>
    settings.complexity * getQualityLevel().complexityScale;

  /** Returns true when an interrupted probe changed the quality level. */
  const resetQualitySamples = (): boolean => {
    const previousLevel = adaptiveQuality.level;
    qualitySampleStartedAt = null;
    qualityFrameIntervals = [];
    adaptiveQuality = interruptQualitySampling(adaptiveQuality);
    return adaptiveQuality.level !== previousLevel;
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

    const previousLevel = adaptiveQuality.level;
    adaptiveQuality = evaluateQualitySample(
      adaptiveQuality,
      qualityFrameIntervals,
      AUTO_QUALITY_LEVELS.length - 1,
    );
    qualitySampleStartedAt = timestamp;
    qualityFrameIntervals = [];
    return adaptiveQuality.level !== previousLevel;
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

  const resetPerformanceSample = (): void => {
    performanceSampleStartedAt = performance.now();
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
      throw new Error("Pardigon: could not create the text mask.");
    }

    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    const line = measureTextLine(target, canvas, canvas.width / pixelRatio);
    if (line) {
      const style = getComputedStyle(target);
      const textAlign = resolveTextAlign(style.textAlign, style.direction);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = "#ffffff";
      context.textBaseline = "alphabetic";
      context.textAlign = textAlign;
      context.direction = style.direction === "rtl" ? "rtl" : "ltr";
      context.font = buildCanvasFont(style);
      applyCanvasTextStyle(context, style);

      // The measured line box starts at the font ascent above the baseline.
      const metrics = context.measureText(line.text);
      const fontAscent = metrics.fontBoundingBoxAscent
        || metrics.actualBoundingBoxAscent;
      context.fillText(
        line.text,
        resolveAnchorX(textAlign, line.left, line.right),
        line.top + fontAscent,
      );
      context.setTransform(1, 0, 0, 1, 0, 0);
    }

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

  const uploadLuminanceTexture = (): boolean => {
    const currentResources = resources;
    const source = luminanceOptions.source;
    if (
      !currentResources
      || !luminanceOptions.enabled
      || !source
      || gl.isContextLost()
      || luminanceUploadFailed
    ) {
      return false;
    }

    const [width, height] = getLuminanceSourceSize(source);
    if (width <= 0 || height <= 0) return false;

    if (source instanceof HTMLImageElement && luminanceTextureReady) return true;
    if (
      source instanceof HTMLVideoElement
      && luminanceTextureReady
      && source.currentTime === lastUploadedVideoTime
    ) {
      return true;
    }

    try {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, currentResources.luminanceTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      luminanceTextureReady = true;
      if (source instanceof HTMLVideoElement) {
        lastUploadedVideoTime = source.currentTime;
      }
      return true;
    } catch (error) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      luminanceUploadFailed = true;
      console.error(
        "Pardigon: could not read the luminance source. Check its CORS policy.",
        error,
      );
      return false;
    }
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
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.size, settings.size);
    gl.uniform2f(uniforms.scale, settings.scaleX, settings.scaleY);
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);
    gl.uniform1f(uniforms.time, elapsedTime);
    gl.uniform1f(uniforms.blur, settings.blur);
    gl.uniform1f(uniforms.complexity, getEffectiveComplexity());
    gl.uniform1f(uniforms.character, settings.character);
    gl.uniform1f(uniforms.chromatic, settings.chromatic);
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
    const luminanceReady = uploadLuminanceTexture();
    const luminanceSource = luminanceOptions.source;
    const [sourceWidth, sourceHeight] = luminanceSource
      ? getLuminanceSourceSize(luminanceSource)
      : [1, 1];
    const luminanceRange = luminanceOptions.range === "shadows"
      ? 0
      : luminanceOptions.range === "midtones"
        ? 1
        : 2;
    const luminanceFit = luminanceOptions.fit === "cover"
      ? 0
      : luminanceOptions.fit === "contain"
        ? 1
        : 2;
    gl.uniform1f(
      uniforms.luminanceEnabled,
      luminanceOptions.enabled && luminanceReady ? 1 : 0,
    );
    gl.uniform1f(uniforms.luminanceResponse, luminanceOptions.response);
    gl.uniform1f(uniforms.luminanceRange, luminanceRange);
    gl.uniform1f(uniforms.luminanceFit, luminanceFit);
    gl.uniform1f(uniforms.sourceAspect, sourceWidth / Math.max(sourceHeight, 1));
    gl.uniform1f(uniforms.targetAspect, canvas.width / Math.max(canvas.height, 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentResources.maskTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, currentResources.luminanceTexture);
    const gpuQuery = startGpuTimer();
    try {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      recordRenderedFrame(timestamp);
    } finally {
      finishGpuTimer(gpuQuery);
    }
  };

  const handleLuminanceSourceUpdate = (): void => {
    if (destroyed || !luminanceOptions.enabled) return;
    luminanceTextureReady = false;
    lastUploadedVideoTime = -1;
    // A running loop uploads the new source on its next scheduled grain frame.
    // Rendering here as well would exceed the selected frame rate. A hidden
    // grain catches up when it is shown again.
    if (animationFrameId === null && isShown()) render();
  };

  // New media may come from a different origin, so a previous CORS failure
  // no longer applies. Seeks and time updates keep the failure to avoid
  // logging the same error several times per second.
  const handleLuminanceSourceLoad = (): void => {
    luminanceUploadFailed = false;
    handleLuminanceSourceUpdate();
  };

  const removeLuminanceSourceListeners = (
    source: GrainLuminanceSource | null,
  ): void => {
    if (source instanceof HTMLImageElement) {
      source.removeEventListener("load", handleLuminanceSourceLoad);
    } else if (source instanceof HTMLVideoElement) {
      source.removeEventListener("loadeddata", handleLuminanceSourceLoad);
      source.removeEventListener("seeked", handleLuminanceSourceUpdate);
      source.removeEventListener("timeupdate", handleLuminanceSourceUpdate);
    }
  };

  const addLuminanceSourceListeners = (
    source: GrainLuminanceSource | null,
  ): void => {
    if (source instanceof HTMLImageElement) {
      source.addEventListener("load", handleLuminanceSourceLoad);
    } else if (source instanceof HTMLVideoElement) {
      source.addEventListener("loadeddata", handleLuminanceSourceLoad);
      source.addEventListener("seeked", handleLuminanceSourceUpdate);
      source.addEventListener("timeupdate", handleLuminanceSourceUpdate);
    }
  };

  const setLuminanceOptions = (next: ResolvedLuminanceOptions): void => {
    const previous = luminanceOptions;
    const sourceChanged = previous.source !== next.source;
    if (sourceChanged) removeLuminanceSourceListeners(previous.source);
    luminanceOptions = next;
    if (sourceChanged || (!previous.enabled && next.enabled)) {
      luminanceTextureReady = false;
      luminanceUploadFailed = false;
      lastUploadedVideoTime = -1;
    }
    if (sourceChanged) addLuminanceSourceListeners(next.source);
  };

  const shouldAnimate = (): boolean =>
    settings.animated
    && !paused
    && !(respectReducedMotion && reducedMotionQuery?.matches === true);

  const isShown = (): boolean => !document.hidden && targetVisible;

  /** Every condition the animation loop needs, checked as one. */
  const canRunLoop = (): boolean =>
    !destroyed
    && resources !== null
    && !gl.isContextLost()
    && isShown()
    && shouldAnimate();

  const loop = (timestamp: number): void => {
    if (!canRunLoop()) {
      animationFrameId = null;
      stopLoop();
      return;
    }

    const frameInterval = previousTimestamp === null ? 0 : timestamp - previousTimestamp;
    if (previousTimestamp !== null) {
      elapsedTime += Math.min(frameInterval, 100) / 1000;
    }
    previousTimestamp = timestamp;
    const qualityChanged = sampleAdaptiveQuality(timestamp, frameInterval);
    // The grain cadence stays steady; speed only slows the noise movement.
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
    if (animationFrameId === null && canRunLoop()) {
      // Quality samples were already reset when the loop stopped.
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
    // Performance samples are reset by startLoop(), and getMetrics() reports
    // no FPS while the loop is stopped.
    previousTimestamp = null;
    lastRenderTimestamp = null;
    // A probe tests one sample of the running loop. Ending it here keeps a
    // paused or static frame from staying at the lowest quality level.
    if (resetQualitySamples() && !destroyed) resize();
  };

  const resize = (): void => {
    // Grain does not need the full Retina resolution of an interface. On
    // phones, one render pixel per CSS pixel greatly reduces the GPU load.
    const pixelRatioLimit = window.innerWidth <= MOBILE_BREAKPOINT_PX ? 1 : 1.5;
    const basePixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioLimit);
    pixelRatio = basePixelRatio * getQualityLevel().renderScale;
    const cssWidth = isFullscreenTarget ? window.innerWidth : target.clientWidth;
    const cssHeight = isFullscreenTarget ? window.innerHeight : target.clientHeight;
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    // Assigning a canvas size reallocates its buffer even when the value is
    // unchanged. Local targets receive both window and ResizeObserver events.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    updateMaskTexture();
    render();
  };

  const handleShown = (): void => {
    startLoop();
    // A static grain skipped the luminance updates made while it was hidden.
    if (
      animationFrameId === null
      && isShown()
      && luminanceOptions.enabled
      && !luminanceTextureReady
    ) {
      render();
    }
  };

  const handleVisibilityChange = (): void => {
    if (document.hidden) stopLoop();
    else handleShown();
  };

  const handleReducedMotionChange = (): void => {
    if (shouldAnimate()) startLoop();
    else {
      stopLoop();
      render();
    }
  };

  // Moving the window to a screen with another pixel density does not always
  // fire a resize event, so the current density is watched directly.
  const handlePixelRatioChange = (): void => {
    watchPixelRatio();
    resize();
  };

  const watchPixelRatio = (): void => {
    pixelRatioQuery?.removeEventListener("change", handlePixelRatioChange);
    pixelRatioQuery = typeof window.matchMedia === "function"
      ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      : null;
    pixelRatioQuery?.addEventListener("change", handlePixelRatioChange);
  };

  // Replacing the content with textContent, innerHTML or replaceChildren()
  // also removes the grain canvas. React does this when it updates the text
  // of an element whose only other child is the canvas.
  const handleContentMutation = (records: MutationRecord[]): void => {
    if (destroyed) return;
    if (canvas.parentNode !== target) target.appendChild(canvas);

    const contentChanged = records.some((record) =>
      record.type !== "childList"
      || [...record.addedNodes, ...record.removedNodes].some(
        (node) => node !== canvas,
      ));
    if (contentChanged && maskMode === "text") {
      updateMaskTexture();
      render();
    }
  };

  // Direct children are always watched to keep the canvas attached. The text
  // inside them is only watched while the text mask needs it.
  const syncContentObserver = (): void => {
    if (!contentObserver) return;
    contentObserver.disconnect();
    contentObserver.observe(
      target,
      maskMode === "text"
        ? { childList: true, characterData: true, subtree: true }
        : { childList: true },
    );
  };

  // Fonts can finish loading at any time, including after creation.
  const handleFontsLoaded = (): void => {
    if (!destroyed && maskMode === "text") resize();
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
      luminanceTextureReady = false;
      luminanceUploadFailed = false;
      lastUploadedVideoTime = -1;
      gpuTimerExtension = getGpuTimerExtension();
      lastGpuSampleTimestamp = -Infinity;
      resize();
      startLoop();
    } catch (error) {
      resources = null;
      console.error("Pardigon: could not restore the WebGL2 context.", error);
    }
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
    pixelRatioQuery?.removeEventListener("change", handlePixelRatioChange);
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    contentObserver?.disconnect();
    document.fonts?.removeEventListener("loadingdone", handleFontsLoaded);
    removeLuminanceSourceListeners(luminanceOptions.source);
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
    if (positionEntry) {
      positionEntry.instances -= 1;
      if (positionEntry.instances === 0) {
        positionedTargets.delete(target);
        if (target.style.position === "relative") {
          target.style.position = positionEntry.previousPosition;
        }
      }
    }
  };

  try {
    positionEntry = positionedTargets.get(target);
    if (positionEntry) {
      positionEntry.instances += 1;
    } else if (!isFullscreenTarget && getComputedStyle(target).position === "static") {
      positionEntry = { instances: 1, previousPosition: target.style.position };
      positionedTargets.set(target, positionEntry);
      target.style.position = "relative";
    }
    target.appendChild(canvas);

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery?.addEventListener("change", handleReducedMotionChange);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    addLuminanceSourceListeners(luminanceOptions.source);
    watchPixelRatio();
    if (!isFullscreenTarget && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(target);
    }
    if (!isFullscreenTarget && "IntersectionObserver" in window) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        targetVisible = entry?.isIntersecting ?? true;
        if (targetVisible) handleShown();
        else stopLoop();
      });
      intersectionObserver.observe(target);
    }
    if ("MutationObserver" in window) {
      contentObserver = new MutationObserver(handleContentMutation);
      syncContentObserver();
    }
    document.fonts?.addEventListener("loadingdone", handleFontsLoaded);
    resize();
    startLoop();
  } catch (error) {
    // A failed setup must not leave a canvas, listeners, a repositioned
    // target or a live WebGL context behind.
    destroy();
    throw error;
  }
  void document.fonts?.ready.then(handleFontsLoaded);

  return {
    update(nextOptions): void {
      if (destroyed) return;

      // Everything is resolved first, so an invalid option changes nothing.
      const nextSettings = resolveSettings(
        nextOptions,
        resolvePreset(nextOptions.preset) ?? settings,
      );
      const nextMaskMode = nextOptions.mask === undefined
        ? maskMode
        : resolveMaskMode(nextOptions.mask);
      const nextLuminanceOptions = nextOptions.luminance === undefined
        ? luminanceOptions
        : resolveLuminanceOptions(nextOptions.luminance, luminanceOptions);
      const nextQualityMode = nextOptions.quality === undefined
        ? null
        : resolveQualityMode(nextOptions.quality);
      const nextRespectReducedMotion = requireBoolean(
        "respectReducedMotion",
        nextOptions.respectReducedMotion ?? respectReducedMotion,
      );

      const previousSettings = settings;
      settings = nextSettings;
      respectReducedMotion = nextRespectReducedMotion;

      if (settings.color !== previousSettings.color) {
        colorComponents = hexToRgb(settings.color);
      }

      if (settings.blendMode !== previousSettings.blendMode) {
        canvas.style.mixBlendMode = settings.blendMode;
      }

      if (settings.fps !== previousSettings.fps) {
        lastRenderTimestamp = null;
      }

      if (nextOptions.mask !== undefined) {
        maskMode = nextMaskMode;
        syncContentObserver();
        updateMaskTexture();
      }

      if (nextOptions.luminance !== undefined) {
        setLuminanceOptions(nextLuminanceOptions);
      }

      let qualityChanged = false;
      if (nextQualityMode !== null) {
        qualityMode = nextQualityMode;
        qualityChanged = adaptiveQuality.level !== 0;
        // The learnt display cadence describes the device, not the mode.
        adaptiveQuality = {
          ...INITIAL_ADAPTIVE_QUALITY,
          baselineIntervalMs: adaptiveQuality.baselineIntervalMs,
        };
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
        qualityLevel: adaptiveQuality.level,
        renderScale: getQualityLevel().renderScale,
        effectiveFps: getEffectiveFps(),
        effectiveComplexity: getEffectiveComplexity(),
        actualFps: isAnimationRunning ? actualFps : 0,
        renderedFrames,
        lateFrames,
        frameTimeP95Ms: isAnimationRunning ? frameTimeP95Ms : null,
      };
    },

    // pause() and play() do not change the animated setting: a static preset
    // stays static after play(), and update({ animated }) still applies.
    pause(): void {
      if (destroyed) return;
      paused = true;
      stopLoop();
      render();
    },

    play(): void {
      if (destroyed) return;
      paused = false;
      startLoop();
    },

    destroy,
  };
}
