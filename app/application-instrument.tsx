import { useEffect, useId, useState } from "react";
import type { ApplicationPlane, ApplicationSession } from "../lib/applications";
import { DEG, clamp } from "../lib/kinematics";
import type { Simulation } from "../lib/simulation";
import "./application-instrument.css";

function Attitude({ sim, marine }: { sim: Simulation; marine: boolean }) {
  const clip = useId(),
    bank = sim.pose[3] / DEG,
    pitch = sim.pose[4] / DEG;
  const position = (roll: number, tilt: number) =>
    "translate(60 31) rotate(" + -roll + ") translate(0 " + tilt * 1.8 + ")";
  return (
    <svg viewBox="0 0 120 64" aria-label="載台地平儀">
      <defs>
        <clipPath id={clip}>
          <rect x="5" y="4" width="110" height="54" rx="4" />
        </clipPath>
      </defs>
      <g clipPath={"url(#" + clip + ")"}>
        <g transform={position(bank, pitch)}>
          <rect x="-100" y="0" width="200" height="85" fill="#536965" opacity=".14" />
          <path d="M-90 0h180" stroke="#334b47" strokeWidth="1.4" />
          {[-10, -5, 5, 10].map((i) => (
            <path
              key={i}
              d={
                "M" +
                (Math.abs(i) === 10 ? -14 : -8) +
                " " +
                i * 1.8 +
                "h" +
                (Math.abs(i) === 10 ? 28 : 16)
              }
              stroke="#637570"
              opacity=".75"
            />
          ))}
        </g>
        {marine && (
          <g transform={position(sim.basePose[3] / DEG, sim.basePose[4] / DEG)}>
            <path d="M-85 0h170" stroke="#be5928" strokeWidth="1.5" strokeDasharray="3 3" />
          </g>
        )}
      </g>
      <path
        d="M8 18V7h11m82 0h11v11M8 45v11h11m82 0h11V45"
        fill="none"
        stroke="#7e8884"
        strokeWidth=".8"
      />
      <path
        d="M38 31h14l4 4 4-4 4 4 4-4h14"
        fill="none"
        stroke="#cf521f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="31" r="2" fill="#cf521f" />
    </svg>
  );
}

function Reticle({ plane }: { plane: ApplicationPlane }) {
  const span = plane.span,
    scale = 25 / span,
    x = clamp(plane.x * scale, -42, 42),
    y = clamp(-plane.y * scale, -25, 25);
  const offScale = x !== plane.x * scale || y !== -plane.y * scale;
  return (
    <svg
      viewBox="0 0 120 64"
      aria-label={"測點 X " + plane.x.toFixed(2) + "、Y " + plane.y.toFixed(2) + " " + plane.unit}
    >
      <path d="M14 7h6m-6 0v6m86-6h6v6m-92 39v5h6m80 0h6v-5" fill="none" stroke="#85928e" />
      <g transform="translate(60 32)" fill="none">
        <path d="M-45 0h90M0 -25v50" stroke="#98a4a0" strokeWidth=".85" strokeDasharray="2.2 3" />
        <circle r="12.5" stroke="#9da8a4" strokeWidth=".75" />
        <circle r="25" stroke="#9da8a4" strokeWidth=".75" />
        {plane.radius !== undefined && (
          <circle
            r={plane.radius * scale}
            stroke="#356a61"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        )}
        <path d={"M0 0L" + x + " " + y} stroke="#be5928" strokeWidth="1" opacity=".75" />
        <circle
          cx={x}
          cy={y}
          r="3.6"
          fill={offScale ? "#e2e6e2" : "#d45c2e"}
          stroke="#b64922"
          strokeWidth="1.3"
        />
      </g>
    </svg>
  );
}

type Sample = { time: number; value: number };
function Signal({ sim, apps }: { sim: Simulation; apps: ApplicationSession }) {
  const [samples, setSamples] = useState<Sample[]>([]),
    id = apps.current.id;
  useEffect(() => {
    setSamples([]);
    const take = () =>
      setSamples((prev) => {
        const time = sim.time,
          value = apps.metric.value,
          last = prev.at(-1);
        if (!Number.isFinite(value) || last?.time === time) return prev;
        const keep = last && last.time < time ? prev.filter((s) => s.time >= time - 6) : [];
        return [...keep, { time, value }];
      });
    take();
    const timer = setInterval(take, 95);
    return () => clearInterval(timer);
  }, [sim, apps, id]);
  const factor = id === "vibration";
  const nominal = factor ? 4 : id === "seismic" ? 10 : 30;
  const range = Math.max(nominal, ...samples.map((s) => Math.abs(s.value)));
  const y = (val: number) => (factor ? 54 - (46 * val) / range : 31 - (23 * val) / range);
  const now = samples.at(-1)?.time ?? 0;
  const points = samples
    .map((s) => [(109 + (s.time - now) * 16).toFixed(2), y(s.value).toFixed(2)].join(","))
    .join(" ");
  return (
    <svg viewBox="0 0 120 64" aria-label="最近六個模擬秒的量測變化">
      <path
        d="M12 8v46h98M12 31h98M36 8v46m24-46v46m24-46v46m24-46v46"
        stroke="#a9b0ac"
        fill="none"
        strokeWidth=".65"
      />
      <path d={"M12 " + y(0) + "h98"} stroke="#83908a" strokeWidth=".8" />
      <polyline
        points={points}
        fill="none"
        stroke="#c4552a"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {samples.length > 0 && (
        <circle cx="109" cy={y(samples[samples.length - 1].value)} r="2.3" fill="#b5441b" />
      )}
    </svg>
  );
}

export function ApplicationInstrument({
  sim,
  apps,
}: {
  sim: Simulation;
  apps: ApplicationSession;
}) {
  const id = apps.current.id,
    reading = apps.metric,
    plane = apps.planarReading;
  if (id === "manual") return null;
  const attitude = ["flight", "driving", "marine", "rail"].includes(id);
  const title = attitude ? "地平儀" : plane ? "位置量測" : "響應波形";
  const number = Math.abs(reading.value) < 0.005 ? 0 : reading.value;
  return (
    <aside className="application-instrument" aria-label={title + " · " + reading.label}>
      <div className="instrument-name">{title}</div>
      {attitude ? (
        <Attitude sim={sim} marine={id === "marine"} />
      ) : plane ? (
        <Reticle plane={plane} />
      ) : (
        <Signal sim={sim} apps={apps} />
      )}
      <div className="instrument-value">
        {number.toFixed(Math.abs(number) < 1 ? 2 : 1)} <small>{reading.unit}</small>
      </div>
      <div className="instrument-label">{reading.label}</div>
    </aside>
  );
}
