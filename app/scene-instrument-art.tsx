import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Command, InstrumentId } from "./scene-controls";
import type { WorldFrame } from "../lib/worlds/types";

type Props = { id: InstrumentId; value: Command; frame: WorldFrame };
type Ink = "accent" | "white" | "muted";
const ink = { accent: "var(--instrument-color)", white: "#e2ebe8", muted: "#8b9b9b" };
const line = "#516363",
  accent = ink.accent;
const clip = (n: number, min = -1, max = 1) => Math.min(max, Math.max(min, n));
const pt = (cx: number, cy: number, r: number, a: number) => [
  cx + Math.sin((a * Math.PI) / 180) * r,
  cy - Math.cos((a * Math.PI) / 180) * r,
];
function Text({
  x,
  y,
  children,
  color = "muted",
  anchor = "middle",
  big = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  color?: Ink;
  anchor?: "start" | "middle" | "end";
  big?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={ink[color]}
      className={big ? "instrument-reading" : "instrument-label"}
    >
      {children}
    </text>
  );
}
function Ticks({
  cx,
  cy,
  r,
  start = -135,
  end = 135,
  n = 24,
}: {
  cx: number;
  cy: number;
  r: number;
  start?: number;
  end?: number;
  n?: number;
}) {
  return (
    <g>
      {Array.from({ length: n + 1 }, (_, i) => {
        const a = start + (i * (end - start)) / n;
        const p = pt(cx, cy, r, a),
          q = pt(cx, cy, r - (i % 3 === 0 ? 5 : 2.5), a);
        return (
          <path
            d={`M${p[0]} ${p[1]} L${q[0]} ${q[1]}`}
            stroke={i % 3 === 0 ? "#a6b5af" : "#637371"}
            strokeWidth={i % 3 === 0 ? 1.4 : 1}
            key={i}
          />
        );
      })}
    </g>
  );
}
function Definitions({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={p + "cast"} x2="0" y2="1">
        <stop stopColor="#899493" />
        <stop offset=".10" stopColor="#536364" />
        <stop offset=".39" stopColor="#354449" />
        <stop offset=".62" stopColor="#243135" />
        <stop offset="1" stopColor="#131a1b" />
      </linearGradient>
      <linearGradient id={p + "alum"} x2=".2" y2="1">
        <stop stopColor="#849795" />
        <stop offset=".20" stopColor="#e2e8e2" />
        <stop offset=".38" stopColor="#758786" />
        <stop offset=".75" stopColor="#394e51" />
        <stop offset="1" stopColor="#a6b3a9" />
      </linearGradient>
      <linearGradient id={p + "rubber"} x2="0" y2="1">
        <stop stopColor="#596568" />
        <stop offset=".16" stopColor="#313d41" />
        <stop offset=".58" stopColor="#1b2328" />
        <stop offset=".9" stopColor="#11191d" />
        <stop offset="1" stopColor="#3c4847" />
      </linearGradient>
      <linearGradient id={p + "film"} x2="1" y2=".3">
        <stop stopColor="#244356" />
        <stop offset=".55" stopColor="#b49ca3" />
        <stop offset="1" stopColor="#e5b18b" />
      </linearGradient>
      <radialGradient id={p + "lens"} cx=".4" cy=".37">
        <stop stopColor="#2e4950" />
        <stop offset=".5" stopColor="#20343b" />
        <stop offset=".84" stopColor="#12232b" />
        <stop offset="1" stopColor="#080e12" />
      </radialGradient>
      <radialGradient id={p + "knob"} cx=".32" cy=".18" r=".86">
        <stop stopColor="#748683" />
        <stop offset=".34" stopColor="#435352" />
        <stop offset=".77" stopColor="#293735" />
        <stop offset=".90" stopColor="#172424" />
        <stop offset="1" stopColor="#798783" />
      </radialGradient>
      <pattern id={p + "grid"} width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M12 0H0V12" fill="none" stroke="#648481" strokeWidth=".55" opacity=".5" />
      </pattern>
      <pattern
        id={p + "grip"}
        width="4"
        height="4"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(26)"
      >
        <path d="M0 0V4" stroke="#b2c1bc" strokeWidth="1.3" opacity=".5" />
      </pattern>
      <pattern id={p + "mesh"} width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r=".8" fill="#7e8f8b" opacity=".7" />
      </pattern>
      <clipPath id={p + "strip"}>
        <rect x="10" y="26" width="212" height="57" rx="3" />
      </clipPath>
    </defs>
  );
}
function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="2.1" fill="#384447" stroke="#758180" strokeWidth=".6" />
      <path d="m-1 .75 2-1.5" stroke="#1a2124" />
    </g>
  );
}
function Field({ x, y, w, h, p }: { x: number; y: number; w: number; h: number; p: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#102022" stroke="#506060" />
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4} fill={`url(#${p}grid)`} />
    </>
  );
}
function Arrow({
  x,
  y,
  angle = 0,
  size = 1,
}: {
  x: number;
  y: number;
  angle?: number;
  size?: number;
}) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}
      d="M0 -6 4 2 0 0 -4 2Z"
      fill={accent}
    />
  );
}
const partUrl = (p: string, name: string) => `url(#${p}${name})`;
function Dial({
  x,
  y,
  r,
  p,
  angle,
  degrees = false,
}: {
  x: number;
  y: number;
  r: number;
  p: string;
  angle: number;
  degrees?: boolean;
}) {
  return (
    <>
      <circle cx={x} cy={y} r={r + 3} fill={partUrl(p, "rubber")} stroke={line} />
      <circle cx={x} cy={y} r={r} fill={partUrl(p, "lens")} />
      <Ticks cx={x} cy={y} r={r - 3} start={-150} end={150} n={30} />
      <g stroke="#a9bdb6" opacity=".36" strokeWidth=".7">
        <path d={`M${x - r * 0.65} ${y}h${r * 1.3} M${x} ${y - r * 0.65}v${r * 1.3}`} />
        <circle cx={x} cy={y} r={r * 0.55} fill="none" strokeDasharray="2 3" />
      </g>
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        <path d={`M0 ${-r + 8}l5 ${r - 12} -5 5 -5-5Z`} fill={accent} />
        <path d={`M0 ${r - 9}l4 ${-r + 13} -4-4 -4 4Z`} fill="#9caeaa" />
        <circle r="4.8" fill={partUrl(p, "knob")} stroke="#cad4cb" strokeWidth=".65" />
      </g>
      {degrees && (
        <Text x={x} y={y + r * 0.72} color="white">
          {Math.round(angle)}°
        </Text>
      )}
    </>
  );
}
type ArtProps = { p: string; v: Command; f: WorldFrame };
function Flight({ p, v, f }: ArtProps) {
  const grip =
    "M-71 -24 Q-76 -38 -66 -40 Q-57 -41 -53 -30 L-37 -7 Q-20 -2 -12 1 L12 1 Q20 -2 37 -7 L53 -30 Q57 -41 66 -40 Q76 -38 71 -24 L53 7 Q50 14 39 17 L16 23 -16 23 -39 17 Q-50 14 -53 7Z";
  return (
    <>
      <path d="M46 58Q88 2 167 12" fill="none" stroke={line} strokeDasharray="2 5" />
      <Text x={39} y={40}>
        左
      </Text>
      <Text x={202} y={40}>
        右
      </Text>
      <rect
        x="102"
        y="53"
        width="35"
        height="47"
        rx="8"
        fill={partUrl(p, "rubber")}
        stroke={line}
      />
      <rect x="112" y="48" width="15" height="48" rx="5" fill={partUrl(p, "alum")} />
      <g transform={`translate(120,${62 + 7 * v.y}) rotate(${v.x * 25})`}>
        <path d={grip} fill={partUrl(p, "cast")} stroke="#879993" strokeWidth="1.4" />
        <path
          d="M-64 -31 -48 -3M64 -31 48 -3"
          stroke="#141d20"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M-64 -31 -48 -3M64 -31 48 -3"
          stroke={partUrl(p, "grip")}
          strokeWidth="10"
          strokeLinecap="round"
        />
        <rect
          x="-22"
          y="1"
          width="44"
          height="22"
          rx="8"
          fill={partUrl(p, "rubber")}
          stroke={line}
        />
        <path d="M-12 12h7l5-4 5 4h7" fill="none" stroke={accent} strokeWidth="1.7" />
        <Screw x={-30} y={10} />
        <Screw x={30} y={10} />
      </g>
      <g transform="translate(276 53)">
        <circle r="37" fill={partUrl(p, "cast")} stroke={line} />
        <circle r="32" fill="#415864" />
        <clipPath id={p + "horizon"}>
          <circle r="31" />
        </clipPath>
        <g clipPath={partUrl(p, "horizon")}>
          <g
            transform={`rotate(${(-f.deckRoll * 180) / Math.PI}) translate(0 ${f.deckPitch * 85})`}
          >
            <path d="M-40 0H40V45H-40Z" fill="#76624d" />
            <path
              d="M-40 0H40 M-11 -8H11 M-7 -16H7 M-11 8H11 M-7 16H7"
              fill="none"
              stroke="#d5ded3"
              strokeWidth="1.1"
            />
          </g>
        </g>
        <path d="M-17 0h9l3 4h10l3-4h9" fill="none" stroke={accent} strokeWidth="2" />
      </g>
      <Text x={118} y={117} color="white">
        偏轉 · 推拉
      </Text>
      <Text x={275} y={112}>
        台面地平儀
      </Text>
    </>
  );
}
function Driving({ p, v }: ArtProps) {
  return (
    <>
      <Ticks cx={84} cy={55} r={51} start={-105} end={105} n={14} />
      <g transform={`translate(84 55) rotate(${118 * v.x})`}>
        <circle r="36" fill="#101619" />
        <path
          d="M-39 -12 -29 6 -10 11 -4 36 4 36 10 11 29 6 39 -12 12 -3 -12 -3Z"
          fill={partUrl(p, "alum")}
          stroke="#8c9894"
          strokeWidth=".55"
        />
        <circle r="42" fill="none" stroke="#11181b" strokeWidth="12" />
        <circle r="42" fill="none" stroke={partUrl(p, "rubber")} strokeWidth="10" />
        <circle
          r="42"
          fill="none"
          stroke={partUrl(p, "grip")}
          strokeWidth="7"
          strokeDasharray="38 94"
        />
        <path d="M-4 -42h8" stroke={accent} strokeWidth="8" />
        <circle r="16" fill={partUrl(p, "rubber")} stroke={line} />
        <path d="M-7 1 -2-3 0 1 4-3 7 0" stroke={accent} fill="none" strokeWidth="2" />
      </g>
      {[
        { x: 212, n: "煞車", v: Math.max(0, -v.y), gas: false },
        { x: 292, n: "油門", v: Math.max(0, v.y), gas: true },
      ].map((q) => (
        <g key={q.n}>
          <rect x={q.x - 26} y="11" width="52" height="87" rx="7" fill="#121a1d" stroke={line} />
          <path d={`M${q.x - 3} 25v49`} stroke="#657571" strokeWidth="8" />
          <g transform={`translate(${q.x} ${q.v * 9})`}>
            <rect
              x={q.gas ? -14 : -20}
              y={q.gas ? 19 : 29}
              width={q.gas ? 28 : 40}
              height={q.gas ? 56 : 39}
              rx="5"
              fill={partUrl(p, "alum")}
              stroke="#a1aca7"
            />
            {Array.from({ length: q.gas ? 5 : 4 }, (_, i) => (
              <rect
                key={i}
                x={q.gas ? -9 : -15}
                y={(q.gas ? 26 : 34) + i * 7}
                width={q.gas ? 18 : 30}
                height="3"
                rx="1.5"
                fill="#303c40"
              />
            ))}
          </g>
          <rect x={q.x - 19} y="90" width="38" height="3" rx="1" fill="#344144" />
          <rect x={q.x - 19} y="90" width={q.v * 38} height="3" fill={accent} />
          <Text x={q.x} y={116} color="white">
            {q.n}
          </Text>
        </g>
      ))}
      <Text x={84} y={117}>
        循外圈轉動
      </Text>
    </>
  );
}
function Marine({ p, v }: ArtProps) {
  const amp = 10 + 7 * v.y,
    baseline = 60,
    points = (o: number, scale: number) =>
      Array.from(
        { length: 155 },
        (_, i) =>
          `${155 + i * 1.14},${baseline + o + amp * scale * Math.sin(((i - 31) * Math.PI) / 45)}`,
      ).join(" ");
  return (
    <>
      <Dial x={69} y={55} r={44} p={p} angle={((0.6 + 0.72 * v.x) * 180) / Math.PI} degrees />
      <path d="M66 11l3 -5 3 5Z" fill={accent} />
      <Text x={69} y={117}>
        來浪方位
      </Text>
      <Field x={148} y={13} w={187} h={81} p={p} />
      {[17, 9, 0].map((o, i) => (
        <polyline
          key={o}
          points={points(o, 0.5 + i * 0.25)}
          stroke={["#3d7777", "#549c94", accent][i]}
          strokeWidth={i === 2 ? 2 : 1}
          fill="none"
        />
      ))}
      <path d="M204 23h17m-8-6v12" stroke={accent} opacity=".7" />
      <circle
        cx={165}
        cy={Number(points(0, 1).split(" ")[9].split(",")[1])}
        r="4"
        fill={accent}
        stroke="#b7e9df"
      />
      <Text x={240} y={117} color="white">
        上下拉動浪峰
      </Text>
    </>
  );
}
function Seismic({ p, v }: ArtProps) {
  const amp = 6 + (v.y + 1) * 16,
    points = Array.from({ length: 130 }, (_, i) => {
      const a = (i / 129) * 6.5;
      return `${15 + i * 1.48},${60 - amp * (Math.sin(a * 11) + 0.37 * Math.sin(a * 23)) * 0.73 * Math.pow(Math.sin((a * Math.PI) / 6.5), 2)}`;
    }).join(" ");
  return (
    <>
      <Field x={8} y={12} w={206} h={84} p={p} />
      <path d="M16 60h190" stroke="#647773" strokeDasharray="2 4" />
      <polyline points={points} stroke={accent} strokeWidth="1.8" fill="none" />
      <path d={`M17 ${60 - amp}h189`} stroke={accent} opacity=".65" strokeDasharray="4 4" />
      <circle cx={187} cy={60 - amp} r="4" fill={accent} />
      <Text x={110} y={116} color="white">
        拉動上緣設定震幅
      </Text>
      <Dial x={279} y={61} r={40} p={p} angle={v.x * 90} degrees />
      <Text x={278} y={116}>
        激振方向
      </Text>
    </>
  );
}

function Drum({
  x,
  y,
  w,
  p,
  value,
}: {
  x: number;
  y: number;
  w: number;
  p: string;
  value: number;
}) {
  const off = (value * 30) % 6;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="5" width={w} height="35" rx="6" fill={partUrl(p, "cast")} stroke={line} />
      <rect
        x="7"
        y="0"
        width={w - 14}
        height="45"
        rx="6"
        fill={partUrl(p, "alum")}
        stroke="#92a39f"
      />
      <g stroke="#263636" strokeWidth="2">
        {Array.from({ length: Math.floor((w - 27) / 6) }, (_, i) => (
          <path key={i} d={`M${15 + i * 6 + off} 5v35`} />
        ))}
      </g>
      <path d={`M${w / 2 - 4} -7h8l-4 5Z`} fill={accent} />
    </g>
  );
}
function Optics({ p, v, f }: ArtProps) {
  const px = clip(f.planeX / 20) * 34,
    py = clip(f.planeY / 20) * 34;
  return (
    <>
      <Drum x={7} y={34} w={92} p={p} value={v.x} />
      <Drum x={245} y={34} w={92} p={p} value={v.y} />
      <g transform="translate(172 55)">
        <circle r="44" fill={partUrl(p, "cast")} stroke={line} />
        <circle r="40" fill={partUrl(p, "lens")} />
        {[10, 20, 30].map((r) => (
          <circle key={r} r={r} fill="none" stroke="#698087" opacity=".65" strokeWidth=".65" />
        ))}
        <path d="M-34 0h68M0 -34v68" stroke="#b4c8cb" strokeWidth=".8" />
        <circle cx={px} cy={-py} r="6.3" fill={accent} opacity=".14" />
        <circle cx={px} cy={-py} r="2.8" fill="#eef9ff" />
      </g>
      <Text x={52} y={115} color="white">
        X 微調
      </Text>
      <Text x={172} y={115}>
        焦面偏心
      </Text>
      <Text x={292} y={115} color="white">
        Y 微調
      </Text>
    </>
  );
}
function Docking({ p, v, f }: ArtProps) {
  const targetX = 173 + 76 * 0.5,
    targetY = 61 + 46 * 0.4,
    x = 173 + v.x * 76,
    y = 61 - v.y * 46;
  const actualX = targetX + clip(f.planeX / 28, -1.5, 1.5) * 76,
    actualY = targetY - clip(f.planeY / 25, -1.5, 1.5) * 46;
  return (
    <>
      <Field x={11} y={4} w={321} h={101} p={p} />
      <path
        d="M19 27v-15h17M325 27v-15h-17M19 82v15h17M325 82v15h-17"
        stroke="#82aaa8"
        strokeWidth="1.3"
        fill="none"
      />
      <g transform={`translate(${targetX} ${targetY})`} stroke={accent} fill="none">
        <circle r="8.4" strokeDasharray="2 2" />
        <path d="M-16 0h12m8 0h12M0 -16v12m0 8v12" />
      </g>
      <g
        transform={`translate(${actualX} ${actualY})`}
        fill="none"
        stroke="#d8e5df"
        strokeWidth=".9"
        opacity=".8"
      >
        <circle r="13" />
        <path d="M-17 0h4m14-13v-4m16 17h-4m-12 14v4" />
      </g>
      <g transform={`translate(${x} ${y})`} stroke={accent} strokeWidth="1.7" fill="none">
        <path d="M-17 -9v-8h8m18 0h8v8m0 18v8h-8m-18 0h-8v-8" />
      </g>
      <Text x={30} y={27} anchor="start">
        對接介面
      </Text>
      <Text x={172} y={122} color="white">
        拖捕獲環對準十字
      </Text>
    </>
  );
}
function Rail({ p, v }: ArtProps) {
  return (
    <>
      <path d="M13 86h167" stroke="#71847d" strokeDasharray="3 3" />
      <g transform={`translate(102 72) rotate(${-v.x * 13})`}>
        <path d="M-77 5h154l-4 7H-73Z" fill={partUrl(p, "cast")} stroke="#8b9991" />
        <path d="M-48 -1v8m96-8v8" stroke={partUrl(p, "alum")} strokeWidth="12" />
        <path d="M-61 -6h23m76 0h23" stroke="#c2cec5" strokeWidth="4" />
        <g fill={partUrl(p, "rubber")} stroke={line}>
          <circle cx="-42" cy="-12" r="7" />
          <circle cx="42" cy="-12" r="7" />
        </g>
        <path
          d="M-50 -17v-22q0-12 12-13h76q12 1 12 13v22Z"
          fill={partUrl(p, "alum")}
          stroke="#a7b6ae"
        />
        <path d="M-43 -27v-12q0-5 5-5h32v17Zm49 0v-17h32q5 0 5 5v12Z" fill="#273a42" />
        <path d="M-48 -21h96" stroke={accent} strokeWidth="2.5" />
      </g>
      <rect x="220" y="12" width="92" height="84" rx="8" fill={partUrl(p, "cast")} stroke={line} />
      <path d="M266 22v66" stroke="#0c1517" strokeWidth="16" strokeLinecap="round" />
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          d={`M281 ${24 + 10 * i}h${i % 3 === 0 ? 9 : 6}`}
          stroke={i % 3 === 0 ? accent : "#8f9c94"}
        />
      ))}
      <g transform={`translate(264 ${57 - v.y * 33})`}>
        <path d="M-12 -9h23l5 6-3 9h-26l-3-5Z" fill={partUrl(p, "rubber")} stroke="#acb9ad" />
        <path d="M-9 -5h18" stroke={accent} strokeWidth="2.3" />
      </g>
      <Text x={102} y={115} color="white">
        扳動軌面超高
      </Text>
      <Text x={265} y={115} color="white">
        速段主控桿
      </Text>
    </>
  );
}
function Cinema({ p, v, f }: ArtProps) {
  const shift = v.x * 26;
  return (
    <>
      <g clipPath={partUrl(p, "strip")}>
        <rect x="8" y="25" width="216" height="59" fill="#091013" />
        {Array.from({ length: 7 }, (_, i) => {
          const x = -60 + i * 55 + shift;
          return (
            <g key={i}>
              <rect x={x + 3} y="36" width="50" height="37" rx="1" fill={partUrl(p, "film")} />
              <path d={`M${x + 3} 67q12 -19 20 -19q3 2 8 9q9 -7 22 -8v24h-50Z`} fill="#3f574f" />
              <path d={`M${x + 15} 73q12 -8 14 -17q3 8 15 17Z`} fill="#9ba6a1" />
              <circle cx={x + 13 + (i % 3) * 7} cy={43} r="3" fill="#f5d5a0" />
            </g>
          );
        })}
        {Array.from({ length: 32 }, (_, i) => (
          <g key={i} fill="#899296">
            <rect x={-27 + i * 11 + (shift % 11)} y="27" width="5" height="4" rx="1" />
            <rect x={-27 + i * 11 + (shift % 11)} y="77" width="5" height="4" rx="1" />
          </g>
        ))}
      </g>
      <path d="M110 19h12l-6 7Z" fill={accent} />
      <rect x="46" y="91" width="141" height="3" fill="#364547" />
      <rect
        x="46"
        y="91"
        width={141 * ((f.phase % (Math.PI * 2)) / (Math.PI * 2))}
        height="3"
        fill={accent}
      />
      <rect
        x="244"
        y="12"
        width="83"
        height="85"
        rx="6"
        stroke={line}
        fill={partUrl(p, "rubber")}
      />
      <path d="M283 23v65" stroke="#071215" strokeWidth="8" />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M260 ${23 + i * 8}h${i % 4 === 0 ? 12 : 7} M302 ${23 + i * 8}h6`}
          stroke="#82938b"
          strokeWidth=".8"
        />
      ))}
      <g transform={`translate(283 ${57 - v.y * 32})`}>
        <rect
          x="-16"
          y="-6"
          width="32"
          height="12"
          rx="2"
          fill={partUrl(p, "alum")}
          stroke="#a3ada5"
        />
        <path d="M-13 0h26" stroke="#634e62" strokeWidth="2" />
      </g>
      <Text x={116} y={116} color="white">
        左右撥片 · 播放速率
      </Text>
      <Text x={284} y={116}>
        動感幅度
      </Text>
    </>
  );
}
function Camera({ p, v }: ArtProps) {
  return (
    <>
      <path
        d="M22 39q5 -9 14-10l26 1v-9h202l21 5 22 1 13 9v39l-14 12-30 1-16 7H61v-8H35q-12-2-13-14Z"
        fill={partUrl(p, "rubber")}
        stroke="#81918e"
        strokeWidth="1.4"
      />
      <path d="M23 40h20v39H24M311 36l8 4v31l-8 9" fill={partUrl(p, "alum")} />
      {[
        { x: 57, w: 95, n: "防震增益", v: v.x, read: Math.round((v.x + 1) * 50) + "%" },
        { x: 188, w: 94, n: "手震頻率", v: v.y, read: (0.65 + 0.32 * v.y).toFixed(2) + " Hz" },
      ].map((q) => (
        <g key={q.n}>
          <rect
            x={q.x}
            y="25"
            width={q.w}
            height="61"
            rx="6"
            fill={partUrl(p, "cast")}
            stroke="#728681"
          />
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M${q.x + 8 + 6 * i + ((q.v * 20) % 5)} 29v53`}
              stroke="#243133"
              strokeWidth="2.7"
            />
          ))}
          <rect
            x={q.x + 15}
            y="46"
            width={q.w - 30}
            height="17"
            rx="2"
            fill="#162322"
            stroke="#52665f"
          />
          <Text x={q.x + q.w / 2} y={58} color="accent">
            {q.read}
          </Text>
          <path d={`M${q.x + q.w / 2 - 4} 18h8l-4 6Z`} fill={accent} />
          <Text x={q.x + q.w / 2} y={116} color="white">
            {q.n}
          </Text>
        </g>
      ))}
      <path d="M172 27v57" stroke={accent} strokeWidth="2" />
    </>
  );
}
function Balance({ p, v }: ArtProps) {
  const a = (v.x * Math.PI) / 3,
    r = 53 + 29 * v.y,
    tx = 171 + Math.sin(a) * r,
    ty = 101 - Math.cos(a) * r;
  const shoe = "M-3 -21c5 -4 11 0 12 7l1 12q0 6-4 11l-1 8q-1 5-6 5q-5-1-6-7l-1-17q-3-11 5-19Z";
  return (
    <>
      <path d="M171 101 97.4 58.5A85 85 0 0 1 244.6 58.5Z" fill="#263b30" stroke="#698873" />
      {[26, 49, 72].map((R) => (
        <path
          key={R}
          d={`M${171 - 0.866 * R} ${101 - 0.5 * R} A${R} ${R} 0 0 1 ${171 + 0.866 * R} ${101 - 0.5 * R}`}
          stroke="#66836f"
          opacity=".68"
          fill="none"
          strokeDasharray="3 3"
        />
      ))}
      {[-60, -30, 0, 30, 60].map((n) => {
        const q = pt(171, 101, 84, n);
        return <path key={n} d={`M171 101L${q[0]} ${q[1]}`} stroke="#719079" strokeWidth=".6" />;
      })}
      <path
        d={shoe}
        transform="translate(149 85) rotate(-12) scale(.69)"
        fill={partUrl(p, "rubber")}
        stroke="#bbd1b9"
        strokeWidth="1.8"
      />
      <path
        d={shoe}
        transform="translate(194 85) rotate(12) scale(-.69 .69)"
        fill={partUrl(p, "rubber")}
        stroke="#bbd1b9"
        strokeWidth="1.8"
      />
      <path d={`M171 101L${tx} ${ty}`} stroke={accent} strokeWidth="2.4" />
      <Arrow x={tx} y={ty} angle={v.x * 60} size={1.5} />
      <Text x={47} y={44}>
        擾動角
      </Text>
      <Text x={47} y={64} big color="accent">
        {Math.round(v.x * 60)}°
      </Text>
      <Text x={296} y={44}>
        推移量
      </Text>
      <Text x={296} y={64} big color="accent">
        {(24 + 14 * v.y).toFixed(0)} mm
      </Text>
      <Text x={171} y={121} color="white">
        由雙足中心向外劃
      </Text>
    </>
  );
}

function Machining({ p, v, f }: ArtProps) {
  const r = 32 + 15 * v.y,
    q = pt(78, 57, 26, v.x * 104 + 40),
    a = f.phase,
    tx = 250 + r * Math.cos(a),
    ty = 57 - r * Math.sin(a);
  return (
    <>
      <Ticks cx={78} cy={57} r={45} start={-138} end={138} n={30} />
      <circle cx="78" cy="57" r="36" fill={partUrl(p, "knob")} stroke="#9ea99f" />
      <g transform={`translate(78 57) rotate(${v.x * 104})`}>
        <circle r="27" fill={partUrl(p, "rubber")} stroke="#778880" />
        {[0, 120, 240].map((n) => (
          <path
            key={n}
            transform={`rotate(${n})`}
            d="M-2 -9 -6 -25H5L2 -8Z"
            fill={partUrl(p, "alum")}
          />
        ))}
        <circle r="12" fill={partUrl(p, "alum")} />
        <circle r="5" fill="#54615d" stroke={line} />
        <path d="M0 -35v7" stroke={accent} strokeWidth="2.6" />
      </g>
      <circle cx={q[0]} cy={q[1] + 2} r="6" fill="#121819" />
      <circle cx={q[0]} cy={q[1]} r="6" fill={partUrl(p, "knob")} stroke="#86958d" />
      <Field x={159} y={5} w={179} h={99} p={p} />
      <path d="M175 57h146M250 12v87" stroke="#7c8a81" strokeWidth=".7" strokeDasharray="2 3" />
      <circle
        cx={250}
        cy={57}
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        strokeDasharray="4 2"
      />
      <path d={`M250 57h${r}`} stroke={accent} strokeWidth="1" />
      <circle cx={250 + r} cy={57} r="4" fill={accent} />
      <circle cx={tx} cy={ty} r="3" fill="#f4efe2" />
      <Text x={78} y={117} color="white">
        進給手輪
      </Text>
      <Text x={249} y={121} color="white">
        刀路半徑 · {(22 + 10 * v.y).toFixed(0)} mm
      </Text>
    </>
  );
}
type Sample = { x: number; y: number; v: number };
function useMeasurements(f: WorldFrame, mode: "spectrum" | "power") {
  const [samples, setSamples] = useState<Sample[]>([]),
    last = useRef(-1);
  const t = f.t,
    metric = f.metric,
    nx = mode === "spectrum" ? (f.frequency - 0.98) / 0.52 : f.deckX / 0.021,
    ny = f.deckY / 0.018;
  useEffect(() => {
    const restart = last.current > t;
    if (!restart && t - last.current < 0.08) return;
    last.current = t;
    const i = Math.round((clip(nx) + 1) * (mode === "spectrum" ? 25 : 17)),
      j = mode === "spectrum" ? 0 : Math.round((clip(ny) + 1) * 10);
    setSamples((old) => {
      const list = restart ? [] : old,
        idx = list.findIndex((s) => s.x === i && s.y === j);
      const v = mode === "spectrum" ? Math.round(metric * 20) / 20 : Math.round(metric);
      if (!Number.isFinite(v) || (!restart && idx >= 0 && list[idx].v === v)) return list;
      const point = { x: i, y: j, v };
      if (idx < 0) return [...list, point];
      const result = list.slice();
      result[idx] = point;
      return result;
    });
  }, [t, metric, nx, ny, mode]);
  return samples;
}
function Vibration({ p, v, f }: ArtProps) {
  const samples = useMeasurements(f, "spectrum"),
    sx = 116 + v.x * 91,
    damperSize = 19 - 9 * v.y,
    lower = 76,
    high = lower - damperSize;
  const spring = Array.from(
    { length: 13 },
    (_, i) => `${288 + (i % 2 ? 9 : -9)},${high + (i / 12) * damperSize}`,
  ).join(" ");
  return (
    <>
      <Field x={9} y={9} w={217} h={89} p={p} />
      <path d="M24 26v56h184" fill="none" stroke="#85978d" />
      {samples.map((s) => (
        <rect
          x={25 + s.x * 3.64 - 1.5}
          y={82 - clip(s.v / 7, 0, 1) * 53}
          width="3"
          height={Math.max(1, clip(s.v / 7, 0, 1) * 53)}
          fill={accent}
          opacity=".73"
          key={s.x}
        />
      ))}
      <path d={`M${sx} 29v54`} stroke={accent} strokeDasharray="3 2" />
      <path d={`M${sx - 4} 24h8l-4 7Z`} fill={accent} />
      <Text x={25} y={23} anchor="start">
        實測倍率
      </Text>
      <Text x={209} y={23} color="accent" anchor="end">
        {Number(f.metric).toFixed(2)}×
      </Text>
      <g transform={`translate(0 ${(v.y + 1) * 4})`}>
        <path d="M286 19v24" stroke={partUrl(p, "alum")} strokeWidth="7" />
        <rect
          x="266"
          y="14"
          width="40"
          height="9"
          rx="3"
          fill={partUrl(p, "alum")}
          stroke="#a5b2ab"
        />
        <rect
          x="277"
          y="32"
          width="19"
          height="17"
          rx="3"
          fill={partUrl(p, "cast")}
          stroke={line}
        />
      </g>
      <path d="M287 44v39" stroke="#8b9a9b" strokeWidth="4" />
      <polyline
        points={spring}
        fill="none"
        stroke={accent}
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
      <rect x="272" y="76" width="31" height="8" rx="2" fill={partUrl(p, "alum")} stroke={line} />
      <rect x="261" y="85" width="54" height="5" rx="1" fill={partUrl(p, "cast")} stroke={line} />
      <Text x={116} y={117} color="white">
        激振 · {(0.98 + 0.52 * v.x).toFixed(2)} Hz
      </Text>
      <Text x={286} y={117} color="white">
        阻尼 · {Math.round(12 + 8 * v.y)}%
      </Text>
    </>
  );
}
function Photonics({ p, v, f }: ArtProps) {
  const samples = useMeasurements(f, "power"),
    posX = 112 + v.x * 92,
    posY = 57 - v.y * 43,
    cur = clip(f.metric / 100, 0, 1);
  return (
    <>
      <Field x={10} y={6} w={207} h={97} p={p} />
      {samples.map((s) => (
        <rect
          x={20 + s.x * (184 / 34) - 2.9}
          y={100 - s.y * 4.3 - 2.6}
          width="5.8"
          height="5.2"
          rx="1.4"
          fill={`hsl(${192 - s.v * 0.62} 72% ${23 + 0.47 * s.v}%)`}
          key={s.x + "-" + s.y}
        />
      ))}
      <path
        d={`M${posX - 7} ${posY}h14 M${posX} ${posY - 7}v14`}
        stroke="#f5f9ec"
        strokeWidth="1"
      />
      <circle cx={posX} cy={posY} r="5" stroke="#e6f8ef" fill="none" />
      <Text x={281} y={31}>
        實測光功率
      </Text>
      <Text x={281} y={58} color="accent" big>
        {Number(f.metric).toFixed(1)}%
      </Text>
      {Array.from({ length: 16 }, (_, i) => (
        <rect
          x={238 + i * 5.3}
          y={72 - (i / 15) * 9}
          width="3.5"
          height={4 + (i / 15) * 9}
          fill={i / 16 < cur ? accent : "#36494b"}
          key={i}
        />
      ))}
      <Text x={114} y={122} color="white">
        掃描面 · 逐點取樣
      </Text>
      <Text x={281} y={112}>
        暗 → 亮
      </Text>
    </>
  );
}
const art = {
  flight: Flight,
  driving: Driving,
  marine: Marine,
  seismic: Seismic,
  optics: Optics,
  docking: Docking,
  rail: Rail,
  cinema: Cinema,
  camera: Camera,
  balance: Balance,
  machining: Machining,
  vibration: Vibration,
  photonics: Photonics,
} satisfies Record<InstrumentId, (props: ArtProps) => ReactNode>;
export function InstrumentArtwork({ id, value, frame }: Props) {
  const tag = useId().replace(/[^\w-]/g, ""),
    p = "hx-instr-" + tag + "-",
    Art = art[id];
  return (
    <g aria-hidden="true" pointerEvents="none">
      <Definitions p={p} />
      <Art p={p} v={value} f={frame} />
    </g>
  );
}
