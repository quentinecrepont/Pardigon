import {
  createGrain,
  grainPresets,
  isWebGL2Supported,
  type GrainInstance,
  type GrainOptions,
  type GrainPresetName,
} from "pardigon";

const preset: GrainPresetName = "8mm";
const options: GrainOptions = {
  target: document.body,
  preset,
  intensity: grainPresets[preset].intensity,
  color: "#7ac7ff",
  respectReducedMotion: true,
};

if (isWebGL2Supported()) {
  const grain: GrainInstance = createGrain(options);
  grain.update({ preset: "fog", intensity: 0.05 });
  grain.update({ color: "#1683ff" });
  grain.update({ respectReducedMotion: false });
  const metrics = grain.getMetrics();
  metrics.gpuTimeMs;
  metrics.gpuTimerSupported;
  grain.pause();
  grain.play();
  grain.destroy();
}
