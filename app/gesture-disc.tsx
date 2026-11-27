import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clamp } from "../lib/kinematics";

export type Stick = { x: number; y: number };
type Props = {
  value: Stick;
  disabled: boolean;
  axes: readonly string[];
  onMove: (x: number, y: number) => void;
  onTwist: (height: number, yaw: number) => void;
  onCenter: () => void;
};
const ticks = Array.from({ length: 72 }, (_, i) => i);
const polar = (r: number, a: number) => [
  100 + r * Math.sin((a * Math.PI) / 180),
  100 - r * Math.cos((a * Math.PI) / 180),
];
export function GestureDisc({ value, disabled, axes, onMove, onTwist, onCenter }: Props) {
  const touches = useRef(new Map<number, Stick>()),
    pair = useRef<{ distance: number; angle: number } | null>(null);
  const tap = useRef({ time: 0, x: 0, y: 0 }),
    origin = useRef({ x: 0, y: 0 });
  const moveOne = (e: PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect(),
      range = b.width * 0.36;
    let x = (e.clientX - b.left - b.width / 2) / range,
      y = (b.top + b.height / 2 - e.clientY) / range;
    const length = Math.max(1, Math.hypot(x, y));
    onMove(x / length, y / length);
  };
  function pairGeometry() {
    const [a, b] = [...touches.current.values()];
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (disabled || e.button !== 0) return;
    // A sheet or orientation change can revoke pending capture before a lost event fires.
    for (const id of touches.current.keys()) {
      if (!e.currentTarget.hasPointerCapture(id)) touches.current.delete(id);
    }
    if (touches.current.size === 0) pair.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      pair.current = pairGeometry();
      tap.current.time = 0;
      return;
    }
    if (touches.current.size === 1) {
      origin.current = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== "touch") moveOne(e);
    }
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (disabled || !touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size > 1) {
      const next = pairGeometry(),
        prev = pair.current;
      if (prev) {
        const a = next.angle - prev.angle;
        onTwist(
          (next.distance - prev.distance) * 0.00065,
          Math.atan2(Math.sin(a), Math.cos(a)) * 0.65,
        );
      }
      pair.current = next;
    } else if (!pair.current) moveOne(e);
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (!touches.current.has(e.pointerId)) return;
    const multi = !!pair.current;
    touches.current.delete(e.pointerId);
    if (touches.current.size === 0) pair.current = null;
    if (
      e.type !== "pointerup" ||
      disabled ||
      multi ||
      Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8
    )
      return;
    const prev = tap.current,
      now = performance.now();
    if (now - prev.time < 340 && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 22) {
      onCenter();
      tap.current.time = 0;
    } else {
      tap.current = { time: now, x: e.clientX, y: e.clientY };
      if (e.pointerType === "touch") moveOne(e);
    }
  }
  function key(e: KeyboardEvent) {
    if (disabled) return;
    const d = e.shiftKey ? 0.2 : 0.05;
    const steps: Record<string, number[]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowDown: [0, -d],
      ArrowUp: [0, d],
    };
    if (e.key === "Home") {
      e.preventDefault();
      onCenter();
    } else if (steps[e.key]) {
      e.preventDefault();
      const [x, y] = steps[e.key];
      onMove(clamp(value.x + x, -1, 1), clamp(value.y + y, -1, 1));
    }
  }
  const x = 100 + value.x * 65,
    y = 100 - value.y * 65;
  return (
    <svg
      viewBox="0 0 200 200"
      className="gesture-disc"
      tabIndex={0}
      role="group"
      aria-label={axes.join("、") + "手勢控制盤，方向鍵微調，Home 歸零"}
      aria-disabled={disabled}
      onKeyDown={key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={(e) => {
        if (e.target === e.currentTarget) up(e);
      }}
    >
      <defs>
        <radialGradient id="pad">
          <stop stopColor="#313638" />
          <stop offset=".82" stopColor="#202426" />
          <stop offset="1" stopColor="#191c1e" />
        </radialGradient>
        <radialGradient id="puck" cx=".35" cy=".24" r=".85">
          <stop stopColor="#ffad72" />
          <stop offset=".54" stopColor="#ff703b" />
          <stop offset="1" stopColor="#cd4c20" />
        </radialGradient>
        <pattern id="discGrid" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r=".7" fill="#849096" opacity=".45" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="87" fill="url(#pad)" stroke="#555a5c" strokeWidth="1" />
      <circle cx="100" cy="100" r="78" fill="url(#discGrid)" stroke="#3e4346" />
      {ticks.map((i) => {
        const a = polar(i % 6 === 0 ? 80 : 83, i * 5),
          b = polar(86, i * 5);
        return (
          <line
            key={i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke={i % 6 === 0 ? "#c0c3c1" : "#666b6c"}
            strokeWidth={i % 6 === 0 ? 1.1 : 0.7}
          />
        );
      })}
      {[26, 51, 72].map((r) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="#52595b"
          strokeWidth=".75"
          strokeDasharray={r === 51 ? "2 3" : undefined}
        />
      ))}
      <path d="M21 100h158 M100 21v158" stroke="#697171" strokeWidth=".7" strokeDasharray="3 3" />
      <g fill="#b8bfbd" fontFamily="monospace" fontSize="8">
        <text x="105" y="37">
          Y
        </text>
        <text x="163" y="96">
          X
        </text>
      </g>
      <path
        d="M28 46 A90 90 0 0 1 74 14 M126 186 A90 90 0 0 0 172 154"
        fill="none"
        stroke="#e57a4b"
        strokeWidth="2"
      />
      <path d={"M100 100L" + x + " " + y} stroke="#ff7845" strokeWidth="2" />
      <g transform={"translate(" + x + " " + y + ")"}>
        <circle cy="2" r="16" fill="#0a0c0d" opacity=".65" />
        <circle r="15" fill="#292b2b" stroke="#ff8b55" />
        <circle r="11.5" fill="url(#puck)" />
        <path d="M-4 0h8M0-4v8" stroke="#6b391f" strokeWidth="1.4" />
      </g>
    </svg>
  );
}
