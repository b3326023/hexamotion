'use client';
import {
  Crosshair,
  Plus,
  RotateCcw,
  Trash2,
  ArrowDown,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Choice, Precision, fmt } from './widgets';
import {
  DEFAULT_LAUNCH,
  launchVelocity,
  aimLaunchAtCenter,
  updateLaunch,
  type LaunchSettings,
} from '@/lib/launch';
import { clamp } from '@/lib/kinematics';
import type { Simulation, ObjectKind } from '@/lib/simulation';
export function Launcher({
  sim,
  settings,
  setSettings,
  kind,
  setKind,
  act,
  reset,
}: {
  sim: Simulation | null;
  settings: LaunchSettings;
  setSettings: (s: LaunchSettings) => void;
  kind: ObjectKind;
  setKind: (s: ObjectKind) => void;
  act: (fn: (s: Simulation) => unknown) => void;
  reset: () => void;
}) {
  const r = sim?.geometry.topRadius ?? 0.29,
    velocity = launchVelocity(settings),
    point = { x: 100 + (settings.x / r) * 80, y: 100 - (settings.y / r) * 80 },
    disabled = !sim || sim.replaying;
  const patch = (key: keyof LaunchSettings, value: number) =>
    setSettings(updateLaunch(settings, { [key]: value }));
  return (
    <div className="launch-panel">
      <div className="section-label">
        LAUNCH CONTROL <span>LOCAL XYZ</span>
      </div>
      <p className="launch-hint">點選俯視圖設定釋放位置</p>
      <button
        type="button"
        className="launch-map-button"
        aria-label="投球位置俯視圖，點選或用方向鍵移動"
        onPointerDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect(),
            scale = 200 / box.width;
          const x = (((e.clientX - box.left) * scale - 100) / 80) * r,
            y = ((100 - (e.clientY - box.top) * scale) / 80) * r;
          setSettings(
            updateLaunch(settings, {
              x: clamp(x, -r * 0.95, r * 0.95),
              y: clamp(y, -r * 0.95, r * 0.95),
            }),
          );
        }}
        onKeyDown={(e) => {
          const d = 0.005;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            patch('x', clamp(settings.x - d, -r, r));
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            patch('x', clamp(settings.x + d, -r, r));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            patch('y', clamp(settings.y + d, -r, r));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            patch('y', clamp(settings.y - d, -r, r));
          }
        }}
      >
        <svg viewBox="0 0 200 200" className="launch-map" aria-hidden="true">
          <defs>
            <pattern
              id="launch-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path d="M20 0H0V20" />
            </pattern>
            <marker
              id="launch-arrow"
              viewBox="0 0 6 6"
              refX="4"
              refY="3"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 6 3 0 6z" fill="#d7b986" stroke="none" />
            </marker>
          </defs>
          <rect
            x="10"
            y="10"
            width="180"
            height="180"
            fill="url(#launch-grid)"
            stroke="none"
          />
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const a = ((i * 60 + 30) * Math.PI) / 180;
              return `${100 + 80 * Math.cos(a)},${100 - 80 * Math.sin(a)}`;
            }).join(' ')}
            className="launch-boundary"
          />
          <path d="M100 12V188M12 100H188" strokeDasharray="3 4" />
          <circle cx="100" cy="100" r="3" fill="#598f87" />
          <line
            x1={point.x}
            y1={point.y}
            x2={point.x + velocity.x * 55}
            y2={point.y - velocity.y * 55}
            className="launch-direction"
            markerEnd="url(#launch-arrow)"
          />
          <circle cx={point.x} cy={point.y} r="6" className="launch-point" />
          <path
            d={`M${point.x - 12} ${point.y}h24M${point.x} ${point.y - 12}v24`}
            className="launch-crosshair"
          />
          <text x="106" y="17">
            +Y
          </text>
          <text x="178" y="95">
            +X
          </text>
        </svg>
      </button>
      <div className="launch-xy">
        {(['x', 'y'] as const).map((key) => (
          <label key={key}>
            <span>
              {key.toUpperCase()} <small>mm</small>
            </span>
            <Input
              aria-label={`投球位置 ${key.toUpperCase()}`}
              type="number"
              min={-r * 950}
              max={r * 950}
              step={5}
              value={Number((settings[key] * 1000).toFixed(1))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v))
                  patch(key, clamp(v / 1000, -r * 0.95, r * 0.95));
              }}
            />
          </label>
        ))}
      </div>
      <div className="launch-presets">
        <Button
          className="secondary"
          onClick={() =>
            setSettings({ ...DEFAULT_LAUNCH, x: 0, y: 0, speed: 0 })
          }
        >
          <Crosshair size={13} />
          中心
        </Button>
        <Button
          className="secondary"
          onClick={() =>
            setSettings({ ...DEFAULT_LAUNCH, x: 0.13, y: -0.07, speed: 0 })
          }
        >
          <ArrowDown size={13} />
          邊緣落球
        </Button>
        <Button
          className={`secondary ${settings.aimAtCenter ? 'aim-active' : ''}`}
          aria-pressed={!!settings.aimAtCenter}
          onClick={() => setSettings(aimLaunchAtCenter(settings))}
        >
          <Send size={13} />
          拋向中心
        </Button>
      </div>
      {settings.aimAtCenter && (
        <p className="launch-hint">
          已鎖定中心方向；修改 X / Y 會更新方位角。手動調整方位角可解除。
        </p>
      )}
      <Precision
        label="RELEASE HEIGHT"
        value={settings.height * 1000}
        min={40}
        max={600}
        step={10}
        unit="mm"
        onChange={(v) => patch('height', v / 1000)}
      />
      <Precision
        label="DIRECTION / 方位角"
        value={settings.azimuth}
        min={-180}
        max={180}
        step={5}
        unit="°"
        onChange={(v) => patch('azimuth', v)}
      />
      <Precision
        label="ELEVATION / 仰角"
        value={settings.elevation}
        min={-80}
        max={80}
        step={5}
        unit="°"
        onChange={(v) => patch('elevation', v)}
      />
      <Precision
        label="POWER / 初速度"
        value={settings.speed}
        min={0}
        max={1.5}
        step={0.05}
        unit="m/s"
        onChange={(v) => patch('speed', v)}
      />
      <Choice
        value={kind}
        label="投放物體"
        options={[
          ['ball', '乒乓球 · 40 mm / 2.7 g'],
          ['steel', '鋼球 · 260 g'],
          ['cube', '木塊 · 120 g'],
          ['cylinder', '圓柱 · 350 g'],
          ['weight', '重物 · 10 kg'],
        ]}
        onChange={(v) => setKind(v as ObjectKind)}
      />
      <div className="launch-velocity">
        <span>V₀ [X, Y, Z]</span>
        <b>
          {fmt(velocity.x, 2)}, {fmt(velocity.y, 2)}, {fmt(velocity.z, 2)}{' '}
          <small>m/s</small>
        </b>
      </div>
      <Button
        className="wide"
        disabled={disabled || (sim?.objects.length ?? 0) >= 12}
        onClick={() => act((s) => s.launch(settings, kind))}
      >
        <Plus />
        投放 / 拋出<span>{sim?.objects.length ?? 0} / 12</span>
      </Button>
      <div className="button-pair">
        <Button
          className="secondary"
          disabled={!sim?.objects.length || sim.replaying}
          onClick={() => act((s) => s.clearObjects())}
        >
          <Trash2 size={14} />
          清空球體
        </Button>
        <Button className="secondary" onClick={reset}>
          <RotateCcw size={14} />
          重設歸零
        </Button>
      </div>
      <p className="panel-copy">
        方位角 0° 沿平台 +X；正仰角向上。力道以初速度表示，0 m/s
        為自由落下。虛線預覽為目前姿態下的自由飛行路徑，碰撞後由物理引擎決定。
      </p>
    </div>
  );
}
