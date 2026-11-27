import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { RotateCcw } from "lucide-react";
import { APPLICATIONS, type ApplicationId } from "../lib/applications";
import type { WorldFrame } from "../lib/worlds/types";
import { InstrumentArtwork } from "./scene-instrument-art";
import "./scene-controls.css";

export type InstrumentId = Exclude<ApplicationId, "manual">;
export type Command = { x: number; y: number };
type Props = {
  id: InstrumentId;
  value: Command;
  frame: WorldFrame;
  disabled: boolean;
  onMove: (x: number, y: number) => void;
  onCenter: () => void;
};

export const sceneGestureInfo = {
  flight: {
    name: "雙握把駕駛盤",
    hint: "抓住駕駛盤，左右偏轉壓低機翼。向自己拉會抬起機鼻，向前推則俯衝。",
    color: "#8ccced",
  },
  driving: {
    name: "賽車駕駛席",
    hint: "沿方向盤外圈轉動改變走線。右腳油門、左腳煞車，越往踏板底部踩越深。",
    color: "#ff956b",
  },
  marine: {
    name: "海況調節台",
    hint: "旋轉羅盤上的指針改變來浪方位，上下拉右側浪峰改變湧浪強度。",
    color: "#57d7c2",
  },
  seismic: {
    name: "震波激振器",
    hint: "在波形上拉高或壓低震幅，再撥右側震向指針，觀察樓層的橫向位移。",
    color: "#edae71",
  },
  optics: {
    name: "副鏡微調鼓輪",
    hint: "分別橫擦 X、Y 微調鼓輪，向右增加指令。看著中央焦面上的光點，微調至十字中心。",
    color: "#97baff",
  },
  docking: {
    name: "對接光學瞄準器",
    hint: "拖動雙框捕獲環接近固定十字，也可直接點選目標位置。偏心小於 3 mm 後自動進給。",
    color: "#73d7df",
  },
  rail: {
    name: "列車操作台",
    hint: "上下扳左側軌面外緣修正超高；右側主控桿推向高段加速、拉回低段減速。",
    color: "#efc36e",
  },
  cinema: {
    name: "動感放映台",
    hint: "左右撥動有齒孔的膠片調播放速率，拉右側混音推桿調座椅動感幅度。",
    color: "#efa2bd",
  },
  camera: {
    name: "鏡筒雙調節環",
    hint: "分別橫擦鏡筒上的兩只刻紋環。左環調防震增益，右環調手震頻率，再比較殘餘像移。",
    color: "#96ccab",
  },
  balance: {
    name: "站姿擾動向量板",
    hint: "由雙足中間向前方扇區劃出箭頭，方向決定支撐面推移方位，箭頭長度決定位移量。",
    color: "#9bd699",
  },
  machining: {
    name: "CNC 進給手輪",
    hint: "轉動左側手輪改變進給率。右側由圓心向外拖或用雙指開合，可改變刀路半徑。",
    color: "#edaf72",
  },
  vibration: {
    name: "頻率掃描台",
    hint: "沿頻譜橫掃激振頻率，在共振附近停留比對量測倍率。右側上下壓放阻尼調整器。",
    color: "#dfb1ed",
  },
  photonics: {
    name: "光功率掃描台",
    hint: "在晶片掃描面畫出搜尋路徑，顏色會記錄實測耦合功率。逐步靠近路徑上最亮的位置。",
    color: "#67ddcd",
  },
} as const satisfies Record<InstrumentId, { name: string; hint: string; color: string }>;

type Kind =
  | "yoke"
  | "turn"
  | "pedal"
  | "wave"
  | "amp"
  | "azimuth"
  | "micrometer"
  | "capture"
  | "cant"
  | "throttle"
  | "scrub"
  | "fader"
  | "ring"
  | "stance"
  | "radius"
  | "sweep"
  | "damper"
  | "scan";
type Region = {
  key: string;
  label: string;
  kind: Kind;
  box: [number, number, number, number];
  axis?: "x" | "y";
  pivot?: [number, number];
  range?: number;
};
const regions: Record<InstrumentId, Region[]> = {
  flight: [{ key: "yoke", label: "駕駛盤橫滾與拉推俯仰", kind: "yoke", box: [3, 1, 338, 121] }],
  driving: [
    {
      key: "wheel",
      label: "方向盤",
      kind: "turn",
      axis: "x",
      box: [4, 0, 163, 125],
      pivot: [84, 57],
      range: 118,
    },
    { key: "brake", label: "煞車踏板", kind: "pedal", axis: "y", box: [177, 4, 76, 122] },
    { key: "gas", label: "油門踏板", kind: "pedal", axis: "y", box: [256, 4, 83, 122] },
  ],
  marine: [
    {
      key: "heading",
      label: "來浪方位",
      kind: "turn",
      axis: "x",
      box: [2, 0, 140, 123],
      pivot: [69, 56],
      range: (0.72 * 180) / Math.PI,
    },
    { key: "crest", label: "湧浪強度", kind: "wave", axis: "y", box: [147, 5, 193, 118] },
  ],
  seismic: [
    { key: "amplitude", label: "震波振幅", kind: "amp", axis: "y", box: [4, 4, 211, 120] },
    {
      key: "azimuth",
      label: "激振方向",
      kind: "azimuth",
      axis: "x",
      box: [221, 3, 120, 120],
      pivot: [279, 66],
    },
  ],
  optics: [
    { key: "trim-x", label: "X 微調鼓輪", kind: "micrometer", axis: "x", box: [1, 2, 105, 122] },
    { key: "trim-y", label: "Y 微調鼓輪", kind: "micrometer", axis: "y", box: [238, 2, 105, 122] },
  ],
  docking: [{ key: "target", label: "捕獲環橫縱對位", kind: "capture", box: [23, 3, 299, 121] }],
  rail: [
    { key: "cant", label: "軌面超高修正", kind: "cant", axis: "x", box: [4, 5, 191, 115] },
    { key: "notch", label: "列車主控桿", kind: "throttle", axis: "y", box: [202, 2, 137, 121] },
  ],
  cinema: [
    { key: "film", label: "膠片播放速率", kind: "scrub", axis: "x", box: [2, 3, 226, 119] },
    { key: "fader", label: "動感推桿", kind: "fader", axis: "y", box: [233, 3, 108, 120] },
  ],
  camera: [
    { key: "gain-ring", label: "防震增益環", kind: "ring", axis: "x", box: [17, 4, 155, 119] },
    { key: "shake-ring", label: "手震頻率環", kind: "ring", axis: "y", box: [173, 4, 155, 119] },
  ],
  balance: [
    {
      key: "footprint",
      label: "支撐面擾動方向與距離",
      kind: "stance",
      box: [2, 1, 340, 124],
      pivot: [171, 101],
    },
  ],
  machining: [
    {
      key: "feed",
      label: "進給手輪",
      kind: "turn",
      axis: "x",
      box: [4, 1, 151, 122],
      pivot: [78, 57],
      range: 104,
    },
    {
      key: "toolpath",
      label: "刀路半徑",
      kind: "radius",
      axis: "y",
      box: [159, 1, 180, 121],
      pivot: [250, 57],
    },
  ],
  vibration: [
    { key: "frequency", label: "激振掃頻游標", kind: "sweep", axis: "x", box: [2, 1, 226, 122] },
    { key: "damper", label: "試體阻尼", kind: "damper", axis: "y", box: [231, 1, 109, 122] },
  ],
  photonics: [{ key: "wafer", label: "光纖掃描平面", kind: "scan", box: [4, 1, 221, 123] }],
};

const clamp = (n: number, min = -1, max = 1) => Math.min(max, Math.max(min, n));
const mixAxis = (v: Command, axis: "x" | "y", amount: number) => ({ ...v, [axis]: clamp(amount) });
type Point = { x: number; y: number };
type Touch = {
  zone: Region;
  node: SVGRectElement;
  start: Point;
  last: Point;
  startValue: Command;
  theta: number;
  pendingTap?: boolean;
  radialBias?: number;
};
function point(e: PointerEvent<SVGRectElement>): Point {
  const svg = e.currentTarget.ownerSVGElement!;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 172, y: 64 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return { x: p.x, y: p.y };
}
function angle(p: Point, c: [number, number]) {
  return Math.atan2(p.x - c[0], c[1] - p.y);
}
function radiusInput(p: Point) {
  return (Math.hypot(p.x - 250, p.y - 57) - 32) / 15;
}
function command(t: Touch, p: Point, current: Command, first: boolean): Command {
  const { zone: z, start, startValue } = t,
    dx = p.x - start.x,
    dy = p.y - start.y;
  switch (z.kind) {
    case "yoke":
      return { x: clamp(startValue.x + dx / 77), y: clamp(startValue.y + dy / 39) };
    case "turn": {
      if (first) return current;
      const a = angle(p, z.pivot!),
        da = Math.atan2(Math.sin(a - t.theta), Math.cos(a - t.theta));
      t.theta = a;
      // A grab on the hub behaves like a horizontal grip, where an angle is ill-defined.
      const nearHub = Math.hypot(t.last.x - z.pivot![0], t.last.y - z.pivot![1]) < 13;
      const delta = nearHub ? (p.x - t.last.x) / 55 : (da * 180) / Math.PI / z.range!;
      return mixAxis(current, "x", current.x + delta);
    }
    case "pedal":
      return mixAxis(current, "y", (z.key === "gas" ? 1 : -1) * clamp((p.y - 29) / 63, 0, 1));
    case "wave":
      return mixAxis(current, "y", startValue.y - dy / 30);
    case "amp":
      return mixAxis(current, "y", (38 - p.y) / 16);
    case "azimuth":
      return mixAxis(current, "x", angle(p, z.pivot!) / (Math.PI / 2));
    case "micrometer":
      return mixAxis(current, z.axis!, startValue[z.axis!] + dx / 103);
    case "capture":
      return { x: clamp((p.x - 173) / 76), y: clamp((61 - p.y) / 46) };
    case "cant":
      return mixAxis(current, "x", startValue.x - dy / 39);
    case "throttle":
      return mixAxis(current, "y", (57 - p.y) / 33);
    case "scrub":
      return mixAxis(current, "x", startValue.x + dx / 96);
    case "fader":
      return mixAxis(current, "y", (58 - p.y) / 35);
    case "ring":
      return mixAxis(current, z.axis!, startValue[z.axis!] + dx / 66);
    case "stance": {
      const x = p.x - 171,
        y = 101 - p.y,
        r = Math.hypot(x, y);
      return {
        x: r < 5 ? current.x : clamp(Math.atan2(x, Math.max(0, y)) / (Math.PI / 3)),
        y: clamp((r - 53) / 29),
      };
    }
    case "radius":
      return mixAxis(current, "y", radiusInput(p) + (t.radialBias ?? 0));
    case "sweep":
      return mixAxis(current, "x", (p.x - 116) / 91);
    case "damper":
      return mixAxis(current, "y", (p.y - 54) / 30);
    case "scan":
      return { x: clamp((p.x - 112) / 92), y: clamp((57 - p.y) / 43) };
  }
}

export function SceneControls({ id, value, frame, disabled, onMove, onCenter }: Props) {
  const live = useRef(value),
    contacts = useRef(new Map<number, Touch>()),
    pinch = useRef<{ gap: number; value: number } | null>(null);
  const spec = sceneGestureInfo[id];
  const axes = APPLICATIONS.find((item) => item.id === id)!.axes;
  const delivered = useRef(value);
  const listener = useRef(onMove);
  const queued = useRef<number | null>(null);
  useLayoutEffect(() => {
    listener.current = onMove;
  }, [onMove]);
  useLayoutEffect(() => {
    delivered.current = { x: value.x, y: value.y };
    if (queued.current === null) live.current = delivered.current;
  }, [value.x, value.y]);
  function discard() {
    if (queued.current !== null) cancelAnimationFrame(queued.current);
    queued.current = null;
    live.current = delivered.current;
    const active = [...contacts.current.entries()];
    contacts.current.clear();
    pinch.current = null;
    for (const [pointer, touch] of active)
      if (touch.node.hasPointerCapture(pointer)) touch.node.releasePointerCapture(pointer);
  }
  useLayoutEffect(() => {
    function visibility() {
      if (document.hidden) discard();
    }
    window.addEventListener("blur", discard);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", discard);
      document.removeEventListener("visibilitychange", visibility);
      discard();
    };
  }, [id, disabled]);
  function flush() {
    if (queued.current !== null) cancelAnimationFrame(queued.current);
    queued.current = null;
    const next = live.current;
    if (next.x === delivered.current.x && next.y === delivered.current.y) return;
    delivered.current = next;
    listener.current(next.x, next.y);
  }
  function send(v: Command) {
    if (disabled || (v.x === live.current.x && v.y === live.current.y)) return;
    live.current = v;
    if (queued.current === null) queued.current = requestAnimationFrame(flush);
  }
  function reset() {
    if (disabled) return;
    discard();
    live.current = delivered.current = { x: 0, y: 0 };
    onCenter();
  }
  function down(e: PointerEvent<SVGRectElement>, zone: Region) {
    if (disabled || e.button !== 0) return;
    if (
      [...contacts.current.values()].some((t) => t.zone.key === zone.key) &&
      zone.kind !== "radius"
    )
      return;
    if (
      zone.kind === "radius" &&
      [...contacts.current.values()].filter((t) => t.zone.kind === "radius").length >= 2
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const p = point(e),
      t: Touch = {
        zone,
        node: e.currentTarget,
        start: p,
        last: p,
        startValue: { ...live.current },
        theta: angle(p, zone.pivot ?? [0, 0]),
      };
    contacts.current.set(e.pointerId, t);
    if (zone.kind === "radius") {
      const pair = [...contacts.current.values()].filter((t) => t.zone.kind === "radius");
      if (pair.length === 2) {
        pair.forEach((contact) => {
          contact.pendingTap = false;
        });
        pinch.current = {
          gap: Math.hypot(pair[0].last.x - p.x, pair[0].last.y - p.y),
          value: live.current.y,
        };
        return;
      }
      if (e.pointerType === "touch") {
        t.pendingTap = true;
        return;
      }
    }
    send(command(t, p, live.current, true));
  }
  function move(e: PointerEvent<SVGRectElement>) {
    const t = contacts.current.get(e.pointerId);
    if (!t || disabled) return;
    const p = point(e),
      pin = pinch.current;
    const pair =
      t.zone.kind === "radius" && pin
        ? [...contacts.current.values()].filter((v) => v.zone.kind === "radius")
        : null;
    if (pair?.length === 2 && pin) {
      t.last = p;
      const gap = Math.hypot(pair[1].last.x - pair[0].last.x, pair[1].last.y - pair[0].last.y);
      send(mixAxis(live.current, "y", pin.value + (gap - pin.gap) / 39));
      return;
    }
    t.pendingTap = false;
    const next = command(t, p, live.current, false);
    t.last = p;
    send(next);
  }
  function release(e: PointerEvent<SVGRectElement>) {
    const t = contacts.current.get(e.pointerId);
    if (!t) return;
    if (e.type === "pointerup" && !disabled) {
      const p = point(e);
      if (t.pendingTap || p.x !== t.last.x || p.y !== t.last.y) move(e);
      flush();
    } else if (contacts.current.size === 1 && queued.current !== null) {
      cancelAnimationFrame(queued.current);
      queued.current = null;
      live.current = delivered.current;
    }
    contacts.current.delete(e.pointerId);
    if (t?.zone.kind === "radius" && pinch.current) {
      for (const contact of contacts.current.values())
        if (contact.zone.kind === "radius")
          contact.radialBias = live.current.y - radiusInput(contact.last);
      pinch.current = null;
    }
  }
  function key(e: KeyboardEvent<SVGRectElement>, zone: Region) {
    if (disabled) return;
    if (e.key === "Home") {
      e.preventDefault();
      reset();
      return;
    }
    const step = e.shiftKey ? 0.01 : 0.04,
      axis = zone.axis;
    if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const sign = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
    if (zone.kind === "pedal") {
      const polarity = zone.key === "brake" ? -1 : 1;
      const pressure = clamp(live.current.y * polarity, 0, 1);
      send(mixAxis(live.current, "y", polarity * clamp(pressure + sign * step, 0, 1)));
      return;
    }
    const chosen = axis ?? (e.key === "ArrowLeft" || e.key === "ArrowRight" ? "x" : "y");
    const polarity = zone.kind === "yoke" && chosen === "y" ? -1 : 1;
    send(mixAxis(live.current, chosen, live.current[chosen] + polarity * sign * step));
  }
  return (
    <section
      className="scene-controls"
      data-instrument={id}
      style={{ "--instrument-color": spec.color } as CSSProperties}
      aria-label={spec.name}
    >
      <output className="instrument-command" aria-label="場景操作指令">
        {axes[0]} {Math.round(value.x * 100)}%，{axes[1]} {Math.round(value.y * 100)}%
      </output>
      <header className="instrument-header">
        <span>
          <i />
          {spec.name}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          title="重設兩軸指令（Home）"
          aria-label="重設場景操作器"
        >
          <RotateCcw size={14} />
        </button>
      </header>
      <svg
        viewBox="0 0 344 128"
        className="instrument-face"
        aria-label={spec.name + "，方向鍵微調，Home 重設"}
      >
        <InstrumentArtwork key={id} id={id} value={value} frame={frame} />
        {regions[id].map((z) => (
          <rect
            key={z.key}
            className="instrument-zone"
            data-control-part={z.key}
            x={z.box[0]}
            y={z.box[1]}
            width={z.box[2]}
            height={z.box[3]}
            rx={5}
            fill="transparent"
            tabIndex={disabled ? -1 : 0}
            role={z.axis ? "slider" : "group"}
            aria-label={z.label}
            aria-disabled={disabled}
            aria-valuemin={z.kind === "pedal" ? 0 : z.axis ? -100 : undefined}
            aria-valuemax={z.axis ? 100 : undefined}
            aria-valuenow={
              z.kind === "pedal"
                ? Math.round(100 * Math.max(0, (z.key === "brake" ? -1 : 1) * value.y))
                : z.axis
                  ? Math.round(value[z.axis] * 100)
                  : undefined
            }
            onPointerDown={(e) => down(e, z)}
            onPointerMove={move}
            onLostPointerCapture={release}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={(e) => key(e, z)}
          />
        ))}
      </svg>
    </section>
  );
}
