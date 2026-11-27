import { useLayoutEffect, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleStop,
  Compass,
  Crosshair,
  Expand,
  Gamepad2,
  Hand,
  Layers3,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Scan,
  SlidersHorizontal,
  Target,
  Volume2,
  VolumeX,
  Waypoints,
  X,
  Video,
  Menu,
} from "lucide-react";
import { LabScene } from "../lib/scene";
import { Simulation, DT } from "../lib/simulation";
import { HOME, DEG, clamp, type Pose } from "../lib/kinematics";
import { SceneSoundstage } from "../lib/scene-sound";
import { ActuatorAudio } from "../lib/actuator-audio";
import { APPLICATIONS, ApplicationSession, type ApplicationId } from "../lib/applications";
import { WorldScreen } from "./world-screen";
import { isWorld, type WorldId } from "../lib/worlds/types";
import { ApplicationInstrument } from "./application-instrument";
import { bindDeckPush } from "../lib/deck-gesture";
import { sceneGestureInfo } from "./scene-controls";
import { SceneInputPanel } from "./scene-input-panel";
import { worldGuides } from "./world-cue";
import { GestureDisc, type Stick } from "./gesture-disc";
import { Catalog, icons, Modal, ScenarioCards } from "./scenario-panels";

import { MobileDock, useCompactViewport, type StudioDialog as Dialog } from "./mobile-navigation";
import { compactViewport } from "../lib/compact-screen";
type Drive = "tilt" | "translate" | "twist";
type Engine = { sim: Simulation; scene: LabScene; apps: ApplicationSession };
const drives = [
  { id: "tilt", label: "傾斜", axes: ["ROLL", "PITCH"] },
  { id: "translate", label: "平移", axes: ["X", "Y"] },
  { id: "twist", label: "升降與旋轉", axes: ["YAW", "HEAVE"] },
] as const;
const cameras = [
  ["orbit", "透視"],
  ["top", "俯視"],
  ["front", "正面"],
  ["side", "側面"],
  ["actuator", "特寫"],
  ["cinematic", "環拍"],
];
const nice = (v: number, n = 1) =>
  Math.abs(v) < 0.5 * Math.pow(0.1, n) ? (0).toFixed(n) : v.toFixed(n);
const statusText: Record<string, string> = {
  NOMINAL: "運作正常",
  "LIMIT APPROACH": "接近限制",
  "EMERGENCY STOP": "緊急制動",
  "E-STOP": "緊急制動",
};
function AxisMap({ scene }: { scene?: LabScene }) {
  const az = scene?.controls.getAzimuthalAngle() ?? 0.62,
    el = scene?.controls.getPolarAngle() ?? 1.15;
  const end = (a: number) => [
    30 + 20 * Math.cos(a - az),
    29 + 15 * Math.sin(a - az) * Math.cos(el),
  ];
  const tips = [end(0), end(Math.PI / 2), [30, 29 - 19 * Math.sin(el)]];
  return (
    <svg viewBox="0 0 64 54" className="axis-map" aria-label="相機座標軸">
      {tips.map(([x, y], i) => (
        <g key={i} stroke={["#ad583e", "#638065", "#447b92"][i]}>
          <path d={"M30 29L" + x + " " + y} strokeWidth="1.7" />
          <circle cx={x} cy={y} r="2" />
          <text x={x + (i === 1 ? -7 : 3)} y={y - 2} stroke="none" fill="currentColor" fontSize="8">
            {["X", "Y", "Z"][i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
type StudioProps = {
  running: boolean;
  requestedScene: ApplicationId;
  dialog: Dialog;
  setDialog: (next: Dialog) => void;
  onSceneChange: (scene: ApplicationId, replace?: boolean) => void;
};
export default function Studio({
  running,
  requestedScene,
  dialog,
  setDialog,
  onSceneChange,
}: StudioProps) {
  const activeWorkspace = useRef(running);
  const sessionVisibility = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    activeWorkspace.current = running;
    sessionVisibility.current?.();
  }, [running]);
  const mount = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    captureWorld = useRef<(() => void) | null>(null),
    drawWorld = useRef<(() => void) | null>(null),
    engine = useRef<Engine | null>(null),
    visibleWorld = useRef<WorldId | null>(null),
    audio = useRef<ActuatorAudio | null>(null),
    soundstage = useRef<SceneSoundstage | null>(null),
    muted = useRef(false);
  useEffect(() => {
    try {
      muted.current = localStorage.getItem("hexamotion-sound") === "muted";
    } catch {}
  }, []);
  const demo = useRef(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [, refresh] = useState(0),
    [fps, setFps] = useState(0);
  const compact = useCompactViewport();
  const [drive, setDrive] = useState<Drive>("tilt"),
    [stick, setStick] = useState<Stick>({ x: 0, y: 0 }),
    [active, setActive] = useState<ApplicationId>("manual");
  const [sound, setSound] = useState(false),
    [camera, setCamera] = useState("orbit"),
    [xray, setXray] = useState(false),
    [exploded, setExploded] = useState(false),
    [throwing, setThrowing] = useState(false),
    [leg, setLeg] = useState(0),
    [toast, setToast] = useState(""),
    [mobileNav, setMobileNav] = useState(false);
  const [expanded, setExpanded] = useState(false),
    priorPause = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pushing, setPushing] = useState(false),
    [pushLine, setPushLine] = useState<{ x: number; y: number; ex: number; ey: number } | null>(
      null,
    );
  const tell = (m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2700);
  };
  useEffect(() => {
    let cancelled = false,
      raf = 0,
      sc: LabScene | undefined,
      s: Simulation | undefined;
    let startClock: (() => void) | undefined;
    async function init() {
      try {
        s = await Simulation.create();
        if (cancelled) {
          s.dispose();
          return;
        }
        sc = new LabScene(mount.current!);
        const sim = s,
          scene = sc,
          apps = new ApplicationSession(s);
        engine.current = { sim, scene, apps };
        scene.setApplication("manual");
        scene.onSelect = (i) => {
          setLeg(i);
          scene.selected = i;
          setDialog("leg");
        };
        scene.onThrow = (x, y, vx, vy) => {
          sim.launch({
            x,
            y,
            height: 0.12,
            azimuth: Math.atan2(vy, vx) / DEG,
            elevation: 0,
            speed: Math.hypot(vx, vy),
          });
          setThrowing(false);
          tell("已投球");
        };
        scene.onPose = (p) => sim.setPose(p);
        const requested = new URLSearchParams(location.search).get("scene");
        if (requested && isWorld(requested) && apps.select(requested)) {
          scene.setApplication(requested);
          setActive(requested);
        } else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          try {
            if (!sessionStorage.getItem("hexamotion-inspected")) {
              sessionStorage.setItem("hexamotion-inspected", "1");
              demo.current = 1;
              sim.setPose([0, 0, 0.501, 3.5 * DEG, -3 * DEG, 3 * DEG], false, 1.05);
            }
          } catch {}
        }
        setReady(true);
        let last = performance.now(),
          ui = last,
          clock = last,
          frames = 0,
          acc = 0,
          lastImpact = 0;
        const loop = (now: number) => {
          raf = 0;
          if (cancelled || !activeWorkspace.current || document.hidden) return;
          const elapsed = Math.min(0.1, (now - last) / 1000);
          last = now;
          if (!document.hidden && !sim.paused) {
            acc += elapsed;
            while (acc >= DT) {
              apps.tick();
              sim.tick();
              acc -= DT;
            }
          } else acc = 0;
          if (demo.current === 1 && sim.time > 1.2) {
            sim.setPose([...HOME], false, 1);
            demo.current = 2;
          }
          if (demo.current === 2 && sim.time > 2.4) demo.current = 0;
          const view = sim.view();
          scene.update(view);
          drawWorld.current?.();
          const quiet = sim.paused || sim.estop || document.hidden;
          audio.current?.update(view.actuators, quiet);
          if (audio.current?.enabled)
            soundstage.current?.update(
              apps.current.id,
              apps.world,
              quiet || visibleWorld.current !== apps.current.id,
            );
          for (const hit of sim.impacts)
            if (hit.id > lastImpact) {
              lastImpact = hit.id;
              if (!quiet) audio.current?.impact(hit.type, hit.force, hit.x);
            }
          frames++;
          if (now - clock >= 1000) {
            setFps(Math.round((frames * 1000) / (now - clock)));
            clock = now;
            frames = 0;
          }
          if (now - ui > 105) {
            refresh((r) => r + 1);
            ui = now;
          }
          raf = requestAnimationFrame(loop);
        };
        scene.update(sim.view());
        startClock = () => {
          last = performance.now();
          clock = last;
          frames = 0;
          acc = 0;
          raf = requestAnimationFrame(loop);
        };
        visibility();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    function visibility() {
      const visible = activeWorkspace.current && !document.hidden;
      sc?.setRenderingActive(visible);
      if (!visible) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) startClock?.();
      const a = audio.current;
      if (!a || !a.enabled || a.disposed) return;
      if (!visible) {
        soundstage.current?.quiet();
        void a.context.suspend().catch(() => {});
      } else void a.context.resume().catch(() => {});
    }
    sessionVisibility.current = visibility;
    document.addEventListener("visibilitychange", visibility);
    void init();
    return () => {
      cancelled = true;
      sessionVisibility.current = null;
      cancelAnimationFrame(raf);
      sc?.dispose();
      s?.dispose();
      document.removeEventListener("visibilitychange", visibility);
      soundstage.current?.dispose();
      soundstage.current = null;
      void audio.current?.dispose();
      audio.current = null;
      clearTimeout(timer.current);
      engine.current = null;
    };
  }, []);
  const e = engine.current,
    s = e?.sim,
    sc = e?.scene;
  const cancelDemo = () => {
    if (!demo.current || !s) return;
    demo.current = 0;
    s.setPose([...s.pose], false, 0.1);
  };
  const info = APPLICATIONS.find((a) => a.id === active)!,
    manual = active === "manual";
  const busy = !ready || !!s?.estop || exploded,
    stopped = !!s?.paused || !!s?.estop,
    pose = s?.pose ?? HOME;
  useEffect(() => {
    if (!sc || !s || !pushing || busy) return;
    sc.controls.enabled = false;
    const clean = bindDeckPush(sc, s, setPushLine, (j) =>
      tell("已施加 " + j.toFixed(2) + " N·s 衝量"),
    );
    return () => {
      clean();
      if (!sc.throwing) sc.controls.enabled = true;
    };
  }, [sc, s, pushing, busy]);
  const axes = drives.find((d) => d.id === drive)!.axes;
  const setPose = (p: Pose) => {
    if (!s || busy) return false;
    const ok = s.setPose(p, true, 0.13);
    if (!ok) tell("已達機構限制，請縮小手勢");
    return ok;
  };
  const input = (x: number, y: number) => {
    if (!e || busy || (isWorld(active) && stopped)) return;
    if (!manual) {
      e.apps.setInput(x, y);
      setStick({ x, y });
      return;
    }
    const p = [...e.sim.target] as Pose;
    if (drive === "tilt") {
      p[3] = x * 10 * DEG;
      p[4] = y * 10 * DEG;
    } else if (drive === "translate") {
      p[0] = x * 0.07;
      p[1] = y * 0.07;
    } else {
      p[5] = x * 14 * DEG;
      p[2] = HOME[2] + y * 0.085;
    }
    if (setPose(p)) setStick({ x, y });
  };
  const twist = (height: number, yaw: number) => {
    if (!manual || !s || busy) return;
    const p = [...s.target] as Pose;
    p[2] = clamp(p[2] + height, 0.395, 0.565);
    p[5] = clamp(p[5] + yaw, -14 * DEG, 14 * DEG);
    if (setPose(p) && drive === "twist")
      setStick({ x: p[5] / (14 * DEG), y: (p[2] - HOME[2]) / 0.085 });
  };
  const home = () => {
    if (!e || busy || (isWorld(active) && stopped)) return;
    if (!manual) e.apps.setInput(0, 0);
    else e.sim.home();
    setStick({ x: 0, y: 0 });
    tell(manual ? "六軸指令已回原點" : "場景輸入已置中");
  };
  const changeDrive = (next: Drive) => {
    setDrive(next);
    const t = s?.target ?? HOME;
    setStick(
      next === "tilt"
        ? { x: t[3] / (10 * DEG), y: t[4] / (10 * DEG) }
        : next === "translate"
          ? { x: t[0] / 0.07, y: t[1] / 0.07 }
          : { x: t[5] / (14 * DEG), y: (t[2] - HOME[2]) / 0.085 },
    );
  };
  const select = (id: ApplicationId, userAction = true) => {
    if (!e) return;
    if (s?.estop) {
      if (!userAction) onSceneChange(active, true);
      tell("請先解除制動再切換場景");
      return;
    }
    if (exploded) {
      e.scene.exploded = false;
      e.sim.paused = priorPause.current;
      setExploded(false);
    }
    e.scene.cancelThrow();
    setPushing(false);
    setThrowing(false);
    demo.current = 0;
    if (!e.apps.select(id)) return;
    e.scene.setApplication(id);
    if (id !== "manual" && userAction) enableSceneSound();
    setActive(id);
    setStick({ x: 0, y: 0 });
    setDrive("tilt");
    if (userAction) onSceneChange(id);
    setMobileNav(false);
    if (id === "manual") e.sim.home();
    if (!userAction || matchMedia(compactViewport).matches) return;
    requestAnimationFrame(() => {
      const b = workspace.current?.getBoundingClientRect();
      if (b && (b.top < 0 || b.top > innerHeight))
        workspace.current?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
        });
    });
  };
  useEffect(() => {
    if (running && ready && engine.current && requestedScene !== engine.current.apps.current.id)
      select(requestedScene, false);
  }, [requestedScene, ready, running]);
  const stop = () => {
    if (!s || !e) return;
    if (s.estop) {
      s.release();
      if (!manual) {
        e.apps.select(active);
        setStick({ x: 0, y: 0 });
      }
      tell(manual ? "制動已解除" : "制動已解除，場景重新開始");
    } else {
      s.stop();
      sc?.cancelThrow();
      setThrowing(false);
      setPushing(false);
      tell("致動器已制動");
    }
    refresh((r) => r + 1);
  };
  const pause = () => {
    if (!s || exploded) return;
    s.paused = !s.paused;
    refresh((r) => r + 1);
  };
  async function audioMode(on: boolean) {
    try {
      const a = (audio.current ??= new ActuatorAudio());
      soundstage.current ??= new SceneSoundstage(a.context, a.master);
      if (!on) soundstage.current.quiet();
      await a.setEnabled(on);
      if (a.enabled && (!activeWorkspace.current || document.hidden)) {
        soundstage.current.quiet();
        await a.context.suspend();
      }
      setSound(a.enabled);
    } catch {
      if (audio.current) audio.current.enabled = false;
      setSound(false);
      tell("瀏覽器未能啟動音訊，請再次點選喇叭");
    }
  }
  function enableSceneSound() {
    if (muted.current) return;
    if (!audio.current?.enabled) void audioMode(true);
    else if (audio.current.context.state === "suspended")
      void audio.current.context.resume().catch(() => {});
  }
  function audioSwitch() {
    const on = !audio.current?.enabled;
    muted.current = !on;
    try {
      localStorage.setItem("hexamotion-sound", on ? "enabled" : "muted");
    } catch {}
    void audioMode(on);
  }
  function engage(event: React.SyntheticEvent) {
    cancelDemo();
    if (
      !manual &&
      !stopped &&
      (event.target as Element)?.closest?.(".world-window,.scene-controls") &&
      !(event.target as Element)?.closest?.("[data-sound-toggle]")
    )
      enableSceneSound();
  }
  const tool = (id: string) => {
    if (!e) return;
    const sc = e.scene;
    if (id !== "xray") setPushing(id === "push" && !pushing);
    if (id === "push") {
      sc.cancelThrow();
      setThrowing(false);
      if (!pushing) tell("在台面拖出施力向量，放開即可推動平台");
    }
    if (id === "orbit") {
      sc.cancelThrow();
      setThrowing(false);
      sc.preset("orbit");
      setCamera("orbit");
    }
    if (id === "throw") {
      if (busy) return;
      if (throwing) {
        sc.cancelThrow();
        setThrowing(false);
      } else {
        sc.throwing = true;
        sc.controls.enabled = false;
        setThrowing(true);
        tell("按住台面選位置，拖曳後放開投球");
      }
    }
    if (id === "xray") {
      sc.setXray(!xray);
      setXray(!xray);
    }
    if (id === "explode") {
      sc.cancelThrow();
      setThrowing(false);
      if (!exploded) priorPause.current = e.sim.paused;
      sc.exploded = !exploded;
      e.sim.paused = !exploded || priorPause.current;
      setExploded(!exploded);
    }
  };
  useEffect(() => {
    function key(k: KeyboardEvent) {
      if (!activeWorkspace.current) return;
      if ((k.target as HTMLElement)?.closest('input,button,a,select,dialog,[tabindex="0"]:not(.world-window)')) return;
      if (dialog) return;
      if (k.code === "Space") {
        k.preventDefault();
        pause();
      } else if (k.key === "Home") {
        k.preventDefault();
        home();
      } else if (k.key === "Escape") {
        setExpanded(false);
        setMobileNav(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const screen = () => {
    setExpanded((v) => !v);
  };
  const snap = () => {
    if (!sc) return;
    const link = document.createElement("a");
    link.href = sc.screenshot();
    link.download = "HEXAMOTION-HX06.png";
    link.click();
    tell("已匯出 3D 畫面");
  };
  const navDialog = (d: Dialog) => {
    setMobileNav(false);
    setDialog(d);
  };
  const actValues = s?.actuators ?? [];
  const sheetStop = compact && (
    <button
      className="sheet-stop"
      disabled={!ready}
      onClick={stop}
      aria-label={s?.estop ? "解除制動" : "緊急停止"}
      aria-pressed={!!s?.estop}
    >
      <CircleStop size={17} />
      {s?.estop ? "解鎖" : "急停"}
    </button>
  );
  const navigation = compact ? (
    <MobileDock
      current={dialog}
      choose={(panel) => {
        if (dialog === "leg" && sc) sc.selected = -1;
        setDialog(panel);
      }}
    />
  ) : undefined;
  function mobileTool(action: () => void) {
    action();
    setDialog(null);
  }
  function inspectLeg(index: number) {
    setLeg(index);
    if (sc) sc.selected = index;
    setDialog("leg");
  }
  const describeTool = throwing ? "投球" : pushing ? "推台" : exploded ? "分解" : "";
  const SceneIcon = icons[active];
  const mobileHeaderState = s?.estop ? "制動中" : s?.paused ? "已暫停" : describeTool;
  return (
    <div
      className="studio"
      onPointerDownCapture={engage}
      onClickCapture={engage}
      onKeyDownCapture={engage}
    >
      <header className="mobile-head">
        <div className="mobile-identity">
          <SceneIcon aria-hidden="true" />
          <div>
            <small>{mobileHeaderState || info.en.toUpperCase()}</small>
            <h1>{info.title}</h1>
          </div>
        </div>
        <div className="mobile-actions">
          <button
            type="button"
            data-sound-toggle
            aria-label={sound ? "關閉音效" : "開啟音效"}
            aria-pressed={sound}
            onClick={audioSwitch}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            type="button"
            disabled={!ready || exploded || !!s?.estop}
            aria-label={s?.paused ? "繼續模擬" : "暫停模擬"}
            onClick={pause}
          >
            {s?.paused ? <Play /> : <Pause />}
          </button>
          <button
            type="button"
            className={"m-stop" + (s?.estop ? " engaged" : "")}
            aria-label={s?.estop ? "解除制動" : "緊急停止"}
            aria-pressed={!!s?.estop}
            disabled={!ready}
            onClick={stop}
          >
            <CircleStop />
            <span>{s?.estop ? "解鎖" : "急停"}</span>
          </button>
        </div>
      </header>
      <header className="mast">
        <div className="mast-inner">
          <nav aria-label="控制艙工具" className={mobileNav ? "mast-nav open" : "mast-nav"}>
            <button
              className={dialog === "catalog" ? "nav-active" : ""}
              onClick={() => navDialog("catalog")}
            >
              <Layers3 size={16} />
              場景庫
            </button>
            <button
              className={dialog === "tools" ? "nav-active" : ""}
              onClick={() => navDialog("tools")}
            >
              <SlidersHorizontal size={16} />
              實驗工具
            </button>
          </nav>
          <div className="mast-right">
            <button
              data-sound-toggle
              aria-pressed={sound}
              onClick={audioSwitch}
              className={"icon-btn" + (sound ? " lit" : "")}
              aria-label={sound ? "關閉音效" : "開啟音效"}
              title={sound ? "關閉音效" : "開啟音效"}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </button>
            <button
              onClick={() => navDialog("help")}
              className="icon-btn"
              aria-label="手勢指南"
              title="手勢指南"
            >
              <CircleHelp />
            </button>
            <i />
            <button
              className={"estop" + (s?.estop ? " engaged" : "")}
              onClick={stop}
              disabled={!ready}
            >
              <CircleStop size={16} />
              {s?.estop ? "解除制動" : "緊急停止"}
            </button>
            <button
              onClick={() => setMobileNav((v) => !v)}
              className="mobile-menu icon-btn"
              aria-label="導覽選單"
            >
              <Menu />
            </button>
          </div>
        </div>
      </header>
      <main className="studio-main">
        <div className="page-head">
          <div>
            <span className="eyebrow">
              <i />
              MOTION WORKSPACE
            </span>
            <h1>六軸運動控制艙</h1>
          </div>
          <button className="engine-status" onClick={() => setDialog("telemetry")}>
            <span className={"signal " + (!ready || stopped ? "off" : "")} />
            {!ready
              ? "引擎啟動中"
              : s?.estop
                ? "致動器制動"
                : s?.paused
                  ? "模擬已暫停"
                  : demo.current
                    ? "啟動行程自檢"
                    : "物理引擎運行中"}
            <b>240 Hz</b>
          </button>
        </div>
        <div className={isWorld(active) ? "workspace has-world" : "workspace"} ref={workspace}>
          {e && isWorld(active) && (
            <WorldScreen
              id={active}
              apps={e.apps}
              rig={e.scene}
              sound={sound}
              toggleSound={audioSwitch}
              visibleWorld={visibleWorld}
              drawRef={drawWorld}
              captureRef={captureWorld}
              stopped={stopped}
              onInput={input}
              stick={stick}
              inputDisabled={busy || stopped || !running}
            />
          )}
          <div className={"viewer" + (expanded ? " expanded" : "")} ref={stage}>
            <div className="view-head">
              <div>
                <Box size={17} />
                <h2>{isWorld(active) ? "同步平台" : "機構視窗"}</h2>
                {isWorld(active) && <span className="rig-interaction">{pushing ? "拖曳推台" : throwing ? "拖曳投球" : "拖曳環視"}</span>}
                <span className="label-en">3D VIEWPORT</span>
              </div>
              <div className="view-actions">
                <label className="select-cam">
                  <Compass size={15} />
                  <select
                    aria-label="相機視角"
                    value={camera}
                    onChange={(v) => {
                      sc?.preset(v.target.value);
                      setCamera(v.target.value);
                    }}
                  >
                    {cameras.map(([v, t]) => (
                      <option value={v} key={v}>
                        {t}視角
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <i />
                <button
                  className="icon-btn"
                  onClick={snap}
                  title="擷取畫面"
                  aria-label="擷取畫面"
                  disabled={!ready}
                >
                  <Camera />
                </button>
                <button
                  className="icon-btn"
                  onClick={screen}
                  title={expanded ? "縮小視窗" : "放大視窗"}
                  aria-label={expanded ? "縮小視窗" : "放大視窗"}
                >
                  {expanded ? <X /> : <Expand />}
                </button>
              </div>
            </div>
            <div className={"stage" + (throwing ? " throw" : "")}>
              <div className="webgl" ref={mount} />
              <div className="model-id">
                <span>
                  <i /> HEXAPOD SYSTEM
                </span>
                <strong>HX–06</strong>
                <small>STEWART PLATFORM</small>
              </div>
              <div className={"live" + (stopped ? " idle" : "")}>
                <i />
                {s?.paused ? "PAUSED" : s?.estop ? "BRAKE" : ready ? "LIVE" : "LOAD"}
              </div>
              <div className="axis">
                <AxisMap scene={sc} />
              </div>
              {!ready && (
                <div className="loading" role="status">
                  {error ? (
                    <>
                      <strong>3D 引擎無法啟動</strong>
                      <p>{error}</p>
                      <button onClick={() => location.reload()}>重新載入</button>
                    </>
                  ) : (
                    <>正在初始化剛體與機構…</>
                  )}
                </div>
              )}
              {e && !manual && (!isWorld(active) || expanded) && (
                <ApplicationInstrument sim={e.sim} apps={e.apps} />
              )}
              {sc &&
                manual &&
                !pushing &&
                !throwing &&
                camera === "orbit" &&
                (["plate", "actuator"] as const).map((part) => {
                  const a = sc.projectAnchor(part);
                  return (
                    <div
                      key={part}
                      className={"machine-tag " + part}
                      style={{ left: a.x * 100 + "%", top: a.y * 100 + "%" }}
                    >
                      <i />
                      <button
                        onClick={() => {
                          if (part === "plate") setDialog("telemetry");
                          else {
                            setLeg(3);
                            sc.selected = 3;
                            setDialog("leg");
                          }
                        }}
                      >
                        <small>{part === "plate" ? "MOVING PLATE" : "LINEAR ACTUATOR"}</small>
                        <b>
                          {part === "plate" ? "載台高度" : "A04 腿長"}{" "}
                          <em>
                            {nice(
                              part === "plate"
                                ? pose[2] * 1000
                                : (actValues[3]?.length ?? 0) * 1000,
                            )}{" "}
                            mm
                          </em>
                        </b>
                      </button>
                    </div>
                  );
                })}
              {pushLine && (
                <svg className="push-preview" width="100%" height="100%">
                  <line
                    x1={pushLine.x}
                    y1={pushLine.y}
                    x2={pushLine.ex}
                    y2={pushLine.ey}
                    stroke="#ce4d23"
                    strokeWidth="3"
                    strokeDasharray="6 2"
                  />
                  <circle cx={pushLine.x} cy={pushLine.y} r="5" fill="#ff7d43" />
                  <circle
                    cx={pushLine.ex}
                    cy={pushLine.ey}
                    r="9"
                    fill="none"
                    stroke="#ad3c17"
                    strokeWidth="2"
                  />
                </svg>
              )}
              <div className="view-toolbar">
                <button
                  className={!throwing && !pushing ? "active" : ""}
                  onClick={() => tool("orbit")}
                  aria-pressed={!throwing && !pushing}
                >
                  <Orbit />
                  環視
                </button>
                <button
                  className={throwing ? "active" : ""}
                  disabled={busy}
                  onClick={() => tool("throw")}
                  aria-pressed={throwing}
                >
                  <Target />
                  投球
                </button>
                <button
                  className={pushing ? "active" : ""}
                  disabled={busy}
                  onClick={() => tool("push")}
                  aria-pressed={pushing}
                >
                  <Hand />
                  推台
                </button>
                <em />
                <button
                  className={xray ? "active" : ""}
                  onClick={() => tool("xray")}
                  aria-pressed={xray}
                >
                  <Scan />
                  透視
                </button>
                <button
                  className={exploded ? "active" : ""}
                  onClick={() => tool("explode")}
                  aria-pressed={exploded}
                >
                  <Layers3 />
                  分解
                </button>
              </div>
            </div>
            <div className="view-foot">
              <span>
                <Hand size={15} />
                {exploded
                  ? "分解檢視 · 模擬已暫停"
                  : throwing
                    ? "拖曳台面並放開投球"
                    : pushing
                      ? "輕點敲擊 · 拖曳台面施加偏心衝量"
                      : "拖曳環視 · 滾輪或雙指縮放"}
              </span>
              <div>
                {manual && (
                  <button
                    className={"center-btn" + (s?.auto ? " on" : "")}
                    disabled={busy}
                    aria-pressed={!!s?.auto}
                    onClick={() => {
                      s?.setAuto(!s.auto);
                      refresh((r) => r + 1);
                    }}
                  >
                    <Crosshair size={13} />
                    {s?.auto ? "置中控制中" : "自動置中"}
                  </button>
                )}
                <button
                  className="tiny-btn"
                  onClick={pause}
                  disabled={exploded || !s}
                  aria-label={s?.paused ? "繼續模擬" : "暫停模擬"}
                >
                  {s?.paused ? <Play size={13} /> : <Pause size={13} />}
                </button>
                <span className="simtime">
                  {String(Math.floor((s?.time ?? 0) / 60)).padStart(2, "0")}:
                  {String(Math.floor((s?.time ?? 0) % 60)).padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>
          <aside className="right-panel">
            <button
              className="mobile-guide"
              onClick={() => setDialog("help")}
              aria-label="操作提示"
            >
              <CircleHelp size={18} />
              <span>操作提示</span>
            </button>
            <div className="panel-title">
              <div>
                <Crosshair size={18} />
                <h2>{manual ? "手勢控制" : "場景觀測"}</h2>
              </div>
              <button
                className="icon-btn"
                onClick={() => setDialog("help")}
                aria-label="控制盤操作說明"
                title="控制盤操作說明"
              >
                <CircleHelp />
              </button>
            </div>
            {manual ? (
              <div className="drive-tabs" aria-label="控制軸組">
                {drives.map((d) => (
                  <button
                    key={d.id}
                    aria-pressed={drive === d.id}
                    className={drive === d.id ? "on" : ""}
                    onClick={() => changeDrive(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="active-scene">
                <span>{info.title}</span>
                <button onClick={() => select("manual")} title="返回自由操控">
                  <X size={13} />
                  退出場景
                </button>
              </div>
            )}
            {isWorld(active) && (
              <div className="world-guidance">
                {info.description}
                {e && (
                  <div className="world-metric">
                    {active === "flight" || active === "driving" || active === "rail" ? (
                      <>
                        <span>{active === "flight" ? "地速" : "車速"}</span>
                        <strong>{nice(e.apps.world.speed * 3.6, 0)} km/h</strong>
                      </>
                    ) : active === "marine" ? (
                      <>
                        <span>船舶升沉</span>
                        <strong>{nice(e.apps.world.baseHeave * 100, 2)} m</strong>
                      </>
                    ) : (
                      <span>
                        {active === "seismic" ? "樓層側移放大 90 倍" : e.apps.metric.detail}
                      </span>
                    )}
                    {info.source && (
                      <a href={info.source.url} target="_blank" rel="noreferrer">
                        外部應用依據 ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            {e && isWorld(active) ? (
              <SceneInputPanel
                key={active}
                axes={info.axes}
                help={() => setDialog("help")}
                id={active}
                value={stick}
                onMove={input}
                onCenter={home}
                disabled={busy || stopped || !running}
                frame={e.apps.world}
              />
            ) : (
              <>
                <div className="disc-area">
                  <div className="axis-digits">
                    <small>{manual ? axes[0] : info.axes[0]}</small>
                    <b>
                      {manual
                        ? nice(
                            drive === "tilt"
                              ? pose[3] / DEG
                              : drive === "translate"
                                ? pose[0] * 1000
                                : pose[5] / DEG,
                          )
                        : nice(stick.x * 100, 0)}
                    </b>
                    <em>{manual ? (drive === "translate" ? "mm" : "deg") : "%"}</em>
                  </div>
                  <GestureDisc
                    value={stick}
                    disabled={!running || busy || (isWorld(active) && stopped)}
                    onMove={input}
                    onTwist={twist}
                    onCenter={home}
                    axes={manual ? axes : info.axes}
                  />
                  <div className="axis-digits">
                    <small>{manual ? axes[1] : info.axes[1]}</small>
                    <b>
                      {manual
                        ? nice(
                            drive === "tilt"
                              ? pose[4] / DEG
                              : drive === "translate"
                                ? pose[1] * 1000
                                : (pose[2] - HOME[2]) * 1000,
                          )
                        : nice(stick.y * 100, 0)}
                    </b>
                    <em>{manual ? (drive === "tilt" ? "deg" : "mm") : "%"}</em>
                  </div>
                </div>
                <div className="disc-caption">
                  <span>
                    <Hand size={14} />
                    {manual ? "拖曳圓盤操控 · 雙點歸零" : "拖曳圓盤調整場景輸入"}
                  </span>
                  <button title="控制歸零" aria-label="控制歸零" onClick={home}>
                    <RotateCcw size={14} />
                  </button>
                </div>
              </>
            )}
            <div className="act-section">
              <div className="act-head">
                <div>
                  <Activity size={16} />
                  <h3>致動器行程</h3>
                </div>
                <span>mm</span>
              </div>
              <div className="act-rows">
                {Array.from({ length: 6 }, (_, i) => {
                  const a = actValues[i],
                    pct =
                      a && s
                        ? clamp(
                            ((a.length - s.geometry.minLength) /
                              (s.geometry.maxLength - s.geometry.minLength)) *
                              100,
                            0,
                            100,
                          )
                        : 0;
                  return (
                    <button key={i} title={"檢視 A0" + (i + 1)} onClick={() => inspectLeg(i)}>
                      <span>A0{i + 1}</span>
                      <span className="track">
                        <i style={{ width: pct + "%" }} />
                      </span>
                      <b>{a ? nice(a.length * 1000, 1) : "—"}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
        {s && (s.objects.length > 0 || s.auto) && (
          <div className="ball-strip">
            <span>
              <Target size={16} />
              球體追蹤 <b>{s.objects.length}</b>
            </span>
            <span>
              {!s.ball
                ? "等待投球"
                : s.ball.lost
                  ? "已離開可控範圍"
                  : s.ball.airborneCount
                    ? "球體騰空"
                    : s.auto
                      ? "正在置中"
                      : "量測中"}
            </span>
            {s.ball && (
              <span>
                中心距離 <b>{nice(s.ball.error * 1000)} mm</b> · 球速{" "}
                <b>{nice(s.ball.speed * 1000)} mm/s</b>
              </span>
            )}
            <button
              disabled={!s.objects.length}
              onClick={() => {
                s.clearObjects();
                refresh((r) => r + 1);
                tell("已清空球體");
              }}
            >
              清空球體
            </button>
          </div>
        )}
        <ScenarioCards selected={active} choose={select} showAll={() => setDialog("catalog")} />
        <footer className="bottom">
          <span>
            <span className="signal" />{" "}
            {ready ? (statusText[s?.status ?? ""] ?? s?.status) : "連線中"}
            <i />
            Rapier 3D
            <i />
            IK · 6 DOF
          </span>
          <nav className="footer-links">
            <a href="/?reference=verification">
              <Activity size={14} />
              驗證紀錄
            </a>
            <a href="/?reference=manual">
              <BookOpen size={14} />
              系統手冊
            </a>
          </nav>
        </footer>
      </main>
      {navigation}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {dialog === "catalog" && (
        <Modal
          quickStop={sheetStop}
          navigation={navigation}
          title="選擇應用場景"
          kicker="SCENARIO LIBRARY"
          close={() => setDialog(null)}
          wide
        >
          <Catalog compact={compact} selected={active} choose={select} />
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          quickStop={sheetStop}
          navigation={navigation}
          title="手勢指南"
          kicker="GESTURE GUIDE"
          close={() => setDialog(null)}
        >
          <div className="guide">
            {isWorld(active) && (
              <>
                <div><Hand size={20} /><div><h3>在實景上操控</h3><p>{worldGuides[active].single}。從畫面任意位置開始，放開會保持指令，雙點實景回中。</p></div></div>
                <div><Gamepad2 size={20} /><div><h3>雙指操作</h3><p>{worldGuides[active].pair}</p></div></div>
                <div><SlidersHorizontal size={20} /><div><h3>精密操控 · {sceneGestureInfo[active].name}</h3><p>展開輸入回饋旁的「精密操控」可使用專屬儀器。{sceneGestureInfo[active].hint}</p></div></div>
                <div><Crosshair size={20} /><div><h3>滑鼠與鍵盤</h3><p>按住 Shift 拖曳實景可降低靈敏度。聚焦實景後用方向鍵微調，按 Home 歸零。</p></div></div>
              </>
            )}
            {[
              [
                "拖曳控制盤",
                "選「傾斜」、「平移」或「升降與旋轉」，將橘色游標拖向目標。放開會保持指令。",
              ],
              [
                "雙指開合與旋轉",
                "自由操控時，把兩指放在圓盤上。張開或合攏可升降平台，兩指旋轉可改變偏航。",
              ],
              [
                "雙點歸零",
                "在圓盤任一位置連點兩下，六軸回到校正原點。鍵盤可用方向鍵微調、Home 歸零。",
              ],
              [
                "拖曳投球",
                "選擇視窗下方的「投球」，按住台面選起點，拖曳看預測方向及落點，放開即投出。",
              ],
              [
                "偏心推台",
                "選「推台」，輕點台面可敲擊，拖遠再放開會在接觸點施加更大的衝量。觀察伺服如何抵抗外力。",
              ],
              ["檢視機構", "在視窗拖曳環視、雙指縮放。選一支致動器可檢查其長度、速度與負載。"],
            ].filter((_, index) => manual || index >= 3).map(([a, b]) => (
              <div key={a}>
                <Hand size={17} />
                <div>
                  <h3>{a}</h3>
                  <p>{b}</p>
                </div>
              </div>
            ))}
          </div>
          {compact && info.source && (
            <a className="doc-link" href={info.source.url} target="_blank" rel="noreferrer">
              <BookOpen size={16} />
              目前場景的外部應用依據
            </a>
          )}
          <a className="doc-link" href="/?reference=manual">
            <BookOpen size={16} />
            完整操作與演算法手冊
          </a>
        </Modal>
      )}
      {dialog === "tools" && (
        <Modal
          quickStop={sheetStop}
          navigation={navigation}
          title="實驗工具"
          kicker="EXPERIMENT TOOLKIT"
          close={() => setDialog(null)}
        >
          {compact && (
            <>
              <section className="sheet-tools">
                <h3>平台操作</h3>
                <div className="machine-choices">
                  {[
                    ["orbit", "環視", Orbit, !pushing && !throwing],
                    ["throw", "投球", Target, throwing],
                    ["push", "推台", Hand, pushing],
                    ["xray", "透視", Scan, xray],
                    ["explode", "分解", Layers3, exploded],
                  ].map((item) => {
                    const [id, label, Icon, on] = item as [string, string, typeof Orbit, boolean];
                    return (
                      <button
                        key={id}
                        disabled={!ready || ((id === "throw" || id === "push") && busy)}
                        aria-pressed={on}
                        onClick={() => mobileTool(() => tool(id))}
                      >
                        <Icon size={19} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="mobile-command-list">
                  <label>
                    <Compass />
                    <span>平台視角</span>
                    <select
                      aria-label="選擇平台視角"
                      value={camera}
                      onChange={(event) =>
                        mobileTool(() => {
                          sc?.preset(event.target.value);
                          setCamera(event.target.value);
                        })
                      }
                    >
                      {cameras.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={!ready} onClick={() => mobileTool(screen)}>
                    <Expand />
                    <span>放大平台</span>
                  </button>
                  <button
                    disabled={!ready || (!manual && !captureWorld.current)}
                    onClick={() => mobileTool(() => (manual ? snap() : captureWorld.current?.()))}
                  >
                    <Camera />
                    <span>{manual ? "擷取平台" : "擷取雙視窗"}</span>
                  </button>
                  <button onClick={() => setDialog("help")}>
                    <CircleHelp />
                    <span>手勢指南</span>
                  </button>
                  {manual && (
                    <button
                      disabled={busy}
                      aria-pressed={!!s?.auto}
                      onClick={() => mobileTool(() => s?.setAuto(!s.auto))}
                    >
                      <Crosshair />
                      <span>{s?.auto ? "停止自動置中" : "自動置中"}</span>
                    </button>
                  )}
                  {!!s?.objects.length && (
                    <button
                      onClick={() =>
                        mobileTool(() => {
                          s.clearObjects();
                          tell("已清空球體");
                        })
                      }
                    >
                      <Target />
                      <span>清空球體（{s.objects.length}）</span>
                    </button>
                  )}
                </div>
              </section>
              <h3 className="sheet-section-heading">進階工作臺</h3>
            </>
          )}
          <div className="tools-list">
            {!compact && (
              <button onClick={() => setDialog("telemetry")}>
                <Activity />
                <span>
                  <b>即時遙測</b>
                  <small>觀察本次控制艙的姿態與追蹤誤差</small>
                </span>
                <ChevronRight />
              </button>
            )}
            {[
              ["engineering", "工程工作台", "參數、控制器、故障注入、示波器與實驗匯出"],
              ["free", "物理遊樂場", "多球置中、負載、物理投擲與圓周運動"],
              ["path", "手繪循跡", "畫出路徑，讓平台傾斜引導球體"],
              ["maze", "迷宮與挑戰", "手動傾斜平台、通過檢查點與計時關卡"],
              ["film", "影片工作室", "橫式或直式鏡位、物理字幕與影片下載"],
            ].map(([id, t, d], i) => {
              const I = [SlidersHorizontal, Gamepad2, Waypoints, Target, Video][i];
              return (
                <a
                  key={id}
                  href={"/?panel=" + id + (active !== "manual" ? "&scene=" + active : "")}
                >
                  <I />
                  <span>
                    <b>{t}</b>
                    <small>{d}</small>
                  </span>
                  <ChevronRight />
                </a>
              );
            })}
          </div>
          {compact ? (
            <div className="sheet-links">
              <a href="/?reference=verification">驗證紀錄</a>
              <a href="/?reference=manual">系統手冊</a>
            </div>
          ) : null}
        </Modal>
      )}
      {dialog === "leg" && (
        <Modal
          quickStop={sheetStop}
          navigation={navigation}
          title={"致動器 A0" + (leg + 1)}
          kicker="ACTUATOR INSPECTOR"
          close={() => {
            setDialog(null);
            if (sc) sc.selected = -1;
          }}
        >
          <div className="detail-metrics">
            {[
              ["實際長度", nice((actValues[leg]?.length ?? 0) * 1000, 2), "mm"],
              ["命令長度", nice((actValues[leg]?.command ?? 0) * 1000, 2), "mm"],
              ["軸向推力", nice(actValues[leg]?.force ?? 0, 2), "N"],
              ["伸縮速度", nice((actValues[leg]?.velocity ?? 0) * 1000, 2), "mm/s"],
            ].map(([a, b, c]) => (
              <div key={a}>
                <small>{a}</small>
                <b>
                  {b} <em>{c}</em>
                </b>
              </div>
            ))}
          </div>
          <div className="leg-detail">
            <label htmlFor="legInput">手動調整腿長</label>
            <input
              aria-label="目標腿長"
              id="legInput"
              type="range"
              disabled={busy || !manual}
              min={s?.geometry.minLength}
              max={s?.geometry.maxLength}
              step=".0005"
              value={actValues[leg]?.target ?? 0}
              onChange={(v) => {
                if (s && !s.setActuator(leg, Number(v.target.value)))
                  tell("此腿長組合超過工作範圍");
                refresh((r) => r + 1);
              }}
            />
            <small>
              {manual ? "調整一支致動器，其餘五支保留長度指令。" : "返回自由操控可獨立調整腿長。"}
            </small>
          </div>
        </Modal>
      )}
      {dialog === "telemetry" && (
        <Modal
          quickStop={sheetStop}
          navigation={navigation}
          title="即時遙測"
          kicker="LIVE TELEMETRY"
          close={() => setDialog(null)}
        >
          <div className="detail-metrics">
            {[
              ["X 位移", nice(pose[0] * 1000, 2), "mm"],
              ["Y 位移", nice(pose[1] * 1000, 2), "mm"],
              ["升降", nice((pose[2] - HOME[2]) * 1000, 2), "mm"],
              ["橫滾", nice(pose[3] / DEG, 2), "°"],
              ["俯仰", nice(pose[4] / DEG, 2), "°"],
              ["偏航", nice(pose[5] / DEG, 2), "°"],
            ].map(([a, b, c]) => (
              <div key={a}>
                <small>{a}</small>
                <b>
                  {b} <em>{c}</em>
                </b>
              </div>
            ))}
          </div>
          {compact && (
            <section className="sheet-legs">
              <h3>
                致動器行程 <small>mm</small>
              </h3>
              <div>
                {actValues.map((a, i) => (
                  <button key={i} onClick={() => inspectLeg(i)}>
                    <small>{"A0" + (i + 1)}</small>
                    <b>{nice(a.length * 1000, 1)}</b>
                  </button>
                ))}
              </div>
            </section>
          )}
          <History sim={s} />
          <div className="engineering-line">
            <span>
              物理步長 <b>1/240 s</b>
            </span>
            <span>
              畫面 <b>{fps} FPS</b>
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
function History({ sim }: { sim?: Simulation }) {
  const rows = (sim?.history ?? []).slice(-180);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pitch)));
  const path = rows
    .map(
      (r, i) =>
        (i === 0 ? "M" : "L") +
        ((i * 400) / Math.max(rows.length - 1, 1)).toFixed(1) +
        " " +
        (32 - (26 * r.pitch) / max).toFixed(1),
    )
    .join(" ");
  return (
    <div className="history">
      <span>
        俯仰角歷程 <b>±{nice(max, 1)}°</b>
      </span>
      <svg viewBox="0 0 400 64" preserveAspectRatio="none">
        <path d="M0 16H400M0 32H400M0 48H400" stroke="#394043" fill="none" />
        <path d={path} stroke="#ff814a" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}
