'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Settings2,
  FlaskConical,
  Plus,
  Play,
  Square,
  Save,
  Download,
  Upload,
  RotateCcw,
  Activity,
  CircleDot,
  ChevronRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { Simulation, SCENARIOS } from '@/lib/simulation';
import { DEFAULT_GEOMETRY, DEG, clamp, type Geometry } from '@/lib/kinematics';
import type { ControllerKind } from '@/lib/controllers';
import { Choice, Precision, Metric, Segments, download, fmt } from './widgets';
type Result = {
  kind: string;
  settled: number | null;
  error: number;
  rms: number;
  max: number;
  tilt: number;
  energy: number;
  lost: boolean | undefined;
};
export function LabDialogs({
  dialog,
  close,
  sim,
  refresh,
}: {
  dialog: string;
  close: () => void;
  sim: Simulation | null;
  refresh: () => void;
}) {
  const [settings, setSettings] = useState<Geometry>({ ...DEFAULT_GEOMETRY }),
    [compare, setCompare] = useState<Result[]>([]),
    [comparing, setComparing] = useState(false),
    [tab, setTab] = useState('scenarios'),
    [script, setScript] = useState(
      'pose pitch 5deg\nwait 1500\nhome\nwait 1500\nball.spawn\ncenter on',
    ),
    [scripting, setScripting] = useState(false),
    [frequency, setFrequency] = useState<
      { f: number; gain: number; phase: number }[]
    >([]),
    [sweeping, setSweeping] = useState(false),
    [localMessage, setLocalMessage] = useState('');
  const scriptAbort = useRef(false),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Copy the current external physics model only when opening its editor.
    // eslint-disable-next-line react/react-compiler
    if (dialog === 'geometry' && sim) setSettings({ ...sim.geometry });
  }, [dialog, sim]);
  const act = (fn: (s: Simulation) => unknown) => {
    if (sim) {
      fn(sim);
      refresh();
    }
  };
  const runComparison = async () => {
    if (!sim || comparing) return;
    setComparing(true);
    setCompare([]);
    const rows: Result[] = [];
    try {
      for (const kind of ['PID', 'LQR', 'MPC'] as ControllerKind[]) {
        const test = await Simulation.create();
        try {
          test.geometry = { ...sim.geometry };
          test.dynamic = sim.dynamic;
          test.friction = sim.friction;
          test.restitution = sim.restitution;
          test.control = { ...sim.control, kind };
          test.initialize();
          test.spawn('ball', 0.1, -0.065, 0.08, 0.025, 0.015);
          test.setAuto(true);
          for (let i = 0; i < 240 * 14; i++) {
            test.tick();
            if (test.paused) break;
            if (i % 240 === 0) await new Promise((r) => setTimeout(r, 0));
          }
          rows.push({
            kind,
            settled: test.settled,
            error: test.ball?.error ?? 0,
            rms: Math.sqrt(test.rmsSum / Math.max(1, test.rmsCount)),
            max: test.maxError,
            tilt: test.peakTilt / DEG,
            energy: test.energy,
            lost: test.ball?.lost,
          });
          setCompare([...rows]);
        } finally {
          test.dispose();
        }
      }
    } catch (e) {
      setLocalMessage(`比較失敗：${String(e)}`);
    } finally {
      setComparing(false);
    }
  };
  const runSweep = async () => {
    if (!sim || sweeping) return;
    setSweeping(true);
    setFrequency([]);
    const out = [];
    try {
      for (const f of [0.1, 0.2, 0.4, 0.7, 1, 1.5, 2]) {
        const test = await Simulation.create();
        try {
          test.geometry = { ...sim.geometry };
          test.dynamic = sim.dynamic;
          test.initialize();
          let ss = 0,
            cc = 0,
            n = 0;
          const duration = Math.max(8, 3 / f);
          for (let i = 0; i < 240 * duration; i++) {
            const t = i / 240;
            test.target = [
              0,
              0,
              0.48,
              0,
              2 * DEG * Math.sin(2 * Math.PI * f * t),
              0,
            ];
            test.tick();
            if (t > duration - 1 / f) {
              ss += test.pose[4] * Math.sin(2 * Math.PI * f * t);
              cc += test.pose[4] * Math.cos(2 * Math.PI * f * t);
              n++;
            }
            if (i % 480 === 0) await new Promise((r) => setTimeout(r, 0));
          }
          out.push({
            f,
            gain:
              20 *
              Math.log10(
                Math.max(1e-9, (2 * Math.hypot(ss, cc)) / n / (2 * DEG)),
              ),
            phase: Math.atan2(cc, ss) / DEG,
          });
          setFrequency([...out]);
        } finally {
          test.dispose();
        }
      }
    } catch (e) {
      setLocalMessage(`掃頻失敗：${String(e)}`);
    } finally {
      setSweeping(false);
    }
  };
  const runScript = async () => {
    if (!sim || scripting) return;
    scriptAbort.current = false;
    setScripting(true);
    for (const line of script.split('\n').slice(0, 100)) {
      if (scriptAbort.current) break;
      const m = line.trim().match(/^wait (\d+)$/);
      if (m) {
        let elapsed = 0;
        const ms = clamp(Number(m[1]), 0, 10000);
        while (elapsed < ms && !scriptAbort.current) {
          await new Promise((r) => setTimeout(r, 100));
          elapsed += 100;
        }
      } else if (line.trim() && !sim.command(line)) break;
    }
    setScripting(false);
    refresh();
  };
  const exportJSON = () =>
    sim &&
    download(
      'StewartLab-experiment.json',
      JSON.stringify(sim.exportExperiment()),
    );
  return (
    <>
      <Dialog open={!!dialog} onOpenChange={(v) => !v && close()}>
        <DialogContent
          className={`lab-dialog ${dialog === 'experiments' ? 'wide-dialog' : ''}`}
        >
          <DialogTitle>
            {dialog === 'controller'
              ? 'Controller Lab / 控制工程'
              : dialog === 'geometry'
                ? 'Mechanics / 幾何與限制'
                : dialog === 'experiments'
                  ? 'Experiments / 實驗工作台'
                  : 'Stewart Lab / 操作指南'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'controller'
              ? '調整回授參數，觀察控制器的響應與限制。'
              : dialog === 'geometry'
                ? '修改幾何會同步更新模型與解算，並將模擬重設至原點。'
                : dialog === 'experiments'
                  ? '選擇場景、設計路徑，或保存與比較實驗結果。'
                  : '從姿態控制到自主平衡，所有動作都經過致動器與物理模擬。'}
          </DialogDescription>
          <div className="dialog-scroll">
            {dialog === 'controller' && sim && (
              <div className="controller-layout">
                <section>
                  <div className="section-label">ALGORITHM</div>
                  <Choice
                    label="演算法"
                    value={sim.control.kind}
                    options={['PID', 'Cascaded PID', 'LQR', 'MPC', 'Adaptive']}
                    onChange={(v) =>
                      act((s) => {
                        s.control.kind = v as ControllerKind;
                        s.controller.reset();
                      })
                    }
                  />
                  <p className="panel-copy">
                    {sim.control.kind === 'PID'
                      ? '位置、速度與積分回授產生平台傾角；輸出飽和時停止累積積分。'
                      : sim.control.kind === 'LQR'
                        ? '求解離散 Riccati 方程式。滾動球雙積分模型，Q = diag(1, 0.7)，R = 3。'
                        : sim.control.kind === 'MPC'
                          ? '有限時間域滾動預測，以投影梯度解法限制傾角，再輸出第一步命令。'
                          : sim.control.kind === 'Adaptive'
                            ? '依位置誤差調整比例增益（0.75–1.3×）；此為啟發式增益調整。'
                            : '位置外迴路產生速度目標，再由速度內迴路控制傾角。'}
                  </p>
                  {['PID', 'Cascaded PID', 'Adaptive'].includes(
                    sim.control.kind,
                  ) ? (
                    <>
                      {(
                        [
                          ['kp', 'Kp', 3, 0.05],
                          ['ki', 'Ki', 0.5, 0.005],
                          ['kd', 'Kd', 2, 0.025],
                        ] as const
                      ).map(([key, label, max, step]) => (
                        <Precision
                          key={key}
                          label={label}
                          min={0}
                          max={max}
                          step={step}
                          unit=""
                          value={sim.control[key]}
                          onChange={(v) => act((s) => (s.control[key] = v))}
                        />
                      ))}
                    </>
                  ) : sim.control.kind === 'MPC' ? (
                    <Precision
                      label="PREDICTION HORIZON"
                      value={sim.control.horizon}
                      min={10}
                      max={60}
                      step={1}
                      unit="steps"
                      onChange={(v) => act((s) => (s.control.horizon = v))}
                    />
                  ) : (
                    <div className="data-list">
                      <span>
                        K position <b>{fmt(sim.controller.gain[0], 4)}</b>
                      </span>
                      <span>
                        K velocity <b>{fmt(sim.controller.gain[1], 4)}</b>
                      </span>
                    </div>
                  )}
                  <Precision
                    label="SERVO DAMPING"
                    min={0.6}
                    max={1.8}
                    step={0.05}
                    value={sim.control.damping}
                    unit="ζ"
                    onChange={(v) => act((s) => (s.control.damping = v))}
                  />
                  <Button
                    className="wide"
                    disabled={sim.estop}
                    onClick={() =>
                      act((s) => {
                        s.setAuto(true);
                      })
                    }
                  >
                    <Crosshair />
                    啟動自動置中
                  </Button>
                </section>
                <section>
                  <div className="section-label">LIVE PERFORMANCE</div>
                  <div className="comparison-metrics">
                    <Metric
                      label="SETTLING TIME"
                      value={sim.settled ? fmt(sim.settled) : '—'}
                      unit="s"
                    />
                    <Metric
                      label="RMS ERROR"
                      value={fmt(
                        Math.sqrt(sim.rmsSum / Math.max(1, sim.rmsCount)) *
                          1000,
                      )}
                      unit="mm"
                    />
                    <Metric
                      label="MAX ERROR"
                      value={fmt(sim.maxError * 1000)}
                      unit="mm"
                    />
                    <Metric
                      label="PEAK TILT"
                      value={fmt(sim.peakTilt / DEG)}
                      unit="°"
                    />
                    <Metric
                      label="SERVO WORK"
                      value={fmt(sim.energy, 1)}
                      unit="J"
                    />
                    <Metric
                      label="CONTROL RATE"
                      value={String(sim.control.rate)}
                      unit="Hz"
                    />
                  </div>
                  <div className="section-label">REPEATABLE BENCHMARK</div>
                  <p className="panel-copy">
                    相同初始位置 (100, −65) mm、初速 (0.025, 0.015)
                    m/s，分別模擬 14 秒。穩定條件：誤差 &lt;4 mm、速度 &lt;15
                    mm/s 持續 0.75 秒。
                  </p>
                  <Button
                    className="wide secondary"
                    disabled={comparing}
                    onClick={runComparison}
                  >
                    <FlaskConical />
                    {comparing ? '比較運算中…' : '比較 PID / LQR / MPC'}
                  </Button>
                  {compare.length > 0 && (
                    <Table className="result-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Control</TableHead>
                          <TableHead>Settle</TableHead>
                          <TableHead>RMS</TableHead>
                          <TableHead>Work</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {compare.map((r) => (
                          <TableRow key={r.kind}>
                            <TableCell>{r.kind}</TableCell>
                            <TableCell>
                              {r.lost
                                ? 'LOST'
                                : r.settled
                                  ? `${fmt(r.settled)}s`
                                  : '未穩定'}
                            </TableCell>
                            <TableCell>{fmt(r.rms * 1000, 1)}mm</TableCell>
                            <TableCell>{fmt(r.energy, 1)}J</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <p className="panel-copy">
                    LQR / MPC
                    採滾球簡化模型；物理模擬另含碰撞、平台慣性與致動器延遲，因此允許控制超調或失敗。
                  </p>
                </section>
              </div>
            )}
            {dialog === 'geometry' && (
              <>
                <div className="geometry-grid">
                  {(
                    [
                      ['baseRadius', '底座接點半徑', 0.3, 0.55, 0.01, 'm'],
                      ['topRadius', '上平台接點半徑', 0.2, 0.38, 0.01, 'm'],
                      ['minLength', '最短致動器長度', 0.25, 0.5, 0.005, 'm'],
                      ['maxLength', '最長致動器長度', 0.5, 0.85, 0.005, 'm'],
                      ['mass', '平台質量', 5, 80, 1, 'kg'],
                      ['payload', '負載', 0, 300, 10, 'kg'],
                      ['maxVelocity', '最大速度', 0.03, 0.3, 0.01, 'm/s'],
                      ['maxAcceleration', '最大加速度', 0.2, 3, 0.1, 'm/s²'],
                      ['maxJerk', '最大加加速度', 2, 40, 1, 'm/s³'],
                      ['maxForce', '每腿最大軸向力', 200, 5000, 100, 'N'],
                    ] as const
                  ).map(([key, label, min, max, step, unit]) => (
                    <label key={key}>
                      <span>
                        {label}
                        <small>{unit}</small>
                      </span>
                      <Input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={settings[key]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="panel-copy">
                  原點高度 480 mm · 球體直徑 40 mm · 平台合成傾角限制 12° ·
                  接頭角度限制 48°。所有計算使用 SI 單位。
                </p>
                <Button
                  onClick={() =>
                    act((s) => {
                      if (s.applySettings(settings)) close();
                      else setLocalMessage(s.message);
                    })
                  }
                >
                  <Settings2 /> 套用幾何並重新校正
                </Button>
              </>
            )}
            {dialog === 'experiments' && sim && (
              <>
                <Segments
                  value={tab}
                  onChange={setTab}
                  items={[
                    ['scenarios', '場景'],
                    ['trajectory', '軌跡'],
                    ['frequency', '頻率響應'],
                    ['script', '指令腳本'],
                    ['records', '錄製與保存'],
                  ]}
                />
                {tab === 'scenarios' ? (
                  <div className="scenario-grid">
                    {SCENARIOS.map(([id, title, desc], i) => (
                      <button
                        className="scenario-card"
                        key={id}
                        onClick={() => {
                          act((s) => s.runScenario(id));
                          close();
                        }}
                      >
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <b>{title}</b>
                          <p>{desc}</p>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : tab === 'trajectory' ? (
                  <>
                    <div className="button-pair">
                      <Button
                        onClick={() =>
                          act((s) => {
                            s.trajectory.push({
                              t: s.trajectory.length
                                ? s.trajectory[s.trajectory.length - 1].t + 2
                                : 0,
                              pose: [...s.target],
                            });
                          })
                        }
                      >
                        <Plus />
                        保存目前姿態
                      </Button>
                      <Button
                        className="secondary"
                        disabled={sim.trajectory.length < 2}
                        onClick={() => {
                          act((s) => {
                            s.scenario = 'trajectory';
                            s.scenarioTime = 0;
                            s.plan = null;
                            s.auto = false;
                          });
                          close();
                        }}
                      >
                        <Play />
                        播放軌跡
                      </Button>
                    </div>
                    <p className="panel-copy">
                      在實驗室調整姿態，再加入關鍵影格。相鄰姿態使用平滑插值，經致動器限制執行。
                    </p>
                    <Table className="result-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>XYZ · mm</TableHead>
                          <TableHead>RPY · deg</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sim.trajectory.map((f, i) => (
                          <TableRow key={i}>
                            <TableCell>{f.t}s</TableCell>
                            <TableCell>
                              {f.pose
                                .slice(0, 3)
                                .map((x, j) =>
                                  fmt((x - (j === 2 ? 0.48 : 0)) * 1000, 1),
                                )
                                .join(' / ')}
                            </TableCell>
                            <TableCell>
                              {f.pose
                                .slice(3)
                                .map((x) => fmt(x / DEG, 1))
                                .join(' / ')}
                            </TableCell>
                            <TableCell>
                              <button
                                title="移除影格"
                                onClick={() =>
                                  act((s) => s.trajectory.splice(i, 1))
                                }
                              >
                                <X size={14} />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!sim.trajectory.length && (
                      <div className="empty-state">
                        尚無關鍵影格，請保存至少兩個姿態。
                      </div>
                    )}
                  </>
                ) : tab === 'frequency' ? (
                  <>
                    <p className="panel-copy">
                      Pitch 2°
                      正弦掃頻，量測穩態基頻振幅與相位。使用目前幾何與動態模式；飽和或失穩時結果不代表線性傳遞函數。
                    </p>
                    <Button disabled={sweeping} onClick={runSweep}>
                      <Activity />
                      {sweeping ? '掃頻運算中…' : '執行 0.1–2 Hz 掃頻'}
                    </Button>
                    <Table className="result-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Gain</TableHead>
                          <TableHead>Phase</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {frequency.map((r) => (
                          <TableRow key={r.f}>
                            <TableCell>{r.f} Hz</TableCell>
                            <TableCell>{fmt(r.gain)} dB</TableCell>
                            <TableCell>{fmt(r.phase, 1)}°</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : tab === 'script' ? (
                  <>
                    <p className="panel-copy">
                      每行一個指令；wait 使用毫秒。支援
                      pose、actuator、home、ball.spawn、center
                      on/off、controller pid/lqr/mpc、disturbance、estop。
                    </p>
                    <textarea
                      className="script-editor"
                      aria-label="場景指令腳本"
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      spellCheck={false}
                    />
                    <div className="button-pair">
                      <Button disabled={scripting} onClick={runScript}>
                        <Play />
                        執行腳本
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() => (scriptAbort.current = true)}
                      >
                        <Square />
                        停止
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() =>
                          download(
                            'StewartLab-script.txt',
                            script,
                            'text/plain',
                          )
                        }
                      >
                        <Download />
                        保存
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="comparison-metrics">
                      <Metric
                        label="RECORDED"
                        value={fmt(sim.record.length / 30, 1)}
                        unit="s"
                      />
                      <Metric
                        label="FRAMES"
                        value={String(sim.record.length)}
                      />
                      <Metric
                        label="SAMPLES"
                        value={String(sim.history.length)}
                      />
                    </div>
                    <div className="record-actions">
                      <Button
                        className="secondary"
                        onClick={() =>
                          act((s) =>
                            s.recording
                              ? (s.recording = false)
                              : s.startRecord(),
                          )
                        }
                      >
                        <CircleDot />
                        {sim.recording ? '停止錄製' : '開始新錄製'}
                      </Button>
                      <Button
                        className="secondary"
                        disabled={!sim.record.length}
                        onClick={() => {
                          act((s) => s.replay());
                          close();
                        }}
                      >
                        <Play />
                        狀態重播
                      </Button>
                      <Button className="secondary" onClick={exportJSON}>
                        <Download />
                        匯出實驗 JSON
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() => file.current?.click()}
                      >
                        <Upload />
                        載入實驗 JSON
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() => {
                          try {
                            localStorage.setItem(
                              'stewart-lab-preset',
                              JSON.stringify({
                                ...sim.exportExperiment(),
                                recording: [],
                                samples: [],
                              }),
                            );
                            setLocalMessage('實驗設定已保存於此瀏覽器');
                          } catch {
                            setLocalMessage(
                              '無法存取瀏覽器儲存空間，請匯出 JSON。',
                            );
                          }
                        }}
                      >
                        <Save />
                        保存本機預設
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() => {
                          try {
                            const data =
                              localStorage.getItem('stewart-lab-preset');
                            if (data) {
                              sim.loadExperiment(JSON.parse(data));
                              setLocalMessage(sim.message);
                            } else setLocalMessage('尚無本機預設');
                            refresh();
                          } catch {
                            setLocalMessage('預設無法讀取');
                          }
                        }}
                      >
                        <RotateCcw />
                        還原本機預設
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() =>
                          download(
                            'StewartLab-signals.csv',
                            't,pitch_target_deg,pitch_actual_deg,ball_x_mm,ball_y_mm,energy_J\n' +
                              sim.history
                                .map((h) =>
                                  [
                                    h.t,
                                    h.target,
                                    h.actual,
                                    h.ballX,
                                    h.ballY,
                                    h.energy,
                                  ].join(','),
                                )
                                .join('\n'),
                            'text/csv',
                          )
                        }
                      >
                        <Download />
                        信號 CSV
                      </Button>
                    </div>
                    <p className="panel-copy">
                      重播使用記錄的姿態、致動器與物件狀態。返回互動時請重設模擬。JSON
                      恢復設定、目標與錄製資料；新模擬從原點執行，不還原接觸求解器內部狀態。
                    </p>
                    <div className="section-label">EVENT LOG</div>
                    <div className="event-list">
                      {sim.events.map((e, i) => (
                        <p key={i}>
                          <span>{fmt(e.t, 2)}s</span>
                          {e.text}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {dialog === 'help' && (
              <div className="help-content">
                <ol>
                  <li>
                    <b>拖動 Pitch。</b> 指令經過軌跡規劃 → IK → 致動器伺服 →
                    平台受力。
                  </li>
                  <li>
                    <b>切到致動器。</b> 微調單腿行程，觀察其他自由度如何改變。
                  </li>
                  <li>
                    <b>投球，再開啟自動置中。</b> 平台只能透過傾斜與碰撞影響球。
                  </li>
                  <li>
                    <b>打開控制器。</b> 調整参数或比較 PID、LQR 與 MPC。
                  </li>
                </ol>
                <div className="section-label">SHORTCUTS</div>
                <div className="shortcut-grid">
                  <span>
                    <kbd>Space</kbd> 播放 / 暫停
                  </span>
                  <span>
                    <kbd>H</kbd> 回原點
                  </span>
                  <span>
                    <kbd>E</kbd> 緊急停止
                  </span>
                  <span>
                    <kbd>Esc</kbd> 退出展示
                  </span>
                  <span>
                    <kbd>`</kbd> 指令控制台
                  </span>
                </div>
                <div className="section-label">MODEL NOTES</div>
                <p>
                  此版本為可操作的工程模擬原型，並非已校正的實體設備模型。動態模式將六支致動器建模為軸向彈性伺服器；上平台與物件為
                  Rapier 剛體，致動器外殼與接頭尚未各自建成剛體關節。
                </p>
                <p>
                  乒乓球使用 40 mm、2.7 g、空心球慣量與連續碰撞偵測。摩擦採
                  Rapier
                  接觸模型，角阻尼近似滾動阻力。電流、溫度與可恢復範圍是估值；工作包絡顯示為示意。
                </p>
                <p>
                  圖表顯示模擬數據。物理固定 240 Hz、控制預設 120
                  Hz；低速裝置可能以較慢的牆鐘時間運行。
                </p>
                <p>
                  <a
                    href="https://rapier.rs/docs/user_guides/javascript/rigid_bodies/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Rapier 剛體文件
                  </a>{' '}
                  ·{' '}
                  <a
                    href="https://underactuated.mit.edu/lqr.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    LQR 控制理論
                  </a>
                </p>
              </div>
            )}
            {localMessage && (
              <output className="local-message">{localMessage}</output>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f && sim) {
            try {
              if (f.size > 128 * 1024 * 1024) throw Error('檔案超過 128 MiB');
              sim.loadExperiment(JSON.parse(await f.text()));
              setLocalMessage(sim.message);
            } catch (err) {
              setLocalMessage(
                `載入失敗：${err instanceof Error ? err.message : '無效 JSON'}`,
              );
            }
            refresh();
          }
          e.target.value = '';
        }}
      />
    </>
  );
}
