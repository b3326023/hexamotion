import type { WorldId } from "./worlds/types";

export type SceneCommand = { x: number; y: number };
export type GesturePoint = { x: number; y: number };
type Contact = {
  point: GesturePoint;
  previous: GesturePoint;
  start: GesturePoint;
  trail: GesturePoint[];
  time: number;
  tap: boolean;
};
type Extent = { width: number; height: number };

const clamp = (value: number, min = -1, max = 1) => Math.min(max, Math.max(min, value));
const distance = (a: GesturePoint, b: GesturePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const bounded = (x: number, y: number): SceneCommand => ({ x: clamp(x), y: clamp(y) });

// The model uses these heading limits and amplitude ratios at neutral. Work on the tip of
// its existing vector so even a tiny adjustment starts at the current sea state or stimulus.
const vectors = {
  marine: { angle: 0.72, amplitude: 0.35 / 0.6 },
  seismic: { angle: Math.PI / 2, amplitude: 0.006 / 0.009 },
  balance: { angle: Math.PI / 3, amplitude: 0.014 / 0.024 },
};
function isVector(id: WorldId): id is keyof typeof vectors {
  return id === "marine" || id === "seismic" || id === "balance";
}
function single(id: WorldId, start: SceneCommand, point: Contact, extent: Extent, gain: number) {
  const dx = (point.point.x - point.previous.x) * gain;
  const up = (point.previous.y - point.point.y) * gain;
  const horizontal = clamp(extent.width * 0.31, 86, 244);
  const vertical = clamp(extent.height * 0.4, 63, 175);
  if (isVector(id)) {
    const { angle, amplitude } = vectors[id];
    const neutral = 0.66 * Math.min(horizontal, vertical);
    const radius = neutral * (1 + amplitude * start.y);
    const x = Math.sin(angle * start.x) * radius + dx;
    const y = Math.cos(angle * start.x) * radius + up;
    let direction = Math.hypot(x, y) < 2 ? start.x : clamp(Math.atan2(x, y) / angle);
    // Project onto the operable fan. Pulling straight past the closest point must
    // reduce amplitude to minimum, not come out the other side at full amplitude.
    const along = x * Math.sin(direction * angle) + y * Math.cos(direction * angle);
    if (along < 2) direction = start.x;
    return bounded(direction, (Math.max(0, along) / neutral - 1) / amplitude);
  }
  return bounded(start.x + dx / horizontal, start.y + (id === "flight" ? -up : up) / vertical);
}
function pair(
  id: WorldId,
  start: SceneCommand,
  a: Contact,
  b: Contact,
  extent: Extent,
  gain: number,
) {
  const beforeX = b.previous.x - a.previous.x,
    beforeY = b.previous.y - a.previous.y;
  const afterX = b.point.x - a.point.x,
    afterY = b.point.y - a.point.y;
  const beforeGap = Math.hypot(beforeX, beforeY),
    gap = Math.hypot(afterX, afterY);
  const vx = afterX - beforeX,
    vy = afterY - beforeY;
  const sweepLength2 = vx * vx + vy * vy;
  const nearest = sweepLength2 ? clamp(-(beforeX * vx + beforeY * vy) / sweepLength2, 0, 1) : 0;
  const resolvesAngle = Math.hypot(beforeX + nearest * vx, beforeY + nearest * vy) >= 12;
  const angle = resolvesAngle
    ? Math.atan2(beforeX * afterY - beforeY * afterX, beforeX * afterX + beforeY * afterY) * gain
    : 0;
  const horizontal = clamp(extent.width * 0.31, 86, 244);
  const vertical = clamp(extent.height * 0.4, 63, 175);
  const x = ((a.point.x - a.previous.x + b.point.x - b.previous.x) * gain) / (2 * horizontal);
  const up = ((a.previous.y - a.point.y + b.previous.y - b.point.y) * gain) / (2 * vertical);
  const spread = ((gap - beforeGap) * gain) / Math.min(horizontal, vertical);
  if (isVector(id)) return bounded(start.x + angle / vectors[id].angle, start.y + spread);
  switch (id) {
    case "flight":
    case "driving":
    case "rail":
      return bounded(start.x + angle / (Math.PI / 2), start.y + (id === "flight" ? -up : up));
    case "optics":
    case "docking":
    case "photonics":
      return bounded(start.x + x * 0.25, start.y + up * 0.25);
    case "camera":
      return bounded(start.x + angle / (Math.PI / 2), start.y + spread);
    case "cinema":
    case "machining":
    case "vibration":
      return bounded(start.x + x, start.y + spread);
  }
}

export function worldKeyCommand(id: WorldId, current: SceneCommand, key: string, fine: boolean) {
  const step = fine ? 0.01 : 0.04;
  const pitch = id === "flight" ? -step : step;
  switch (key) {
    case "Home":
      return { x: 0, y: 0 };
    case "ArrowRight":
      return bounded(current.x + step, current.y);
    case "ArrowLeft":
      return bounded(current.x - step, current.y);
    case "ArrowUp":
      return bounded(current.x, current.y + pitch);
    case "ArrowDown":
      return bounded(current.x, current.y - pitch);
    default:
      return null;
  }
}

/** One physical sample per displayed frame. Rebase when fingers join/leave or the command saturates. */
export class WorldGesture {
  readonly contacts = new Map<number, Contact>();
  private lastTap: { time: number; point: GesturePoint; device: string } | null = null;
  constructor(readonly id: WorldId) {}

  begin(pointer: number, point: GesturePoint, time: number) {
    if (this.contacts.size >= 2 || this.contacts.has(pointer)) return false;
    const single = !this.contacts.size;
    if (!single) {
      this.lastTap = null;
      for (const contact of this.contacts.values()) contact.tap = false;
    }
    this.contacts.set(pointer, {
      point,
      previous: point,
      start: point,
      trail: [point],
      time,
      tap: single,
    });
    return true;
  }
  move(pointer: number, point: GesturePoint) {
    const c = this.contacts.get(pointer);
    if (!c || (point.x === c.point.x && point.y === c.point.y)) return false;
    c.point = point;
    if (distance(point, c.start) > 5) c.tap = false;
    if (distance(point, c.trail[c.trail.length - 1]) >= 2) {
      c.trail.push(point);
      if (c.trail.length > 24) c.trail.shift();
    }
    return true;
  }
  sample(current: SceneCommand, extent: Extent, fine = false) {
    const [a, b] = this.contacts.values();
    if (!a || (a.previous === a.point && (!b || b.previous === b.point))) return current;
    const gain = fine ? 0.25 : 1;
    const next = b
      ? pair(this.id, current, a, b, extent, gain)
      : single(this.id, current, a, extent, gain);
    this.rebase();
    return next;
  }
  private rebase() {
    for (const c of this.contacts.values()) c.previous = c.point;
  }
  end(pointer: number, time: number, device: string, cancelled = false) {
    const contact = this.contacts.get(pointer);
    if (!contact) return false;
    this.contacts.delete(pointer);
    this.rebase();
    const previous = this.lastTap;
    this.lastTap = null;
    if (cancelled || !contact.tap || time - contact.time > 320) return false;
    if (
      previous &&
      device === previous.device &&
      time - previous.time <= 320 &&
      distance(previous.point, contact.point) < 22
    )
      return true;
    this.lastTap = { time, point: contact.point, device };
    return false;
  }
  clear() {
    this.contacts.clear();
    this.lastTap = null;
  }
}
