export type LaunchSettings = {
  x: number;
  y: number;
  height: number;
  azimuth: number;
  elevation: number;
  speed: number;
  aimAtCenter?: boolean;
};
export const DEFAULT_LAUNCH: LaunchSettings = {
  x: 0.09,
  y: 0.065,
  height: 0.12,
  azimuth: -145,
  elevation: -15,
  speed: 0,
};
export function launchVelocity(s: LaunchSettings) {
  const a = s.aimAtCenter
      ? Math.atan2(-s.y, -s.x)
      : (s.azimuth * Math.PI) / 180,
    e = (s.elevation * Math.PI) / 180;
  return {
    x: s.speed * Math.cos(e) * Math.cos(a),
    y: s.speed * Math.cos(e) * Math.sin(a),
    z: s.speed * Math.sin(e),
  };
}

export function aimLaunchAtCenter(s: LaunchSettings): LaunchSettings {
  const distance = Math.hypot(s.x, s.y);
  return {
    ...s,
    aimAtCenter: true,
    azimuth: distance > 1e-8 ? (Math.atan2(-s.y, -s.x) * 180) / Math.PI : 0,
    speed: distance > 1e-8 ? s.speed || 0.3 : 0,
  };
}

export function updateLaunch(
  s: LaunchSettings,
  patch: Partial<LaunchSettings>,
): LaunchSettings {
  const next = { ...s, ...patch };
  if (patch.azimuth !== undefined) next.aimAtCenter = false;
  if (next.aimAtCenter) {
    next.azimuth =
      Math.hypot(next.x, next.y) > 1e-8
        ? (Math.atan2(-next.y, -next.x) * 180) / Math.PI
        : 0;
  }
  return next;
}
