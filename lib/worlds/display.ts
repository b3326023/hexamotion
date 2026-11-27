import { DEG } from "../kinematics";
import type { WorldFrame, WorldId } from "./types";

type Channel = readonly [
  label: string,
  unit: string,
  read: (f: WorldFrame) => number,
  decimals: number,
];
type Display = { name: string; label: string; left: Channel; right: Channel };
const roll: Channel = ["台面橫滾", "°", (f) => f.deckRoll / DEG, 1];
const magnitude = (x: number, y: number) => Math.hypot(x, y);
export const worldDisplay: Record<WorldId, Display> = {
  flight: {
    name: "客機飛越山谷",
    label: "FLIGHT",
    left: ["機身坡度", "°", (f) => f.roll / DEG, 1],
    right: roll,
  },
  driving: {
    name: "賽車跑道",
    label: "MOTORSPORT",
    left: ["過彎指令", "°", (f) => f.roll / DEG, 1],
    right: roll,
  },
  marine: {
    name: "海上作業船",
    label: "OFFSHORE",
    left: ["船身傾角", "°", (f) => magnitude(f.baseRoll, f.basePitch) / DEG, 1],
    right: ["台面殘餘傾角", "°", (f) => magnitude(f.deckRoll, f.deckPitch) / DEG, 1],
  },
  seismic: {
    name: "建築地震試驗",
    label: "SEISMIC",
    left: ["台面位移", "mm", (f) => 1000 * magnitude(f.deckX, f.deckY), 2],
    right: ["試體位移", "mm", (f) => 1000 * f.specimen, 2],
  },
  optics: {
    name: "天文台副鏡校準",
    label: "OBSERVATORY",
    left: ["焦面偏心", "mm", (f) => f.metric, 2],
    right: ["台面傾角", "°", (f) => magnitude(f.deckRoll, f.deckPitch) / DEG, 2],
  },
  docking: {
    name: "太空站對接",
    label: "ORBITAL RENDEZVOUS",
    left: ["橫向偏心", "mm", (f) => f.metric, 2],
    right: ["軸向間隙", "mm", (f) => Math.max(0, 25 - f.deckZ * 1000), 1],
  },
  rail: {
    name: "傾斜列車過彎",
    label: "TILTING TRAIN",
    left: ["側向加速度", "m/s²", (f) => f.metric, 2],
    right: ["台面傾角", "°", (f) => f.deckRoll / DEG, 2],
  },
  cinema: {
    name: "動感放映廳",
    label: "MOTION THEATRE",
    left: ["升降指令", "mm", (f) => f.targetZ * 1000, 1],
    right: ["台面升降", "mm", (f) => f.deckZ * 1000, 1],
  },
  camera: {
    name: "攝影棚防震測試",
    label: "STABILIZED CAMERA",
    left: [
      "原始像移",
      "px",
      (f) => 780 * magnitude(Math.tan(f.deckRoll), Math.tan(f.deckPitch)),
      1,
    ],
    right: ["殘餘像移", "px", (f) => f.metric, 1],
  },
  balance: {
    name: "動態平衡測試室",
    label: "POSTUROGRAPHY",
    left: ["擾動指令", "mm", (f) => 1000 * magnitude(f.targetX, f.targetY), 1],
    right: ["支撐面位移", "mm", (f) => f.metric, 1],
  },
  machining: {
    name: "五軸加工中心",
    label: "CNC TOOLPATH",
    left: ["刀路半徑", "mm", (f) => f.radius * 1000, 1],
    right: ["輪廓誤差", "mm", (f) => f.metric, 2],
  },
  vibration: {
    name: "電動激振試驗台",
    label: "VIBRATION LAB",
    left: ["激振頻率", "Hz", (f) => f.frequency, 2],
    right: ["位移放大", "×", (f) => f.metric, 2],
  },
  photonics: {
    name: "光纖耦合工作站",
    label: "SILICON PHOTONICS",
    left: ["光軸偏心", "mm", (f) => magnitude(f.planeX, f.planeY), 2],
    right: ["耦合功率", "%", (f) => f.metric, 1],
  },
};
export function reading(channel: Channel, f: WorldFrame) {
  const n = channel[2](f);
  return (Math.abs(n) < 0.5 * 10 ** -channel[3] ? 0 : n).toFixed(channel[3]) + channel[1];
}
