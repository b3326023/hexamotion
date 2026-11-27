'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { clamp, quaternion } from '@/lib/kinematics';
import { Vector3 } from 'three';
import type { Simulation } from '@/lib/simulation';
export const fmt = (v: number | undefined, n = 2) =>
  Number.isFinite(v) ? v!.toFixed(n) : '—';
export function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: (string | [string, string])[];
  onChange: (s: string) => void;
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
    >
      <SelectTrigger aria-label={label} className="lab-select">
        <SelectValue>
          {options
            .map((o) => (typeof o === 'string' ? [o, o] : o))
            .find((o) => o[0] === value)?.[1] ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="lab-select-menu">
        {options.map((o) => {
          const [v, t] = typeof o === 'string' ? [o, o] : o;
          return (
            <SelectItem key={v} value={v}>
              {t}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function Segments({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(String(v))}>
      <TabsList variant="line" className="lab-tabs">
        {items.map(([v, t]) => (
          <TabsTrigger value={v} key={v}>
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
export function Precision({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  color,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  color?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="axis-control">
      <div>
        <span>
          <i style={{ background: color || '#69d9ca' }} />
          {label}
        </span>
        <div className="precision-value">
          <Input
            type="number"
            aria-label={`${label} 精確數值`}
            min={min}
            max={max}
            step={step}
            value={draft ?? Number(value.toFixed(2))}
            disabled={disabled}
            onFocus={() => setDraft(value.toFixed(2))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (
                draft !== null &&
                draft.trim() !== '' &&
                Number.isFinite(Number(draft))
              )
                onChange(clamp(Number(draft), min, max));
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <small>{unit}</small>
        </div>
      </div>
      <div
        onWheel={(e) => {
          if (document.activeElement === e.target && !disabled)
            onChange(clamp(value - Math.sign(e.deltaY) * step, min, max));
        }}
      >
        <Slider
          value={[clamp(value, min, max)]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          aria-label={label}
        />
      </div>
      <footer>
        <button
          disabled={disabled}
          aria-label={`${label} 減少 ${step}`}
          onClick={() => onChange(clamp(value - step, min, max))}
        >
          − {step}
        </button>
        <span>
          {min} <em>—</em> {max}
        </span>
        <button
          disabled={disabled}
          aria-label={`${label} 增加 ${step}`}
          onClick={() => onChange(clamp(value + step, min, max))}
        >
          + {step}
        </button>
      </footer>
    </div>
  );
}
export function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b>
        {value}
        <small>{unit}</small>
      </b>
    </div>
  );
}
export function Radar({ sim }: { sim: Simulation }) {
  const b = sim.ball,
    r = sim.geometry.topRadius,
    q = quaternion(sim.pose).invert();
  const points = sim.trail
    .slice(-160)
    .map((p) => {
      const local = new Vector3(
        p.x - sim.pose[0],
        p.y - sim.pose[1],
        p.z - sim.pose[2],
      ).applyQuaternion(q);
      return `${100 + (local.x / r) * 73},${100 - (local.y / r) * 73}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 200 200" className="radar" aria-label="球體俯視軌跡">
      <defs>
        <clipPath id="radar-boundary">
          <circle cx="100" cy="100" r="78" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="77" />
      <circle cx="100" cy="100" r="50" />
      <circle cx="100" cy="100" r="25" />
      <path d="M20 100H180M100 20V180" />
      {sim.maze && (
        <g className="radar-maze">
          {sim.maze.walls.map((w, i) => (
            <rect
              key={`w${i}`}
              x={100 + ((w.x - w.w / 2) / r) * 73}
              y={100 - ((w.y + w.d / 2) / r) * 73}
              width={(w.w / r) * 73}
              height={(w.d / r) * 73}
              fill="#6b8293"
              stroke="none"
            />
          ))}
          {sim.maze.holes.map((w, i) => (
            <rect
              key={`h${i}`}
              x={100 + ((w.x - w.w / 2) / r) * 73}
              y={100 - ((w.y + w.d / 2) / r) * 73}
              width={(w.w / r) * 73}
              height={(w.d / r) * 73}
              fill="#20111a"
              stroke="#ff887a"
            />
          ))}
        </g>
      )}
      {sim.auto && sim.ballMotion === 'path' && (
        <polyline
          points={sim.drawnPath.points
            .map((p) => `${100 + (p.x / r) * 73},${100 - (p.y / r) * 73}`)
            .join(' ')}
          fill="none"
          stroke="#c5a6ff"
          strokeWidth="1.5"
        />
      )}
      {sim.playTarget ? (
        <circle
          cx={100 + (sim.playTarget.x / r) * 73}
          cy={100 - (sim.playTarget.y / r) * 73}
          r={(sim.playTarget.radius / r) * 73}
          className="radar-target"
        />
      ) : sim.auto && sim.ballMotion === 'path' ? (
        <circle
          cx={100 + (sim.pathTarget.x / r) * 73}
          cy={100 - (sim.pathTarget.y / r) * 73}
          r="4"
          className="radar-target"
        />
      ) : sim.auto && sim.ballMotion === 'circle' ? (
        <>
          <circle
            cx="100"
            cy="100"
            r={(sim.circleRadius / r) * 73}
            className="radar-circle-reference"
          />
          <circle
            cx={100 + (sim.circleTarget.x / r) * 73}
            cy={100 - (sim.circleTarget.y / r) * 73}
            r="4"
            className="radar-target"
          />
        </>
      ) : (
        <circle cx="100" cy="100" r="4" className="radar-target" />
      )}
      <text x="105" y="17">
        +Y
      </text>
      <text x="179" y="96">
        +X
      </text>
      <g clipPath="url(#radar-boundary)">
        <polyline points={points} className="radar-trail" />
        {sim.trackedBalls
          .filter((b) => !b.lost)
          .map((p) => (
            <circle
              key={p.id}
              cx={100 + (p.x / r) * 73}
              cy={100 - (p.y / r) * 73}
              r="4"
              className="radar-ball"
              opacity={p.airborne ? 0.4 : 1}
            />
          ))}
        {b && (
          <>
            <line
              x1={100 + (b.x / r) * 73}
              y1={100 - (b.y / r) * 73}
              x2={100 + ((b.x + b.vx * 0.5) / r) * 73}
              y2={100 - ((b.y + b.vy * 0.5) / r) * 73}
              className="prediction"
            />
            <circle
              cx={100 + (b.x / r) * 73}
              cy={100 - (b.y / r) * 73}
              r="4"
              className="radar-ball"
            />
          </>
        )}
      </g>
    </svg>
  );
}
export function download(
  name: string,
  data: string,
  type = 'application/json',
) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
