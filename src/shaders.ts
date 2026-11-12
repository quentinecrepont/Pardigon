export const VERTEX_SHADER: string = `#version 300 es
void main() {
  // One large triangle covers the whole canvas, without a vertex buffer.
  vec2 position = vec2(
    (gl_VertexID == 2) ? 3.0 : -1.0,
    (gl_VertexID == 1) ? 3.0 : -1.0
  );
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

uniform float u_intensity;
uniform vec3 u_color;
uniform vec2 u_resolution;
uniform float u_size;
uniform vec2 u_scale;
uniform float u_pixelRatio;
uniform float u_time;
uniform float u_blur;
uniform float u_complexity;
uniform float u_character;
uniform float u_chromatic;
uniform float u_continuity;
uniform float u_flickerExposure;
uniform float u_dirt;
uniform float u_speed;
uniform float u_fps;
uniform float u_animationMode;
uniform float u_maskEnabled;
uniform sampler2D u_maskTexture;
uniform float u_luminanceEnabled;
uniform float u_luminanceResponse;
uniform float u_luminanceRange;
uniform float u_luminanceFit;
uniform float u_sourceAspect;
uniform float u_targetAspect;
uniform sampler2D u_luminanceTexture;

out vec4 outColor;

// Frame-based seeds restart after this many noise states. Each state is an
// independent random pattern, so the loop cannot be seen. Without it, seeds
// keep growing and float32 precision flattens the grain after many hours.
const float SEED_PERIOD = 16384.0;

float seedIndex(float index) {
  return mod(index, SEED_PERIOD);
}

// Turns a 2D position into a pseudo-random number between 0 and 1.
float hash(vec2 position) {
  vec3 p = fract(vec3(position.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Continuous noise: four cells are interpolated instead of replaced.
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
    seedOffset + seedIndex(currentSlice) * seedScale
  );
  float nextNoise = valueNoise(
    position,
    seedOffset + seedIndex(currentSlice + 1.0) * seedScale
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
    float hardFrame = seedIndex(floor(temporalFrame * u_speed));
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
  float dirtFrame = seedIndex(floor(temporalFrame * u_speed / lifetime));
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

vec2 mapLuminanceUv(vec2 uv) {
  if (u_luminanceFit > 1.5) return uv;

  vec2 mappedUv = uv;
  if (u_luminanceFit < 0.5) {
    // Cover: crop the source around its centre, like object-fit: cover.
    if (u_targetAspect > u_sourceAspect) {
      mappedUv.y = 0.5 + (uv.y - 0.5) * u_sourceAspect / u_targetAspect;
    } else {
      mappedUv.x = 0.5 + (uv.x - 0.5) * u_targetAspect / u_sourceAspect;
    }
  } else {
    // Contain: keep the complete source and ignore the letterboxed area.
    if (u_targetAspect > u_sourceAspect) {
      mappedUv.x = 0.5 + (uv.x - 0.5) * u_targetAspect / u_sourceAspect;
    } else {
      mappedUv.y = 0.5 + (uv.y - 0.5) * u_sourceAspect / u_targetAspect;
    }
  }
  return mappedUv;
}

float luminanceResponse() {
  if (u_luminanceEnabled < 0.5 || u_luminanceResponse < 0.001) return 1.0;

  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv = mapLuminanceUv(uv);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    return 1.0;
  }

  vec3 sourceColor = texture(u_luminanceTexture, uv).rgb;
  float luminance = dot(sourceColor, vec3(0.2126, 0.7152, 0.0722));
  float shadows = 1.0 - smoothstep(0.05, 0.72, luminance);
  float midtones = 1.0 - smoothstep(0.08, 0.62, abs(luminance - 0.5));
  float highlights = smoothstep(0.28, 0.95, luminance);
  float selectedRange = u_luminanceRange < 0.5
    ? shadows
    : (u_luminanceRange < 1.5 ? midtones : highlights);

  return mix(1.0, 0.12 + selectedRange * 0.88, u_luminanceResponse);
}

void main() {
  // Neighbouring pixels share the same cell as u_size grows.
  float cellSize = max(u_size * u_pixelRatio, 1.0);
  // 100 / 100 keeps the original proportions. A larger value stretches the
  // shapes along that axis without adding a noise sample.
  vec2 grainScale = max(u_scale / 100.0, vec2(0.01));
  vec2 grainPosition = gl_FragCoord.xy / (cellSize * grainScale);

  // Time is posterized independently from the display refresh rate.
  float temporalFrame = floor(u_time * u_fps);
  float sampledTime = temporalFrame / u_fps;
  float animationTime = sampledTime * u_speed;
  bool usesFlow = u_animationMode > 0.5;

  vec2 basePosition = grainPosition;
  vec2 baseSeedScale = vec2(17.0, 29.0);

  if (usesFlow) {
    // The field slowly drifts and undulates along both axes.
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

  // A second layer moves in another direction. The phase offset between
  // the two layers creates evolution without abrupt regeneration.
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

    // A ridged transform adds relief without another noise sample.
    if (u_complexity > 0.65) {
      float ridgedNoise = 1.0 - abs(detailNoise * 2.0 - 1.0);
      float ridgeAmount = (u_complexity - 0.65) / 0.35;
      noise = mix(noise, ridgedNoise, ridgeAmount * 0.12);
    }
  }

  // Mixing frequencies reduces contrast, so it is slightly restored.
  noise = clamp(0.5 + (noise - 0.5) * (1.0 + u_complexity * 0.35), 0.0, 1.0);

  float centeredNoise = noise * 2.0 - 1.0;

  // A larger density map clusters the grain without creating flat colour
  // areas. Positive and negative values keep the same balance: only their
  // local presence becomes stronger or weaker.
  float densityMultiplier = 1.0;
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
    densityMultiplier = mix(1.0, localDensity, u_character);
    centeredNoise *= densityMultiplier;
    centeredNoise = clamp(centeredNoise, -1.0, 1.0);
  }

  // Positive values add the chosen tint, negative values add black.
  vec3 channelNoise = vec3(centeredNoise);
  if (u_chromatic > 0.001) {
    // Red and blue share the main scale and motion, with different states.
    float redNoise = temporalNoise(
      basePosition + vec2(0.37, -0.19),
      baseSeedScale * 1.07,
      vec2(223.0, 307.0),
      temporalFrame,
      animationTime,
      usesFlow
    ) * 2.0 - 1.0;
    float blueNoise = temporalNoise(
      basePosition + vec2(-0.23, 0.41),
      baseSeedScale * 0.93,
      vec2(419.0, 163.0),
      temporalFrame,
      animationTime,
      usesFlow
    ) * 2.0 - 1.0;
    redNoise = clamp(redNoise * densityMultiplier, -1.0, 1.0);
    blueNoise = clamp(blueNoise * densityMultiplier, -1.0, 1.0);

    vec3 separatedNoise = vec3(redNoise, centeredNoise, blueNoise);
    float separatedLuminance = dot(
      separatedNoise,
      vec3(0.2126, 0.7152, 0.0722)
    );
    vec3 chromaOnly = separatedNoise - vec3(separatedLuminance);
    channelNoise = clamp(
      vec3(centeredNoise) + chromaOnly * u_chromatic,
      vec3(-1.0),
      vec3(1.0)
    );
  }

  float positiveGrain = step(0.0, centeredNoise);
  vec3 grainColor = mix(vec3(0.0), u_color, positiveGrain);
  float grainMagnitude = abs(centeredNoise);
  if (u_chromatic > 0.001) {
    grainMagnitude = max(
      abs(channelNoise.r),
      max(abs(channelNoise.g), abs(channelNoise.b))
    );
    grainColor = clamp(
      vec3(0.5) + 0.5 * channelNoise / max(grainMagnitude, 0.0001),
      vec3(0.0),
      vec3(1.0)
    ) * u_color;
  }
  float grainAlpha = grainMagnitude * u_intensity * luminanceResponse();

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
