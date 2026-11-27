'use client';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { compactViewport } from '@/lib/compact-screen';
import type { LabPanel } from '@/lib/workspace-route';
import {
  ChartNoAxesCombined,
  Activity,
  Crosshair,
  CircleHelp,
  RotateCcw,
  Play,
  Pause,
  SkipForward,
  Move3d,
  Box,
  Maximize2,
  Download,
  Settings2,
  Layers3,
  Grid3x3,
  ScanLine,
  ArrowUpRight,
  Camera,
  Terminal,
  X,
  CircleStop,
  Volume2,
  VolumeX,
  Plus,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { usePanelRef } from 'react-resizable-panels';
import { ChartContainer } from '@/components/ui/chart';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { LabScene } from '@/lib/scene';
import { ActuatorAudio } from '@/lib/actuator-audio';
import { Simulation, DT, type ObjectKind } from '@/lib/simulation';
import { registerLabTools } from '@/lib/webmcp';
import { Launcher } from './launcher';
import { DEFAULT_LAUNCH, type LaunchSettings } from '@/lib/launch';
import { Trash2 } from 'lucide-react';
import { Controls, Telemetry } from './panels';
import { LabDialogs } from './dialogs';
import {
  PlayControls,
  PlayTelemetry,
  FilmPanel,
  Joystick,
  type PlayPanel,
} from './playground';
import { PlaySession, CHALLENGES } from '@/lib/play-session';
import { MAZES } from '@/lib/mazes';
import { FilmRecorder, type FilmOptions, type Clip } from '@/lib/film-recorder';
import { Choice, fmt, download } from './widgets';
function subscribeToCompact(onChange: () => void) {
  const query = matchMedia(compactViewport);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const compactSnapshot = () => matchMedia(compactViewport).matches;
type LabPane = 'inputs' | 'readings' | 'signal' | 'tools';

type LabProps = {
  active: boolean;
  panel: LabPanel;
  maze?: string | null;
  challenge?: string | null;
  onPanelChange(panel: LabPanel): void;
  onHome(): void;
  onDocument(kind: 'manual' | 'verification'): void;
};
const panelTitles: Record<LabPanel, string> = {
  free: '自由玩',
  path: '手繪循跡',
  maze: '滾球迷宮',
  challenge: '挑戰',
  film: '影片工作室',
  engineering: '工程實驗',
};

export default function Home({
  active,
  panel,
  maze,
  challenge,
  onPanelChange,
  onHome,
  onDocument,
}: LabProps) {
  const workspaceMode = panel === 'engineering' ? 'engineering' : 'play';
  const playPanel: PlayPanel = panel === 'engineering' ? 'free' : panel;
  const compact = useSyncExternalStore(
    subscribeToCompact,
    compactSnapshot,
    () => false,
  );
  const [mobilePane, setMobilePane] = useState<LabPane>('inputs');
  const [toolHost, setToolHost] = useState<HTMLDivElement | null>(null);
  const inputPanel = useRef<HTMLElement>(null);
  const workbench = useRef<HTMLElement>(null);
  // Keep the original tools and handlers when their location changes on a phone.
  function toolGroup(label: string, children: ReactNode) {
    if (!compact) return children;
    return (
      toolHost &&
      createPortal(
        <section className="lab-tool-group">
          <h3>{label}</h3>
          {children}
        </section>,
        toolHost,
        label,
      )
    );
  }
  const mount = useRef<HTMLDivElement>(null),
    engine = useRef<Simulation | null>(null),
    scene = useRef<LabScene | null>(null),
    leftRef = usePanelRef(),
    rightRef = usePanelRef();
  const [rev, render] = useState(0),
    [ready, setReady] = useState(false),
    [playSession, setPlaySession] = useState<PlaySession | null>(null),
    [ballVectors, setBallVectors] = useState(true),
    [throwPreview, setThrowPreview] = useState<{
      x: number;
      y: number;
      speed: number;
    } | null>(null),
    [filmState, setFilmState] = useState({ active: false, elapsed: 0 }),
    [clip, setClip] = useState<Clip | null>(null),
    [filmError, setFilmError] = useState(''),
    [simulation, setSimulation] = useState<Simulation | null>(null),
    [error, setError] = useState(''),
    [mode, setMode] = useState('pose'),
    [launch, setLaunch] = useState<LaunchSettings>({ ...DEFAULT_LAUNCH }),
    [inspect, setInspect] = useState('overview'),
    [dialog, setDialog] = useState(''),
    [selected, setSelected] = useState(0),
    [camera, setCamera] = useState('orbit'),
    [channel, setChannel] = useState('pitch'),
    [showError, setShowError] = useState(true),
    [showTarget, setShowTarget] = useState(true),
    [command, setCommand] = useState(''),
    [consoleOpen, setConsoleOpen] = useState(false),
    [presentation, setPresentation] = useState(false),
    [leftHidden, setLeftHidden] = useState(false),
    [rightHidden, setRightHidden] = useState(false),
    [toggles, setToggles] = useState({
      grid: true,
      forces: false,
      xray: false,
      exploded: false,
      workspace: false,
      heat: false,
    }),
    [manipulator, setManipulator] = useState('off'),
    [objectKind, setObjectKind] = useState<ObjectKind>('ball'),
    [throwing, setThrowing] = useState(false),
    [fps, setFps] = useState(0),
    [audioOn, setAudioOn] = useState(false),
    [audioVolume, setAudioVolume] = useState(35);
  const audioRef = useRef<ActuatorAudio | null>(null);
  const playRef = useRef<PlaySession | null>(null),
    filmRef = useRef<FilmRecorder | null>(null),
    clipRef = useRef<Clip | null>(null),
    lastImpactRef = useRef(0);
  useEffect(() => {
    if (compact) inputPanel.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [compact, workspaceMode, mode, playPanel]);
  const refresh = () => render((v) => v + 1);
  const act = (fn: (s: Simulation) => unknown) => {
    if (engine.current) {
      fn(engine.current);
      refresh();
    }
  };
  useEffect(() => {
    let disposed = false;
    const init = async () => {
      try {
        if (!mount.current) return;
        const sc = new LabScene(mount.current);
        sc.setRenderingActive(false);
        scene.current = sc;
        sc.onSelect = (i) => {
          setSelected(i);
          setInspect('inspector');
          if (
            matchMedia(compactViewport).matches &&
            mount.current?.closest('.engineering-mode')
          )
            setMobilePane('readings');
          sc.selected = i;
        };
        sc.onPose = (p) => engine.current?.setPose(p);
        sc.onThrow = (x, y, vx, vy) => {
          engine.current?.launch({
            x,
            y,
            height: 0.12,
            azimuth: (Math.atan2(vy, vx) * 180) / Math.PI,
            elevation: 0,
            speed: Math.hypot(vx, vy),
          });
          setThrowing(false);
        };
        sc.onThrowPreview = setThrowPreview;
        const sim = await Simulation.create();
        if (disposed) {
          sim.dispose();
          return;
        }
        engine.current = sim;
        const playground = new PlaySession(sim);
        playRef.current = playground;
        setPlaySession(playground);
        setSimulation(sim);
        setReady(true);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void init();
    return () => {
      disposed = true;
      filmRef.current?.dispose();
      engine.current?.dispose();
      scene.current?.dispose();
      void audioRef.current?.dispose();
      audioRef.current = null;
      filmRef.current = null;
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      clipRef.current = null;
    };
  }, []);
  const selectedPreset =
    panel === 'maze' ? maze : panel === 'challenge' ? challenge : null;
  const appliedPanel = useRef<{
    panel: LabPanel;
    preset?: string | null;
  } | null>(null);
  useEffect(() => {
    const sc = scene.current,
      playground = playRef.current;
    if (!active || !ready || !sc || !playground) return;
    const previous = appliedPanel.current;
    if (previous?.panel === panel && previous.preset === selectedPreset) return;
    appliedPanel.current = { panel, preset: selectedPreset };
    sc.cancelThrow();
    setThrowing(false);
    setMobilePane('inputs');
    if (panel === 'engineering' || panel === 'film') return;
    let frameLevel = playground.mode !== panel;
    playground.selectMode(panel);
    if (panel === 'maze') {
      const index = MAZES.findIndex((m) => m.id === selectedPreset);
      if (index >= 0 && index !== playground.mazeIndex) {
        playground.cancel();
        playground.mazeIndex = index;
        frameLevel = true;
      }
    } else if (panel === 'challenge') {
      const entry = CHALLENGES.find((c) => c.id === selectedPreset);
      if (entry && entry.id !== playground.challengeId) {
        playground.cancel();
        playground.challengeId = entry.id;
        frameLevel = true;
      }
    }
    if (frameLevel && (panel === 'maze' || panel === 'challenge')) {
      sc.preset('top');
      setCamera('top');
    }
  }, [active, ready, panel, selectedPreset]);

  const labRunning = useRef(false);
  useEffect(() => {
    const sim = engine.current,
      sc = scene.current,
      playground = playRef.current;
    if (!active || !ready || !sim || !sc || !playground) return;
    let raf = 0,
      acc = 0,
      last = 0,
      lastUI = 0,
      lastFps = 0,
      frames = 0;
    let running = false;
    let disposeTools: (() => void) | undefined;
    const loop = (now: number) => {
      if (!running) return;
      const elapsed = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!sim.paused) {
        acc += elapsed * sim.speed;
        let steps = 0;
        while (acc >= DT && steps < 100) {
          sim.tick();
          playground.tick();
          if (sim.paused) {
            acc = 0;
            break;
          }
          acc -= DT;
          steps++;
        }
        if (steps === 100) acc = 0;
      } else acc = 0;
      if (sim.scenario === 'basic' && sim.scenarioTime > 7) sim.home();
      const frame = sim.view();
      sc.update(frame);
      frames++;
      if (now - lastFps > 1000) {
        setFps(Math.round((frames * 1000) / (now - lastFps)));
        frames = 0;
        lastFps = now;
      }
      if (now - lastUI > 100) {
        render((v) => v + 1);
        setFilmState({
          active: filmRef.current?.active ?? false,
          elapsed: filmRef.current?.elapsed ?? 0,
        });
        lastUI = now;
      }
      audioRef.current?.update(frame.actuators, sim.paused || sim.estop);
      for (const impact of sim.impacts)
        if (impact.id > lastImpactRef.current) {
          lastImpactRef.current = impact.id;
          if (!sim.paused && !sim.estop)
            audioRef.current?.impact(impact.type, impact.force, impact.x);
        }
      raf = requestAnimationFrame(loop);
    };

    const setVisible = (visible: boolean) => {
      if (running === visible) return;
      running = visible;
      labRunning.current = visible;
      sc.setRenderingActive(visible);
      const audio = audioRef.current;
      if (visible) {
        last = lastFps = performance.now();
        frames = acc = 0;
        if (audio?.enabled) void audio.context.resume().catch(() => {});
        disposeTools = registerLabTools(sim, refresh, playground);
        raf = requestAnimationFrame(loop);
      } else {
        cancelAnimationFrame(raf);
        disposeTools?.();
        disposeTools = undefined;
        playground.keys.clear();
        playground.setJoystick(0, 0);
        sc.cancelThrow();
        setThrowing(false);
        workbench.current?.querySelector('video')?.pause();
        if (filmRef.current?.active) filmRef.current.stop();
        if (audio && !audio.disposed)
          void audio.context.suspend().catch(() => {});
      }
    };
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      setVisible(false);
    };
  }, [active, ready]);
  useEffect(() => {
    if (active) return;
    setDialog('');
    setPresentation(false);
    setConsoleOpen(false);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (
        !labRunning.current ||
        (e.target as Element)?.closest?.(
          'dialog,[role="dialog"], [data-workspace-navigation]',
        )
      )
        return;
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,[contenteditable=true]',
        )
      )
        return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'w',
          'a',
          's',
          'd',
        ].includes(k) &&
        (panel === 'maze' || panel === 'challenge') &&
        playRef.current?.active
      ) {
        e.preventDefault();
        playRef.current.keys.add(k);
        return;
      }
      if (
        e.code === 'Space' &&
        !(e.target as HTMLElement)?.closest?.('button,a,select,[role="button"]')
      ) {
        e.preventDefault();
        act((s) => (s.paused = !s.paused));
      }
      if (e.key === 'Escape') {
        setPresentation(false);
        setManipulator('off');
        scene.current?.setManipulator('off');
      }
      if (e.key.toLowerCase() === 'e') act((s) => s.stop());
      if (e.key.toLowerCase() === 'h') act((s) => s.home());
      if (e.key === '`') setConsoleOpen((v) => !v);
    };
    window.addEventListener('keydown', key);
    const up = (e: KeyboardEvent) =>
      playRef.current?.keys.delete(
        e.key.length === 1 ? e.key.toLowerCase() : e.key,
      );
    const blur = () => {
      playRef.current?.keys.clear();
      playRef.current?.setJoystick(0, 0);
    };
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [active, panel]);
  useEffect(() => {
    scene.current?.setLaunchPreview(mode === 'launch' ? launch : null);
  }, [mode, launch, ready]);
  const sim = simulation,
    view = sim?.view(),
    disabled = !ready || !!sim?.estop || !!sim?.replaying;
  const resetAll = () => {
    playRef.current?.cancel();
    if (playRef.current) playRef.current.run = null;
    act((s) => {
      s.initialize();
      s.log('模擬已歸零，球體、故障與控制状态已清除');
    });
    setManip('off');
    setThrowing(false);
    setToggles((t) => ({ ...t, exploded: false }));
    if (scene.current) {
      scene.current.exploded = false;
      scene.current.throwing = false;
    }
  };
  const toggleView = (key: keyof typeof toggles) => {
    const value = !toggles[key];
    setToggles({ ...toggles, [key]: value });
    const sc = scene.current;
    if (sc) {
      if (key === 'grid') sc.grid.visible = value;
      if (key === 'forces') sc.showForces = value;
      if (key === 'xray') sc.setXray(value);
      if (key === 'exploded') {
        sc.exploded = value;
        act((s) => {
          s.paused = value;
          s.log(value ? 'EXPLODED VIEW：分解視圖，模擬暫停' : '已返回組裝視圖');
        });
      }
      if (key === 'workspace') sc.workspace.visible = value;
      if (key === 'heat') sc.heat = value;
    }
  };
  const setCameraPreset = (c: string) => {
    setCamera(c);
    scene.current?.preset(c);
  };
  const setManip = (v: string) => {
    setManipulator(v);
    scene.current?.setManipulator(v);
  };
  const selectLeg = (i: number) => {
    setSelected(i);
    if (scene.current) scene.current.selected = i;
  };
  const changeAudio = async () => {
    try {
      if (!audioRef.current) audioRef.current = new ActuatorAudio();
      audioRef.current.setVolume(audioVolume / 100);
      const on = !audioOn;
      setAudioOn(on);
      await audioRef.current.setEnabled(on);
      if (!labRunning.current && !audioRef.current.disposed)
        await audioRef.current.context.suspend();
    } catch {
      setAudioOn(false);
      engine.current?.log('音效未能啟用，請再按一次音效開關', 'warning');
    }
  };
  const startThrow = () => {
    if (playRef.current?.active || filmRef.current?.active) return;
    setThrowing(true);
    if (scene.current) {
      scene.current.throwing = true;
      scene.current.controls.enabled = false;
    }
  };
  const startFilm = async (options: FilmOptions, includeAudio: boolean) => {
    if (
      !labRunning.current ||
      !scene.current ||
      !engine.current ||
      filmRef.current?.active
    )
      return;
    setFilmError('');
    try {
      if (includeAudio) {
        if (!audioRef.current) audioRef.current = new ActuatorAudio();
        audioRef.current.setVolume(audioVolume / 100);
        await audioRef.current.setEnabled(true);
        setAudioOn(true);
        if (!labRunning.current) {
          await audioRef.current.context.suspend();
          return;
        }
      }
      if (!filmRef.current) filmRef.current = new FilmRecorder();
      filmRef.current.start(
        scene.current,
        includeAudio ? audioRef.current : null,
        options,
        () => {
          const s = engine.current!,
            p = playRef.current;
          return {
            title: p?.run?.title ?? 'HEXAMOTION 實驗工作台',
            task:
              s.activeTask === 'path'
                ? '手繪路徑循跡'
                : s.activeTask === 'circle'
                  ? '圓周運動'
                  : p?.mode === 'maze'
                    ? '滾球迷宮'
                    : p?.mode === 'challenge' && p.run
                      ? p.run.title
                      : s.activeTask === 'center'
                        ? '自動置中'
                        : '自由探索',
            speed: s.ball?.speed ?? 0,
            error:
              p?.run && s.ball
                ? Math.hypot(
                    s.ball.x - p.run.target.x,
                    s.ball.y - p.run.target.y,
                  )
                : (s.ball?.error ?? 0),
            time: s.time,
          };
        },
        (value) => {
          if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
          clipRef.current = value;
          setClip(value);
          setFilmState({ active: false, elapsed: value.duration });
        },
        (message) => {
          setFilmError(message);
          setFilmState({ active: false, elapsed: 0 });
        },
      );
      setFilmState({ active: true, elapsed: 0 });
    } catch (e) {
      setFilmError(e instanceof Error ? e.message : '錄影未能啟動');
    }
  };
  const exportJSON = () =>
    sim &&
    download(
      'StewartLab-experiment.json',
      JSON.stringify(sim.exportExperiment()),
    );
  const screenshot = () => {
    const data = scene.current?.screenshot();
    if (data) {
      const a = document.createElement('a');
      a.href = data;
      a.download = 'StewartLab-snapshot.png';
      a.click();
    }
  };
  const plotData = (sim?.history ?? [])
    .filter((h) => !sim?.replaying || h.t <= (view?.time ?? 0))
    .slice(-450)
    .filter((_, i) => i % 2 === 0)
    .map((h) => ({
      t: h.t,
      a:
        channel === 'pitch'
          ? h.actual
          : channel === 'ball'
            ? h.ballX
            : channel === 'velocity'
              ? h.ballV
              : channel.startsWith('a')
                ? h.lengths[Number(channel[1]) - 1]
                : channel === 'force'
                  ? h.forces[selected]
                  : channel === 'heave'
                    ? h.z
                    : channel === 'roll'
                      ? h.roll
                      : h.yaw,
      b:
        channel === 'pitch'
          ? h.target
          : channel === 'ball'
            ? h.ballY
            : undefined,
      e: channel === 'pitch' ? h.error : undefined,
    }));
  return (
    <main
      ref={workbench}
      className={`lab v2 ${workspaceMode === 'play' ? 'play-mode' : 'engineering-mode'} ${presentation ? 'presentation' : ''}`}
      data-revision={rev}
      data-lab-pane={mobilePane}
    >
      <header className="topbar">
        <h2 className="lab-work-title">{panelTitles[panel]}</h2>
        {toolGroup(
          '工作臺',
          <nav aria-label="實驗功能">
            {workspaceMode === 'engineering' && (
              <>
                <button onClick={() => setDialog('controller')}>控制器</button>
                <button onClick={() => setDialog('experiments')}>
                  實驗與紀錄
                </button>
              </>
            )}
            <button
              className="manual-link"
              onClick={() => onDocument('manual')}
            >
              系統手冊
            </button>
          </nav>,
        )}
        <div className="top-status">
          <button
            className="lab-quick-pause"
            aria-label={sim?.paused ? '繼續模擬' : '暫停模擬'}
            disabled={!ready}
            onClick={() =>
              act((s) => {
                s.paused = !s.paused;
              })
            }
          >
            {sim?.paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          {toolGroup(
            '設定與說明',
            <>
              <button
                title="使用說明"
                aria-label="使用說明"
                onClick={() => setDialog('help')}
              >
                <CircleHelp size={17} />
              </button>
              <button
                title="模型設定"
                aria-label="模型設定"
                onClick={() => setDialog('geometry')}
              >
                <Settings2 size={17} />
              </button>
            </>,
          )}
          <Button
            className={`estop ${sim?.estop ? 'engaged' : ''}`}
            disabled={!ready}
            onClick={() => act((s) => (s.estop ? s.release() : s.stop()))}
          >
            <CircleStop size={15} />
            {sim?.estop ? '解除制動' : compact ? '急停' : 'E-STOP'}
          </Button>
        </div>
      </header>
      <div className="systembar">
        <span className={sim?.status !== 'NOMINAL' ? 'amber' : ''}>
          <i />
          {sim?.status ?? 'INITIALIZING'}
        </span>
        <span>
          PHYSICS <b>240 Hz</b>
        </span>
        <span>
          CONTROL <b>{sim?.control.rate ?? 120} Hz</b>
        </span>
        <span>
          ACTUATORS{' '}
          <b>{sim?.actuators.filter((a) => !a.failed).length ?? 0} / 6</b>
        </span>
        <span className="system-end">
          {sim?.dynamic ? 'DYNAMIC PLATFORM' : 'KINEMATIC PLATFORM'}{' '}
          <span className="tag">{fps} FPS</span>
        </span>
      </div>
      <ResizablePanelGroup orientation="vertical" className="main-panels">
        <ResizablePanel defaultSize="77%" minSize="40%" className="main-upper">
          <ResizablePanelGroup
            orientation="horizontal"
            className="workspace-layout"
          >
            <ResizablePanel
              panelRef={leftRef}
              defaultSize="21%"
              minSize="230px"
              maxSize="34%"
              collapsible
              collapsedSize={0}
              className="left-container"
            >
              <aside className="left-panel" ref={inputPanel}>
                {workspaceMode === 'play' ? (
                  <PlayControls
                    sim={sim}
                    session={playSession}
                    act={act}
                    refresh={refresh}
                    onThrow={startThrow}
                    panel={playPanel}
                    setPanel={onPanelChange}
                    vectors={ballVectors}
                    setVectors={(value) => {
                      setBallVectors(value);
                      if (scene.current) scene.current.showBallVectors = value;
                    }}
                    film={
                      <FilmPanel
                        active={filmState.active}
                        elapsed={filmState.elapsed}
                        error={filmError}
                        onStart={(o, a) => void startFilm(o, a)}
                        onStop={() => filmRef.current?.stop()}
                      />
                    }
                  />
                ) : (
                  <Controls
                    launchPanel={
                      <Launcher
                        sim={sim}
                        settings={launch}
                        setSettings={setLaunch}
                        kind={objectKind}
                        setKind={setObjectKind}
                        act={act}
                        reset={resetAll}
                      />
                    }
                    sim={sim}
                    act={act}
                    open={setDialog}
                    collapse={() => {
                      leftRef.current?.collapse();
                      setLeftHidden(true);
                    }}
                    mode={mode}
                    setMode={setMode}
                    manipulator={manipulator}
                    setManipulator={setManip}
                  />
                )}
              </aside>
            </ResizablePanel>
            <ResizableHandle className="vertical-divider" />
            <ResizablePanel minSize="220px" className="viewport-panel">
              <section className="viewport">
                <div ref={mount} className="three-canvas" />
                {workspaceMode === 'play' &&
                  playSession?.active &&
                  playSession.run && (
                    <div className="mobile-game-controls">
                      <div className="mobile-game-hud">
                        {playSession.run.title}
                        <b>
                          {Math.max(
                            0,
                            playSession.run.limit - playSession.run.elapsed,
                          ).toFixed(1)}{' '}
                          s
                        </b>
                      </div>
                      <Joystick session={playSession} refresh={refresh} />
                    </div>
                  )}
                <div className="viewport-title">
                  <div className="eyebrow">HEXAPOD SYSTEM</div>
                  <h1>HX–06</h1>
                  <p>六自由度並聯平台</p>
                </div>
                <div className="view-badge">
                  <i />
                  {sim?.paused ? 'PAUSED' : sim?.replaying ? 'REPLAY' : 'LIVE'}
                  <span>3D VIEWPORT</span>
                </div>
                {toolGroup(
                  '模型檢視',
                  <div className="view-tools">
                    {(
                      [
                        [Box, 'xray', 'X-Ray 透視'],
                        [Layers3, 'exploded', 'Exploded 分解'],
                        [ArrowUpRight, 'forces', '致動器受力'],
                        [Grid3x3, 'grid', '地面網格'],
                        [ScanLine, 'workspace', '工作空間示意'],
                        [Activity, 'heat', '負載熱圖'],
                      ] as const
                    ).map(([Icon, key, title]) => (
                      <button
                        key={key}
                        className={toggles[key] ? 'active' : ''}
                        title={title}
                        aria-label={title}
                        onClick={() => toggleView(key)}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                    <button
                      title="平移與旋轉操縱器"
                      aria-label="平移與旋轉操縱器"
                      className={manipulator !== 'off' ? 'active' : ''}
                      onClick={() =>
                        setManip(
                          manipulator === 'off'
                            ? 'translate'
                            : manipulator === 'translate'
                              ? 'rotate'
                              : 'off',
                        )
                      }
                    >
                      <Move3d size={16} />
                    </button>
                    <button
                      title="展示模式"
                      aria-label="展示模式"
                      onClick={() => setPresentation(!presentation)}
                    >
                      <Maximize2 size={16} />
                    </button>
                    <button
                      title="保存截圖"
                      aria-label="保存截圖"
                      onClick={screenshot}
                    >
                      <Camera size={16} />
                    </button>
                  </div>,
                )}
                {leftHidden && (
                  <button
                    className="restore-panel left"
                    onClick={() => {
                      leftRef.current?.expand();
                      setLeftHidden(false);
                    }}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                )}
                {rightHidden && (
                  <button
                    className="restore-panel right"
                    onClick={() => {
                      rightRef.current?.expand();
                      setRightHidden(false);
                    }}
                  >
                    <Activity size={15} />
                  </button>
                )}
                {sim?.estop && (
                  <div className="safety-banner">
                    <CircleStop size={17} /> EMERGENCY STOP{' '}
                    <small>控制器已關閉 · 致動器制動保持</small>
                  </div>
                )}
                {toggles.exploded && (
                  <div className="scene-notice">
                    分解視圖 · 不代表實際物理位置
                  </div>
                )}
                {toggles.workspace && (
                  <div className="workspace-note">
                    示意包絡；可達性由 IK 與機械限制判定。
                  </div>
                )}
                {throwing && (
                  <div className="throw-overlay">
                    <Target />
                    <b>在平台畫面拖曳，放開後拋球</b>
                    <small>
                      {throwPreview
                        ? `起點 (${(throwPreview.x * 1000).toFixed(0)}, ${(throwPreview.y * 1000).toFixed(0)}) mm · 初速度 ${throwPreview.speed.toFixed(2)} m/s`
                        : '點選平台作為起點，沿拋出方向拖曳；金色圈為預測落點。'}
                    </small>
                    <Button
                      className="secondary"
                      onClick={() => {
                        setThrowing(false);
                        scene.current?.cancelThrow();
                      }}
                    >
                      取消
                    </Button>
                  </div>
                )}
                {!ready && !error && (
                  <div role="status" className="runtime-error">
                    正在載入實驗平台…
                  </div>
                )}
                {error && (
                  <div className="runtime-error">
                    <b>模擬載入失敗</b>
                    <p>{error}</p>
                    <Button onClick={onHome}>返回控制艙</Button>
                  </div>
                )}
                {toolGroup(
                  '平台操作',
                  <div className="ball-actions">
                    <Button
                      className="secondary"
                      disabled={!ready || sim?.replaying || playSession?.active}
                      onClick={() => act((s) => s.launch(launch, objectKind))}
                    >
                      <Plus size={15} /> 投放球體
                    </Button>
                    <Button
                      disabled={!ready || sim?.replaying || playSession?.active}
                      className="throw-button secondary"
                      title="投球設定：位置、角度、力道"
                      aria-label="投球設定"
                      onClick={() => {
                        onPanelChange('engineering');
                        setMode('launch');
                        leftRef.current?.expand();
                        setLeftHidden(false);
                      }}
                    >
                      <SlidersHorizontal size={15} />
                      設定
                    </Button>
                    <Button
                      className={
                        sim?.activeTask === 'center' ? 'auto-active' : ''
                      }
                      aria-pressed={sim?.activeTask === 'center'}
                      disabled={disabled || playSession?.active}
                      onClick={() =>
                        act((s) => {
                          s.setAuto(s.activeTask !== 'center');
                        })
                      }
                    >
                      <Crosshair />
                      {sim?.activeTask === 'center' ? '置中控制中' : '自動置中'}
                    </Button>
                    <Button
                      className="secondary clear-balls"
                      disabled={
                        !ready ||
                        !sim?.objects.length ||
                        sim.replaying ||
                        playSession?.active
                      }
                      title="只清空球體，保留平台姿態與任務"
                      onClick={() => act((s) => s.clearObjects())}
                    >
                      <Trash2 size={14} />
                      <span>清空</span>
                    </Button>
                    <Button
                      className="secondary reset-scene"
                      disabled={!ready}
                      title="清空球體、解除故障、平台歸零"
                      onClick={resetAll}
                    >
                      <RotateCcw size={14} />
                      <span>歸零</span>
                    </Button>
                  </div>,
                )}
                {toolGroup(
                  '相機視角',
                  <div className="view-bottom">
                    <div className="camera-tabs">
                      {['orbit', 'front', 'top', 'iso'].map((c) => (
                        <button
                          key={c}
                          className={camera === c ? 'active' : ''}
                          onClick={() => setCameraPreset(c)}
                        >
                          {c.toUpperCase()}
                        </button>
                      ))}
                      <Choice
                        value={
                          ['side', 'actuator', 'ball', 'cinematic'].includes(
                            camera,
                          )
                            ? camera
                            : 'more'
                        }
                        label="更多視角"
                        options={[
                          ['more', '⋯'],
                          ['side', 'SIDE'],
                          ['actuator', 'ACTUATOR'],
                          ['ball', 'BALL'],
                          ['cinematic', 'CINEMATIC'],
                        ]}
                        onChange={setCameraPreset}
                      />
                    </div>
                    <span>拖曳旋轉 · 滾輪縮放</span>
                  </div>,
                )}
              </section>
            </ResizablePanel>
            <ResizableHandle className="vertical-divider" />
            <ResizablePanel
              panelRef={rightRef}
              defaultSize="21%"
              minSize="230px"
              maxSize="34%"
              collapsible
              collapsedSize={0}
              className="right-container"
            >
              <aside className="right-panel">
                {workspaceMode === 'play' ? (
                  <PlayTelemetry
                    sim={sim}
                    session={playSession}
                    refresh={refresh}
                    clip={clip}
                  />
                ) : (
                  <Telemetry
                    sim={sim}
                    act={act}
                    open={setDialog}
                    collapse={() => {
                      rightRef.current?.collapse();
                      setRightHidden(true);
                    }}
                    inspect={inspect}
                    setInspect={setInspect}
                    selected={selected}
                    setSelected={selectLeg}
                    objectKind={objectKind}
                    setObjectKind={setObjectKind}
                  />
                )}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle className="signal-resizer" />
        <ResizablePanel
          defaultSize="23%"
          minSize="150px"
          maxSize="45%"
          className="signal-container"
        >
          <section className="signal-panel">
            <div className="signal-heading">
              <Activity size={14} /> SIGNAL MONITOR{' '}
              <div className="signal-legend">
                <button
                  onClick={() => setShowTarget(!showTarget)}
                  className={!showTarget ? 'off' : ''}
                >
                  <i /> {channel === 'ball' ? 'BALL Y' : 'TARGET'}
                </button>
                <span>
                  <i /> {channel === 'ball' ? 'BALL X' : 'ACTUAL'}
                </span>
                <button
                  onClick={() => setShowError(!showError)}
                  className={!showError ? 'off' : ''}
                >
                  <i /> ERROR
                </button>
              </div>
              <div className="right">
                <Choice
                  value={channel}
                  label="示波器通道"
                  options={[
                    ['pitch', 'Pitch · deg'],
                    ['roll', 'Roll · deg'],
                    ['yaw', 'Yaw · deg'],
                    ['heave', 'Heave · mm'],
                    ['ball', 'Ball X / Y · mm'],
                    ['velocity', 'Ball velocity · m/s'],
                    ['force', `A${selected + 1} force · N`],
                    ...Array.from(
                      { length: 6 },
                      (_, i) =>
                        [`a${i + 1}`, `A${i + 1} length · mm`] as [
                          string,
                          string,
                        ],
                    ),
                  ]}
                  onChange={setChannel}
                />
              </div>
            </div>
            <div className="plot">
              <ChartContainer
                config={{
                  a: { label: 'Actual', color: '#d0e1e5' },
                  b: { label: 'Target', color: '#6cdbcb' },
                  e: { label: 'Error', color: '#d4a075' },
                }}
              >
                <LineChart
                  data={plotData}
                  margin={{ top: 10, bottom: 0, left: 0, right: 22 }}
                >
                  <CartesianGrid stroke="#283943" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}s`}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={50}
                  />
                  <YAxis
                    width={48}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => Number(v).toFixed(1)}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#14232b',
                      border: '1px solid #3b5360',
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => `t = ${fmt(Number(v), 3)} s`}
                  />
                  <ReferenceLine y={0} stroke="#41565f" />
                  <Line
                    dataKey="a"
                    stroke="#d0e1e5"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {showTarget && (
                    <Line
                      dataKey="b"
                      stroke="#6cdbcb"
                      strokeWidth={1.4}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}{' '}
                  {showError && (
                    <Line
                      dataKey="e"
                      stroke="#d4a075"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ChartContainer>
            </div>
            <div className="timeline">
              <Button
                title="播放 / 暫停 (Space)"
                aria-label="播放或暫停"
                className="play"
                disabled={!ready}
                onClick={() => act((s) => (s.paused = !s.paused))}
              >
                {sim?.paused ? <Play size={14} /> : <Pause size={14} />}
              </Button>
              <Button
                title="前進一步 (1/240 s)"
                aria-label="單步模擬"
                className="icon-button"
                disabled={!ready}
                onClick={() =>
                  act((s) => {
                    s.paused = true;
                    s.tick();
                  })
                }
              >
                <SkipForward size={14} />
              </Button>
              <Button
                title="重設模擬"
                aria-label="重設模擬"
                className="icon-button"
                onClick={resetAll}
              >
                <RotateCcw size={14} />
              </Button>
              <span className="timecode">
                {fmt(view?.time ?? 0, 3)} <small>s</small>
              </span>
              <Choice
                label="播放速度"
                value={String(sim?.speed ?? 1)}
                options={['0.1', '0.25', '0.5', '1', '2', '4'].map(
                  (v) => [v, `${v}×`] as [string, string],
                )}
                onChange={(v) => act((s) => (s.speed = Number(v)))}
              />
              <div className="timeline-track">
                <i
                  style={{
                    width: `${sim?.replaying ? (sim.replayIndex / Math.max(1, sim.record.length)) * 100 : (((sim?.time ?? 0) % 30) / 30) * 100}%`,
                  }}
                />
              </div>
              <button
                className={sim?.recording ? 'recording' : ''}
                disabled={!ready}
                onClick={() =>
                  act((s) =>
                    s.recording ? (s.recording = false) : s.startRecord(),
                  )
                }
              >
                <span className="record-dot" />
                {sim?.recording ? 'REC' : 'RECORD'}
              </button>
              <button
                title="重播錄製"
                aria-label="重播錄製"
                disabled={!sim?.record.length}
                onClick={() => act((s) => s.replay())}
              >
                <Play size={13} />
                <span className="hide-small">REPLAY</span>
              </button>
              <button
                title="匯出實驗 JSON"
                aria-label="匯出實驗 JSON"
                onClick={exportJSON}
              >
                <Download size={14} />
              </button>
              <button
                title="指令控制台"
                aria-label="指令控制台"
                onClick={() => setConsoleOpen(!consoleOpen)}
              >
                <Terminal size={14} />
              </button>
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
      {compact && (
        <>
          <div
            className="lab-tool-palette"
            ref={setToolHost}
            aria-label="工作臺工具"
          />
          <nav className="lab-phone-dock" aria-label="工作臺面板">
            {(
              [
                ['inputs', SlidersHorizontal, '操控'],
                ['readings', Activity, '量測'],
                ['signal', ChartNoAxesCombined, '示波'],
                ['tools', Settings2, '工具'],
              ] as const
            )
              .filter(
                ([key]) => key !== 'signal' || workspaceMode === 'engineering',
              )
              .map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePane(key)}
                  aria-pressed={mobilePane === key}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              ))}
          </nav>
        </>
      )}
      {toolGroup(
        '聲音與狀態',
        <footer className="statusbar">
          <output>
            <i /> {sim?.message ?? 'INITIALIZING PHYSICS…'}
          </output>
          <span>
            6-DOF <em>·</em> RAPIER <em>·</em> WEBGL 2
          </span>
          <div className="sound-controls">
            <button
              title="六支致動器音效隨速度、負載與加速度變化"
              aria-label="致動器音效"
              aria-pressed={audioOn}
              onClick={() => void changeAudio()}
            >
              {audioOn ? <Volume2 size={14} /> : <VolumeX size={14} />}{' '}
              <span>致動器音效</span>
              <b>{audioOn ? 'ON' : 'OFF'}</b>
            </button>
            <Input
              aria-label="致動器音量"
              type="range"
              min={0}
              max={100}
              step={5}
              value={audioVolume}
              onChange={(e) => {
                const volume = Number(e.target.value);
                setAudioVolume(volume);
                audioRef.current?.setVolume(volume / 100);
              }}
            />
            <small>{audioVolume}%</small>
          </div>
          <span>
            HEXAMOTION <b>LAB</b>
          </span>
        </footer>,
      )}
      {consoleOpen && (
        <div className="command-console">
          <div>
            <Terminal size={15} /> COMMAND CONSOLE
            <button
              onClick={() => setConsoleOpen(false)}
              aria-label="關閉控制台"
            >
              <X size={16} />
            </button>
          </div>
          <div className="command-log">
            {sim?.events
              .slice(0, 6)
              .reverse()
              .map((e, i) => (
                <p key={i} className={e.level}>
                  <span>{fmt(e.t, 3)}</span>
                  {e.text}
                </p>
              ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act((s) => s.command(command));
              setCommand('');
            }}
          >
            <b>›</b>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="pose pitch 5deg"
              aria-label="工程指令"
            />
            <Button type="submit">執行</Button>
          </form>
        </div>
      )}
      {presentation && (
        <div className="presentation-controls">
          <Button className="secondary" onClick={() => setPresentation(false)}>
            <X />
            退出展示
          </Button>
          <Button className="estop" onClick={() => act((s) => s.stop())}>
            <CircleStop />
            E-STOP
          </Button>
        </div>
      )}
      <LabDialogs
        dialog={active ? dialog : ''}
        close={() => setDialog('')}
        sim={sim}
        refresh={refresh}
      />
    </main>
  );
}
