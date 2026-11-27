'use client';
import {
  SlidersHorizontal,
  PanelLeftClose,
  Activity,
  PanelRightClose,
  RotateCcw,
  ShieldCheck,
  Crosshair,
  Waves,
  Orbit,
  Rotate3d,
  Settings2,
  Plus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Choice,
  Segments,
  Precision,
  Toggle,
  Metric,
  Radar,
  fmt,
} from './widgets';
import { DEG, HOME, type Pose } from '@/lib/kinematics';
import type { Simulation, ObjectKind, Profile } from '@/lib/simulation';
import type { ControllerKind } from '@/lib/controllers';
const AXES = ['X / SURGE', 'Y / SWAY', 'Z / HEAVE', 'ROLL', 'PITCH', 'YAW'],
  COLORS = ['#ce807a', '#90b08b', '#73a4cf'];
export type PanelProps = {
  sim: Simulation | null;
  act: (fn: (s: Simulation) => unknown) => void;
  open: (s: string) => void;
  collapse: () => void;
};
export function Controls({
  sim,
  act,
  open,
  collapse,
  mode,
  setMode,
  manipulator,
  setManipulator,
  launchPanel,
}: {
  launchPanel: ReactNode;
  mode: string;
  setMode: (s: string) => void;
  manipulator: string;
  setManipulator: (s: string) => void;
} & PanelProps) {
  const target = sim?.target ?? HOME,
    disabled = !sim || sim.estop || sim.replaying;
  const poseValue = (i: number) =>
    i < 3 ? (target[i] - (i === 2 ? 0.48 : 0)) * 1000 : target[i] / DEG;
  const update = (i: number, v: number) =>
    act((s) => {
      const p = [...s.target] as Pose;
      p[i] = i < 3 ? v / 1000 + (i === 2 ? 0.48 : 0) : v * DEG;
      s.setPose(p);
    });
  return (
    <>
      <div className="panel-heading">
        <SlidersHorizontal size={15} /> MOTION CONTROL
        <button title="收合控制面板" onClick={collapse}>
          <PanelLeftClose size={15} />
        </button>
      </div>
      <Segments
        value={mode}
        onChange={setMode}
        items={[
          ['pose', '姿態'],
          ['actuators', '致動器'],
          ['tasks', '自動'],
          ['launch', '投球'],
        ]}
      />
      {mode === 'launch' ? (
        launchPanel
      ) : mode === 'pose' ? (
        <>
          <div className="section-label">
            TRANSLATION <span>mm</span>
          </div>
          {AXES.slice(0, 3).map((a, i) => (
            <Precision
              key={a}
              label={a}
              value={poseValue(i)}
              min={i === 2 ? -80 : -65}
              max={i === 2 ? 100 : 65}
              unit="mm"
              color={COLORS[i]}
              disabled={disabled}
              onChange={(v) => update(i, v)}
            />
          ))}
          <div className="section-label">
            ROTATION <span>deg</span>
          </div>
          {AXES.slice(3).map((a, j) => (
            <Precision
              key={a}
              label={a}
              value={poseValue(j + 3)}
              min={-12}
              max={12}
              unit="°"
              color={COLORS[j]}
              disabled={disabled}
              onChange={(v) => update(j + 3, v)}
            />
          ))}
          <Button
            className="wide secondary"
            disabled={disabled}
            onClick={() => act((s) => s.home())}
          >
            <RotateCcw /> 回到原點 <span>H</span>
          </Button>
          <div className="section-label">MOTION PROFILE</div>
          <Choice
            value={sim?.profile ?? 'S-Curve'}
            label="運動曲線"
            options={['S-Curve', 'Minimum Jerk', 'Trapezoid', 'Linear', 'Step']}
            onChange={(v) => act((s) => (s.profile = v as Profile))}
          />
          <div className="section-label">3D MANIPULATOR</div>
          <Choice
            value={manipulator}
            label="3D 操縱器"
            options={[
              ['off', '關閉'],
              ['translate', 'XYZ 平移'],
              ['rotate', '三軸旋轉'],
            ]}
            onChange={setManipulator}
          />
        </>
      ) : mode === 'actuators' ? (
        <>
          <div className="section-label">
            LEVEL 0 <span>DIRECT LEG CONTROL</span>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <Precision
              key={i}
              label={`ACTUATOR ${i + 1}`}
              value={(sim?.actuators[i]?.target ?? 0.4769) * 1000}
              min={(sim?.geometry.minLength ?? 0.38) * 1000}
              max={(sim?.geometry.maxLength ?? 0.68) * 1000}
              unit="mm"
              disabled={disabled || sim?.actuators[i]?.failed}
              onChange={(v) => act((s) => s.setActuator(i, v / 1000))}
            />
          ))}
          <Button
            className="wide secondary"
            onClick={() => act((s) => s.home())}
          >
            <RotateCcw /> 六軸回原點
          </Button>
          <p className="panel-copy">
            調整單腿時，正運動學會求解平台姿態。無效的行程組合會被拒絕。
          </p>
        </>
      ) : (
        <>
          <div className="section-label">
            TASK CONTROL <span>LEVEL 3–5</span>
          </div>
          <div className="task-grid">
            <Button
              disabled={disabled}
              aria-pressed={sim?.activeTask === 'level'}
              onClick={() => act((s) => s.setTask('level'))}
            >
              <ShieldCheck />
              <b>AUTO LEVEL</b>
              <small>自動水平</small>
            </Button>
            <Button
              disabled={disabled}
              aria-pressed={sim?.activeTask === 'center'}
              onClick={() => act((s) => s.setAuto(s.activeTask !== 'center'))}
            >
              <Crosshair />
              <b>CENTER BALL</b>
              <small>閉迴路置中</small>
            </Button>
            <Button
              disabled={disabled}
              aria-pressed={sim?.activeTask === 'sea'}
              onClick={() => act((s) => s.setTask('sea'))}
            >
              <Waves />
              <b>SEA COMP.</b>
              <small>海浪補償</small>
            </Button>
            <Button
              disabled={disabled}
              aria-pressed={sim?.activeTask === 'tracking'}
              onClick={() => act((s) => s.setTask('tracking'))}
            >
              <Orbit />
              <b>TRAJECTORY</b>
              <small>六維路徑</small>
            </Button>
            <Button
              className="circle-task"
              disabled={disabled}
              aria-pressed={sim?.activeTask === 'circle'}
              onClick={() => act((s) => s.setCircle(s.activeTask !== 'circle'))}
            >
              <Orbit />
              <b>CIRCLE BALL</b>
              <small>球體圓周追蹤</small>
            </Button>
          </div>
          <p className="task-status" role="note">
            {sim?.activeTask
              ? `啟用中：${{ center: '球體置中',
                      path: '手繪路徑', circle: '球體圓周', level: '自動水平', sea: '海浪補償', tracking: '六維路徑' }[sim.activeTask]}${sim.auto && !sim.ball ? ' · 等待投球' : ''}`
              : '目前為手動控制'}{' '}
            · 再按一次可停止
          </p>
          <div className="section-label">
            BALL CIRCLE <span>LOCAL XY</span>
          </div>
          <Precision
            label="圓周半徑"
            value={(sim?.circleRadius ?? 0.08) * 1000}
            min={20}
            max={Math.floor(
              Math.min(
                0.18,
                (sim?.geometry.topRadius ?? 0.29) * 0.866 - 0.045,
              ) * 1000,
            )}
            step={5}
            unit="mm"
            disabled={disabled}
            onChange={(v) =>
              act((s) => s.configureCircle({ radius: v / 1000 }))
            }
          />
          <Precision
            label="圓周速度"
            value={(sim?.circleSpeed ?? 0.08) * 1000}
            min={10}
            max={180}
            step={5}
            unit="mm/s"
            disabled={disabled}
            onChange={(v) => act((s) => s.configureCircle({ speed: v / 1000 }))}
          />
          <Choice
            label="圓周方向"
            value={String(sim?.circleDirection ?? 1)}
            options={[
              ['1', '逆時針'],
              ['-1', '順時針'],
            ]}
            onChange={(v) =>
              act((s) => s.configureCircle({ direction: Number(v) as 1 | -1 }))
            }
          />
          <p className="circle-summary">
            實際設定 {fmt((sim?.circleEffectiveSpeed ?? 0.08) * 1000, 1)} mm/s ·
            週期{' '}
            {fmt(
              (2 * Math.PI * (sim?.circleRadius ?? 0.08)) /
                (sim?.circleEffectiveSpeed ?? 0.08),
              1,
            )}{' '}
            s
            {sim && sim.circleEffectiveSpeed < sim.circleSpeed - 1e-8 && (
              <span>小半徑已限速，確保平台能跟上路徑。</span>
            )}
          </p>
          <p className="panel-copy">
            先投放一顆球，再啟用 CIRCLE
            BALL。平台會先接入圓周，再逐漸加速；修改參數會平滑接入新路徑。啟用功能不會自動投球。
          </p>
          <div className="section-label">VECTOR CONTROL</div>
          <div className="vector-jog">
            {[
              [0, 10, 'X+'],
              [0, -10, 'X−'],
              [1, 10, 'Y+'],
              [1, -10, 'Y−'],
              [2, 10, 'Z+'],
              [2, -10, 'Z−'],
            ].map(([i, v, l]) => (
              <Button
                key={String(l)}
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  update(Number(i), poseValue(Number(i)) + Number(v))
                }
              >
                {l}
              </Button>
            ))}
          </div>
          <p className="panel-copy">每次沿世界座標移動 10 mm。</p>
          <div className="section-label">DISTURBANCE</div>
          <Button
            className="wide secondary"
            onClick={() => act((s) => s.impulse())}
          >
            <Activity /> 施加線衝量 <span>1.2 N·s</span>
          </Button>
          <Button
            className="wide secondary mt-2"
            onClick={() => act((s) => s.impulse('torque'))}
          >
            <Rotate3d /> 施加角衝量
          </Button>
          <Toggle
            label="連續擾動 / TURBULENCE"
            value={sim?.turbulence ?? false}
            onChange={(v) => act((s) => (s.turbulence = v))}
          />
          <div className="section-label">CONTROLLER</div>
          <Choice
            value={sim?.control.kind ?? 'PID'}
            label="控制器"
            options={['PID', 'Cascaded PID', 'LQR', 'MPC', 'Adaptive']}
            onChange={(v) =>
              act((s) => {
                s.control.kind = v as ControllerKind;
                s.controller.reset();
              })
            }
          />
          <Button
            className="wide secondary mt-2"
            onClick={() => open('controller')}
          >
            <Settings2 /> 控制參數與比較
          </Button>
        </>
      )}
      <div className="control-note">
        <i /> IK → SERVO → PHYSICS<span>模型狀態由控制與物理系統共同決定</span>
      </div>
    </>
  );
}
export function Telemetry({
  sim,
  act,
  open,
  collapse,
  inspect,
  setInspect,
  selected,
  setSelected,
  objectKind,
  setObjectKind,
}: {
  inspect: string;
  setInspect: (s: string) => void;
  selected: number;
  setSelected: (n: number) => void;
  objectKind: ObjectKind;
  setObjectKind: (s: ObjectKind) => void;
} & PanelProps) {
  const view = sim?.view(),
    pose = view?.pose ?? HOME,
    a = view?.actuators ?? [],
    ball = sim?.ball;
  return (
    <>
      <div className="panel-heading">
        <Activity size={15} /> LIVE TELEMETRY
        <button title="收合遙測面板" onClick={collapse}>
          <PanelRightClose size={15} />
        </button>
      </div>
      <Segments
        value={inspect}
        onChange={setInspect}
        items={[
          ['overview', '總覽'],
          ['physics', '物理'],
          ['inspector', '檢視器'],
        ]}
      />
      {inspect === 'overview' ? (
        <>
          {ball && !sim?.replaying ? (
            <>
              <div className="section-label">
                BALL TRACKING{' '}
                <span className={ball.lost ? 'amber' : 'cyan'}>
                  {ball.lost
                    ? 'LOST'
                    : sim?.settled
                      ? 'LOCKED'
                      : sim?.auto
                        ? sim.ballMotion === 'circle'
                          ? 'CIRCLE TRACK'
                          : 'CLOSED LOOP'
                        : 'MANUAL'}
                </span>
              </div>
              <div className="tracking-mode">
                <Choice
                  value={sim?.ballControlMode ?? 'latest'}
                  label="多球追蹤模式"
                  options={
                    sim?.auto && sim.ballMotion === 'circle'
                      ? [
                          ['latest', '追蹤最新球'],
                          ['selected', '指定球體'],
                        ]
                      : [
                          ['latest', '追蹤最新球'],
                          ['group', '球群中心'],
                          ['selected', '指定球體'],
                        ]
                  }
                  onChange={(v) =>
                    act((s) => {
                      s.ballControlMode = v as 'latest' | 'group' | 'selected';
                      s.controller.reset();
                      s.sensorQueue = [];
                      s.measure();
                    })
                  }
                />
                {sim?.ballControlMode === 'selected' && (
                  <Choice
                    value={String(sim.focusBallId ?? ball.targetId ?? 0)}
                    label="指定追蹤球體"
                    options={sim.trackedBalls
                      .filter((b) => !b.lost)
                      .map(
                        (b) =>
                          [String(b.id), `BALL #${b.id}`] as [string, string],
                      )}
                    onChange={(v) =>
                      act((s) => {
                        s.focusBallId = Number(v);
                        s.measure();
                      })
                    }
                  />
                )}
                <span>
                  {sim?.ballControlMode === 'group'
                    ? `GROUP · ${ball.controlledCount} BALLS`
                    : `TRACKING BALL #${ball.targetId}`}
                </span>
              </div>
              <div className="ball-error">
                <span>
                  {sim?.auto && sim.ballMotion === 'circle'
                    ? 'PATH ERROR'
                    : ball.controlledCount > 1
                      ? 'GROUP CENTER'
                      : 'CENTER ERROR'}
                </span>
                <b>
                  {fmt(ball.error * 1000, 2)}
                  <small>mm</small>
                </b>
              </div>
              {sim && <Radar sim={sim} />}
              {sim?.auto && sim.ballMotion === 'circle' && (
                <p className="circle-summary">
                  {
                    {
                      waiting: '等待接觸',
                      capture: '接入圓周',
                      ramp: '逐漸加速',
                      orbit: '圓周追蹤',
                    }[sim.circleTarget.phase]
                  }{' '}
                  · 實際半徑 {fmt(Math.hypot(ball.x, ball.y) * 1000, 1)} mm ·
                  球速 {fmt(ball.speed * 1000, 1)} mm/s
                </p>
              )}
              <div className="pose-grid ball-stats">
                <Metric label="X" value={fmt(ball.x * 1000, 1)} unit="mm" />
                <Metric label="Y" value={fmt(ball.y * 1000, 1)} unit="mm" />
                <Metric label="VX" value={fmt(ball.vx, 3)} unit="m/s" />
                <Metric label="VY" value={fmt(ball.vy, 3)} unit="m/s" />
              </div>
              <div className="ball-counts">
                <span>
                  平台上 <b>{ball.activeCount}</b>
                </span>
                <span>
                  飛行中 <b>{ball.airborneCount}</b>
                </span>
                <span>
                  已掉落 <b>{ball.lostCount}</b>
                </span>
              </div>
              {ball.controlledCount > 1 && (
                <p className="multi-note">
                  球群 RMS 半徑 {fmt(ball.rmsRadius * 1000, 1)} mm ·
                  控制群體中心，球體不會互相重疊。
                </p>
              )}
              <div className="recovery-row">
                <span>{ball.envelope}</span>
                <span>
                  SETTLE {sim?.settled ? `${fmt(sim.settled)} s` : '—'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="section-label">
                PLATFORM POSE <span>ACTUAL</span>
              </div>
              <div className="pose-grid">
                {['X', 'Y', 'Z', 'ROLL', 'PITCH', 'YAW'].map((l, i) => (
                  <Metric
                    key={l}
                    label={l}
                    value={fmt(
                      i < 3
                        ? (pose[i] - (i === 2 ? 0.48 : 0)) * 1000
                        : pose[i] / DEG,
                    )}
                    unit={i < 3 ? 'mm' : '°'}
                  />
                ))}
              </div>
            </>
          )}
          <div className="section-label">
            ACTUATOR STATUS{' '}
            <span className="cyan">
              {a.filter((a) => !a.failed).length} ONLINE
            </span>
          </div>
          <div className="act-table">
            <div className="act-table-head">
              <span>ID</span>
              <span>LENGTH</span>
              <span>LOAD</span>
            </div>
            {a.map((a, i) => (
              <button
                className={`act-row ${selected === i ? 'selected' : ''}`}
                key={i}
                onClick={() => {
                  setSelected(i);
                  setInspect('inspector');
                }}
              >
                <span>
                  <i style={{ background: a.failed ? '#ec7777' : undefined }} />{' '}
                  A{i + 1}
                </span>
                <b>
                  {fmt(a.length * 1000)} <small>mm</small>
                </b>
                <div
                  className="mini-bar"
                  title={`${fmt((Math.abs(a.force) / (sim?.geometry.maxForce ?? 1800)) * 100, 1)} %`}
                >
                  <i
                    style={{
                      width: `${Math.min(100, (Math.abs(a.force) / (sim?.geometry.maxForce ?? 1800)) * 100)}%`,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
          <div className="section-label">WORKSPACE HEALTH</div>
          <div className="health">
            <span>
              行程裕度 <b>{fmt(sim?.strokeMargin, 1)} %</b>
            </span>
            <div>
              <i style={{ width: `${sim?.strokeMargin ?? 0}%` }} />
            </div>
            <span title="以平台半徑正規化的 Jacobian ∞-norm condition number">
              JACOBIAN κ∞ <b>{fmt(sim?.condition)}</b>
            </span>
            <p>
              <i />
              {sim?.status === 'NOMINAL' ? '機構位於工作範圍內' : sim?.status}
            </p>
          </div>
          <div className="next-experiment">
            <Crosshair size={17} />
            <span>
              從姿態控制開始<small>調整 Pitch，或投球後啟動自動置中。</small>
            </span>
          </div>
        </>
      ) : inspect === 'physics' ? (
        <>
          <div className="section-label">PHYSICS MODEL</div>
          <Choice
            value={sim?.dynamic ? 'dynamic' : 'realtime'}
            label="物理模式"
            options={[
              ['dynamic', '全動力學 · 18 組關節'],
              ['realtime', 'Realtime · 運動學平台'],
            ]}
            onChange={(v) =>
              act((s) => {
                s.dynamic = v === 'dynamic';
                s.initialize();
                s.log('物理模式已切換，模擬已重設');
              })
            }
          />
          <p className="panel-copy">
            {sim?.dynamic
              ? '拖動任一支腿，推力會經活塞、缸套與兩端球接頭傳到上平台。投球或加入配重可觀察六腿受力的變化。'
              : '以致動器動態與 FK 驅動平台；球體使用剛體碰撞。接觸不會反推平台，負載力為估算。'}
          </p>
          <div className="section-label">SURFACE</div>
          <Choice
            value={String(sim?.friction ?? 0.7)}
            label="平台表面"
            options={[
              ['0.7', 'Rubber / 橡膠'],
              ['0.38', 'Aluminum / 鋁'],
              ['0.22', 'Carbon / 碳纖維'],
              ['0.08', 'Glass / 玻璃'],
              ['0.01', 'Ice / 冰'],
            ]}
            onChange={(v) => act((s) => s.setSurface(Number(v), s.restitution))}
          />
          <Precision
            label="RESTITUTION"
            value={sim?.restitution ?? 0.45}
            min={0}
            max={1}
            step={0.01}
            unit=""
            onChange={(v) => act((s) => s.setSurface(s.friction, v))}
          />
          <div className="section-label">RIGID BODY SANDBOX</div>
          <Choice
            value={objectKind}
            label="物件類型"
            options={[
              ['ball', 'Ping-pong ball · 2.7 g'],
              ['steel', 'Steel ball · 260 g'],
              ['cube', 'Wood cube · 120 g'],
              ['cylinder', 'Cylinder · 350 g'],
              ['weight', 'Weight · 10 kg'],
            ]}
            onChange={(v) => setObjectKind(v as ObjectKind)}
          />
          <div className="button-pair">
            <Button
              className="secondary"
              onClick={() =>
                act((s) =>
                  s.spawn(
                    objectKind,
                    -0.08 + s.random() * 0.16,
                    -0.07 + s.random() * 0.14,
                  ),
                )
              }
            >
              <Plus />
              加入
            </Button>
            <Button
              className="secondary"
              onClick={() => act((s) => s.clearObjects())}
            >
              清空
            </Button>
          </div>
          <Precision
            label="PAYLOAD"
            value={sim?.geometry.payload ?? 0}
            min={0}
            max={300}
            step={10}
            unit="kg"
            onChange={(v) => act((s) => s.setPayload(v))}
          />
          <Precision
            label="PAYLOAD OFFSET X"
            value={(sim?.payloadOffset ?? 0) * 1000}
            min={-150}
            max={150}
            step={5}
            unit="mm"
            onChange={(v) => act((s) => s.setPayload(s.geometry.payload, v / 1000))}
          />
          <div className="section-label">DIAGNOSTICS</div>
          <div className="data-list">
            <span>
              Fixed step <b>4.167 ms</b>
            </span>
            <span>
              Rigid bodies <b>{(sim?.objects.length ?? 0) + 2}</b>
            </span>
            <span>
              Solver iterations <b>12</b>
            </span>
            <span>
              Servo work <b>{fmt(sim?.energy, 1)} J</b>
            </span>
            <span>
              Ball spin <b>{fmt(ball?.spin, 1)} rad/s</b>
            </span>
          </div>
          <Button
            className="wide secondary mt-3"
            onClick={() => open('geometry')}
          >
            <Settings2 /> 幾何與機械限制
          </Button>
        </>
      ) : (
        <>
          <div className="section-label">ACTUATOR INSPECTOR</div>
          <Choice
            value={String(selected)}
            label="選擇致動器"
            options={Array.from(
              { length: 6 },
              (_, i) => [String(i), `ACTUATOR 0${i + 1}`] as [string, string],
            )}
            onChange={(v) => setSelected(Number(v))}
          />
          {a[selected] && (
            <div className="inspector-readout">
              <div className="section-label">MEASURED / SI MODEL</div>
              {[
                ['Length', a[selected].length * 1000, 'mm'],
                ['Target', a[selected].target * 1000, 'mm'],
                [
                  'Position error',
                  (a[selected].target - a[selected].length) * 1000,
                  'mm',
                ],
                ['Velocity', a[selected].velocity * 1000, 'mm/s'],
                ['Acceleration', a[selected].acceleration * 1000, 'mm/s²'],
                ['Force', a[selected].force, 'N'],
                ['Current estimate', a[selected].current, 'A'],
                ['Mechanical power', a[selected].power, 'W'],
                ['Temperature estimate', a[selected].temperature, '°C'],
                ['Travel', a[selected].travel * 1000, 'mm'],
              ].map(([l, v, u]) => (
                <div key={String(l)}>
                  <span>{l}</span>
                  <b>
                    {fmt(Number(v))}
                    <small>{u}</small>
                  </b>
                </div>
              ))}
            </div>
          )}
          <Toggle
            label="致動器失效注入"
            value={a[selected]?.failed ?? false}
            onChange={(v) =>
              act((s) => {
                s.actuators[selected].failed = v;
                s.log(
                  v
                    ? `A${selected + 1} 故障注入：失去驅动力`
                    : `A${selected + 1} 已恢復`,
                );
              })
            }
          />
          <p className="panel-copy">
            失效腿的軸向力設為零，平台可能失穩。電流與溫度為馬達模型估算。
          </p>
          <div className="section-label">SENSOR SIMULATION</div>
          <Precision
            label="NOISE"
            value={sim?.control.noise ?? 0}
            min={0}
            max={8}
            step={0.1}
            unit="mm"
            onChange={(v) => act((s) => (s.control.noise = v))}
          />
          <Precision
            label="DELAY"
            value={sim?.control.delay ?? 0}
            min={0}
            max={300}
            step={10}
            unit="ms"
            onChange={(v) => act((s) => (s.control.delay = v))}
          />
          <Precision
            label="DROPOUT"
            value={(sim?.control.dropout ?? 0) * 100}
            min={0}
            max={80}
            step={5}
            unit="%"
            onChange={(v) => act((s) => (s.control.dropout = v / 100))}
          />
        </>
      )}
    </>
  );
}
