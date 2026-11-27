/// <reference types="vite/client"/>
import { useImperativeHandle, useEffect, useRef, useState, type MutableRefObject } from "react";
import { SeismicTrace } from "./seismic-trace";
import { Camera, Clapperboard, ExternalLink, Volume2, VolumeX } from "lucide-react";
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WorldCue } from "./world-cue";
import { useWorldGesture } from "./use-world-gesture";
import { worldDisplay, reading } from "../lib/worlds/display";
import { soundLabels } from "../lib/scene-sound";
import type { ApplicationSession } from "../lib/applications";
import type { LabScene } from "../lib/scene";
import type { WorldView, WorldId } from "../lib/worlds/types";
import "./world-screen.css";

const scenes = import.meta.glob<Record<string, (manager: T.LoadingManager) => WorldView>>(
  "../lib/worlds/{flight,driving,marine,seismic,optics,docking,rail,cinema,camera,balance,machining,vibration,photonics}.ts",
);
const names: Partial<Record<WorldId, string>> = {
  flight: "createFlightWorld",
  driving: "createDrivingWorld",
  marine: "createMarineWorld",
  seismic: "createSeismicWorld",
};
function release(world: WorldView) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  world.scene.traverse((o) => {
    if (o instanceof T.DirectionalLight || o instanceof T.SpotLight || o instanceof T.PointLight)
      o.shadow.dispose();
    const m = o as T.Mesh;
    if (!m.geometry || !m.material) return;
    geometries.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      materials.add(mat);
      for (const prop of Object.values(mat)) if (prop instanceof T.Texture) textures.add(prop);
      if (mat instanceof T.ShaderMaterial)
        for (const u of Object.values(mat.uniforms))
          if (u?.value instanceof T.Texture) textures.add(u.value);
    }
  });
  world.dispose?.();
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  world.scene.clear();
}
export function WorldScreen({
  id,
  apps,
  rig,
  drawRef,
  captureRef,
  stopped,
  onInput,
  stick,
  inputDisabled,
  sound,
  toggleSound,
  visibleWorld,
}: {
  sound: boolean;
  toggleSound: () => void;
  visibleWorld: MutableRefObject<WorldId | null>;
  stick: { x: number; y: number };
  onInput: (x: number, y: number) => void;
  inputDisabled: boolean;
  id: WorldId;
  apps: ApplicationSession;
  rig: LabScene;
  drawRef: MutableRefObject<(() => void) | null>;
  captureRef: MutableRefObject<(() => void) | null>;
  stopped: boolean;
}) {
  const waitingForFrame = useRef<WorldId | null>(null);
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<T.WebGLRenderer | null>(null),
    live = useRef<WorldView | null>(null),
    env = useRef<T.WebGLRenderTarget | null>(null);
  const [problem, error] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const unavailable = inputDisabled || loading || !!problem;
  const inputSurface = useWorldGesture(id, unavailable, stick, onInput);
  useEffect(() => {
    const node = host.current!;
    let gl: T.WebGLRenderer;
    try {
      gl = new T.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      error("此裝置無法建立情境視窗。");
      setLoading(false);
      return;
    }
    renderer.current = gl;
    gl.outputColorSpace = T.SRGBColorSpace;
    gl.toneMapping = T.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.03;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = T.PCFShadowMap;
    const pm = new T.PMREMGenerator(gl),
      room = new RoomEnvironment();
    env.current = pm.fromScene(room, 0.035);
    room.dispose();
    pm.dispose();
    node.appendChild(gl.domElement);
    gl.domElement.setAttribute("aria-label", "即時情境三維畫面");
    let width = 0,
      height = 0;
    function draw() {
      const world = live.current;
      if (!world || !node.isConnected || document.hidden) return;
      const w = node.clientWidth,
        h = node.clientHeight;
      if (!w || !h) return;
      if (w !== width || h !== height) {
        width = w;
        height = h;
        gl.setPixelRatio(Math.min(1.65, devicePixelRatio, Math.sqrt(1150000 / (w * h))));
        gl.setSize(w, h, false);
      }
      world.update(apps.world, w / h);
      gl.render(world.scene, world.camera);
      if (waitingForFrame.current) {
        visibleWorld.current = waitingForFrame.current;
        waitingForFrame.current = null;
        setLoading(false);
      }
    }
    drawRef.current = draw;
    const resize = new ResizeObserver(draw);
    resize.observe(node);
    return () => {
      drawRef.current = null;
      resize.disconnect();
      env.current?.dispose();
      env.current = null;
      gl.dispose();
      gl.forceContextLoss();
      gl.domElement.remove();
      renderer.current = null;
    };
  }, [apps, drawRef, retry, visibleWorld]);
  useEffect(() => {
    if (!renderer.current) return;
    let cancelled = false,
      created: WorldView | null = null;
    visibleWorld.current = null;
    waitingForFrame.current = null;
    setLoading(true);
    error("");
    const init = async () => {
      try {
        const load = scenes["../lib/worlds/" + id + ".ts"];
        if (!load) throw new Error("場景模型無法載入");
        const mod = await load();
        if (cancelled) return;
        const manager = new T.LoadingManager();
        let failed = false;
        manager.onError = () => {
          if (!cancelled) {
            failed = true;
            error("情境素材載入失敗，請重新載入。");
            setLoading(false);
          }
        };
        manager.onLoad = () => {
          if (!cancelled && !failed) {
            waitingForFrame.current = id;
            drawRef.current?.();
          }
        };
        manager.itemStart("world-assembly");
        created = mod[names[id] ?? "createWorld"](manager);
        live.current = created;
        if (!created.scene.environment) created.scene.environment = env.current!.texture;
        manager.itemEnd("world-assembly");
        drawRef.current?.();
      } catch (e) {
        if (!cancelled) {
          error(e instanceof Error ? e.message : "場景模型無法載入");
          setLoading(false);
        }
      }
    };
    void init();
    return () => {
      cancelled = true;
      visibleWorld.current = null;
      waitingForFrame.current = null;
      if (live.current === created) live.current = null;
      if (created) release(created);
    };
  }, [id, retry, drawRef, visibleWorld]);
  const cap = worldDisplay[id],
    f = apps.world;
  function capture() {
    const video = renderer.current?.domElement,
      platform = rig.renderer.domElement;
    if (!video || !live.current) return;
    const now = apps.world;
    drawRef.current?.();
    rig.renderer.render(rig.scene, rig.camera);
    const out = document.createElement("canvas");
    out.width = 1600;
    out.height = 740;
    const c = out.getContext("2d")!;
    c.fillStyle = "#1a1e20";
    c.fillRect(0, 0, out.width, out.height);
    function fit(image: HTMLCanvasElement, x: number, w: number) {
      const r = Math.min(w / image.width, 608 / image.height),
        dw = image.width * r,
        dh = image.height * r;
      c.drawImage(image, x + (w - dw) / 2, 58 + (608 - dh) / 2, dw, dh);
    }
    c.fillStyle = "#f2f2ed";
    c.font = "bold 25px system-ui";
    c.fillText("HEXAMOTION  /  " + cap.name, 20, 39);
    c.fillText("HX–06  /  六軸平台", 1067, 39);
    fit(video, 8, 1034);
    fit(platform, 1055, 537);
    c.fillStyle = "#ff996b";
    c.font = "22px system-ui";
    c.fillText(
      cap.left[0] +
        "  " +
        reading(cap.left, now) +
        "     /     " +
        cap.right[0] +
        "  " +
        reading(cap.right, now),
      22,
      715,
    );
    const a = document.createElement("a");
    a.download = "HEXAMOTION-" + id + ".png";
    a.href = out.toDataURL("image/png");
    a.click();
  }
  useImperativeHandle<(() => void) | null, (() => void) | null>(captureRef, () =>
    loading || problem ? null : capture,
  );
  return (
    <section className="world-view" aria-label={cap.name + "與平台同步"} data-world={id}>
      <header className="view-head">
        <div>
          <Clapperboard size={17} />
          <h2>{cap.name}</h2>
          <span className="label-en">{cap.label}</span>
        </div>
        <div className="view-actions">
          <button
            className={"world-sound" + (sound ? " is-on" : "")}
            data-sound-toggle
            aria-pressed={sound}
            aria-label={(sound ? "關閉" : "開啟") + soundLabels[id]}
            title={soundLabels[id]}
            onClick={toggleSound}
          >
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>聲場</span>
          </button>
          <button
            className="icon-btn"
            onClick={capture}
            disabled={loading || !!problem}
            title="擷取場景與平台"
            aria-label="擷取場景與平台"
          >
            <Camera size={16} />
          </button>
        </div>
      </header>
      <div
        className="world-window"
        ref={inputSurface}
        role="group"
        aria-label={cap.name}
        aria-disabled={unavailable}
        aria-describedby="scene-gesture-tip"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        tabIndex={unavailable ? -1 : 0}
      >
        <div className="world-webgl" ref={host} />
        <WorldCue id={id} unavailable={unavailable} />
        <svg
          className="world-gesture-trace"
          width="100%"
          height="100%"
          aria-hidden="true"
          focusable="false"
          pointerEvents="none"
        >
          <line className="world-gesture-chord" visibility="hidden" />
          {[0, 1].map((i) => (
            <g key={i}>
              <path className="world-gesture-path" fill="none" />
              <circle className="world-gesture-point" r="9" visibility="hidden" />
            </g>
          ))}
        </svg>
        {id === "seismic" && <SeismicTrace apps={apps} />}
        {(id === "flight" || id === "rail" || id === "driving") && (
          <span
            className="mobile-readback"
            aria-label={
              (id === "flight" ? "地速" : "車速") + " " + Math.round(f.speed * 3.6) + " 公里每小時"
            }
          >
            <b>{Math.round(f.speed * 3.6)}</b> km/h
          </span>
        )}
        <div className={"world-broadcast" + (stopped ? " held" : "")}>
          <i />
          {problem ? "OFFLINE" : loading ? "LOAD" : stopped ? "HOLD" : "LIVE"}
        </div>
        {(loading || problem) && (
          <div className="world-loading" role="status">
            {problem ? (
              <>
                <span>{problem}</span>
                <button onClick={() => setRetry((v) => v + 1)}>重新載入場景</button>
              </>
            ) : (
              "載入情境模型…"
            )}
          </div>
        )}
      </div>
      <footer className="world-data" aria-label="同步量測">
        <span>
          {cap.left[0]} <b>{reading(cap.left, f)}</b>
        </span>
        <i />
        <span>
          {cap.right[0]} <b>{reading(cap.right, f)}</b>
        </span>
        <a aria-label="情境素材來源" title="情境素材來源" href={"/?reference=credits:" + id}>
          <ExternalLink size={13} />
        </a>
      </footer>
    </section>
  );
}
