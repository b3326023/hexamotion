import type { PerspectiveCamera, Scene } from "three";
export const worldIds = [
  "flight",
  "driving",
  "marine",
  "seismic",
  "optics",
  "docking",
  "rail",
  "cinema",
  "camera",
  "balance",
  "machining",
  "vibration",
  "photonics",
] as const;
export type WorldId = (typeof worldIds)[number];
export function isWorld(id: string): id is WorldId {
  return worldIds.some((v) => id === v);
}
/** Angles are radians, distances metres and time is the fixed-step simulation clock. */
export interface WorldFrame {
  t: number;
  x: number;
  y: number;
  roll: number;
  pitch: number;
  yaw: number;
  baseRoll: number;
  basePitch: number;
  baseHeave: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  deckX: number;
  deckY: number;
  deckZ: number;
  deckRoll: number;
  deckPitch: number;
  specimen: number;
  distance: number;
  speed: number;
  heading: number;
  steering: number;
  course: number;
  waveHeight: number;
  waveDirection: number;
  /** Application metric in its displayed units. Planar channels retain their instrument units. */
  metric: number;
  planeX: number;
  planeY: number;
  planeSpan: number;
  phase: number;
  frequency: number;
  damping: number;
  feed: number;
  radius: number;
}
export const newWorldFrame = (): WorldFrame => ({
  t: 0,
  x: 0,
  y: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  baseRoll: 0,
  basePitch: 0,
  baseHeave: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  deckX: 0,
  deckY: 0,
  deckZ: 0,
  deckRoll: 0,
  deckPitch: 0,
  specimen: 0,
  distance: 0,
  speed: 0,
  heading: 0,
  steering: 0,
  course: 0,
  waveHeight: 0.6,
  waveDirection: 0.6,
  metric: 0,
  planeX: 0,
  planeY: 0,
  planeSpan: 0,
  phase: 0,
  frequency: 0,
  damping: 0,
  feed: 0,
  radius: 0,
});
export type WorldView = {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (state: WorldFrame, aspect: number) => void;
  dispose?: () => void;
};
