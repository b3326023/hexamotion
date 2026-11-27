/** World distances are metres. The small hexapod reproduces full-scale heave at 1:100. */
export const VESSEL_HEAVE_SCALE = 0.01;
// Amplitude, spatial wave number, encounter angular frequency, azimuth offset, initial phase.
export const SEA_SWELLS = [
  [1.85, 0.06, 0.81, 0.0, 0.24],
  [0.54, 0.102, 1.12, -0.44, 1.36],
  [0.26, 0.151, 1.42, 0.78, -0.42],
] as const;

export function sampleVesselWave(t: number, gain: number, direction: number, x = 0, z = 0) {
  let height = 0,
    dx = 0,
    dz = 0;
  for (const [amp, k, w, offset, phase] of SEA_SWELLS) {
    const angle = direction + offset,
      u = Math.sin(angle),
      v = Math.cos(angle);
    const f = w * t - k * (x * u + z * v) + phase;
    height += gain * amp * Math.sin(f);
    const slope = -gain * amp * k * Math.cos(f);
    dx += slope * u;
    dz += slope * v;
  }
  // Intrinsic physical roll about the bow axis, pitch about the port axis.
  const pitch = -Math.atan(dx);
  const roll = -Math.atan(dz * Math.cos(pitch));
  return { height, heave: height * VESSEL_HEAVE_SCALE, roll, pitch };
}
