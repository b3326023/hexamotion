import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { BookOpen, Gamepad2, PanelsTopLeft, SlidersHorizontal } from "lucide-react";
import Studio from "./studio";
import { isWorld } from "../lib/worlds/types";
import {
  readWorkspaceRoute,
  workspacePath,
  type LabPanel,
  type ReferenceKind,
  type SceneId,
  type StudioSheet,
  type WorkspaceRoute,
} from "../lib/workspace-route";

const Lab = lazy(() => import("./station-lab"));
const Reference = lazy(() => import("./workspace-reference"));
const currentRoute = () => readWorkspaceRoute(new URL(location.href));
type Overlay = "sheet" | "reference";

function HexLogo() {
  return (
    <svg
      viewBox="0 0 44 44"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 3 16 9v19l-16 10-16-10V12z" />
      <path d="m6 12 16 10 16-10M22 22v19M6 31l16-9 16 9" />
      <path d="m13 8 16 10v9" opacity=".72" />
    </svg>
  );
}

export default function Station() {
  const [route, setRoute] = useState(currentRoute);
  const [usedLab, setUsedLab] = useState(!!route.panel);
  const [usedStudio, setUsedStudio] = useState(!route.panel);
  const lastPlay = useRef<LabPanel>(
    route.panel && route.panel !== "engineering" ? route.panel : "free",
  );
  const lastLab = useRef<LabPanel>(route.panel || "free");
  const [announced, announce] = useState("");
  const commit = useCallback(
    (next: WorkspaceRoute, replace = false, overlay: Overlay | null = null) => {
      const path = workspacePath(next);
      if (location.pathname + location.search + location.hash !== path) {
        const state = { ...history.state, stationOverlay: overlay };
        if (replace) history.replaceState(state, "", path);
        else history.pushState(state, "", path);
      }
      setRoute(next);
    },
    [],
  );
  useEffect(() => {
    const restore = () => setRoute(currentRoute());
    if (location.pathname === "/lab.html" || location.hash === "#scenarios")
      history.replaceState(history.state, "", workspacePath(currentRoute()));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (route.panel) {
      setUsedLab(true);
      lastLab.current = route.panel;
      if (route.panel !== "engineering") lastPlay.current = route.panel;
    } else setUsedStudio(true);
    const title =
      route.reference === "manual"
        ? "系統手冊"
        : route.reference === "verification"
          ? "驗證紀錄"
          : route.reference
            ? "素材來源"
            : !route.panel
              ? "場景控制艙"
              : route.panel === "engineering"
                ? "工程工作臺"
                : "物理遊樂場";
    document.title = title + " · HEXAMOTION";
    announce(title);
  }, [route.panel, route.reference]);
  function closeOverlay(kind: Overlay) {
    const r = currentRoute();
    if (history.state?.stationOverlay === kind) {
      history.back();
      return;
    }
    commit({ ...r, [kind]: null }, true);
  }
  const sheet = (value: StudioSheet | null) => {
    const r = currentRoute();
    if (!value) {
      if (r.sheet) closeOverlay("sheet");
      return;
    }
    if (value === r.sheet) return;
    commit({ ...r, sheet: value, reference: null }, !!r.sheet, "sheet");
  };
  function openReference(kind: ReferenceKind) {
    const r = currentRoute();
    if (kind !== r.reference) commit({ ...r, reference: kind }, !!r.reference, "reference");
  }
  function enter(panel: LabPanel | null, scene?: SceneId) {
    const r = currentRoute();
    const next = {
      ...r,
      panel,
      scene: scene ?? r.scene,
      sheet: null,
      reference: null,
      maze: panel === "maze" ? r.maze : null,
      challenge: panel === "challenge" ? r.challenge : null,
    };
    commit(next, !!(r.sheet || r.reference));
  }
  function sceneSelected(next: SceneId, repair = false) {
    const r = currentRoute();
    if (next === r.scene && !r.sheet && !repair) return;
    commit({ ...r, scene: next, sheet: null }, repair || !!r.sheet);
  }
  function navigate(raw: string) {
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin) return false;
    const p = url.pathname;
    if (p === "/docs/" || p === "/docs" || p === "/docs/index.html") {
      openReference("manual");
      return true;
    }
    if (p === "/verification.html") {
      openReference("verification");
      return true;
    }
    const credit = p.match(/^\/worlds\/([^/]+)\/credits\.txt$/)?.[1];
    if (credit && isWorld(credit)) {
      openReference(`credits:${credit}`);
      return true;
    }
    if (p !== "/" && p !== "/index.html" && p !== "/lab.html") return false;
    const target = readWorkspaceRoute(url),
      r = currentRoute();
    if (target.reference) {
      openReference(target.reference);
      return true;
    }
    if (target.sheet) {
      if (!r.panel) sheet(target.sheet);
      else commit({ ...r, panel: null, sheet: target.sheet, reference: null }, false, "sheet");
      return true;
    }
    if (!url.searchParams.has("scene")) target.scene = r.scene;
    commit(target, !!(r.reference || r.sheet));
    return true;
  }
  function intercept(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const el = (event.target as Element).closest?.("a[href]");
    if (
      !(el instanceof HTMLAnchorElement) ||
      el.hasAttribute("download") ||
      el.getAttribute("href")?.startsWith("#")
    )
      return;
    if (navigate(el.href)) event.preventDefault();
  }
  const mode = route.panel === "engineering" ? "engineering" : route.panel ? "play" : "studio";
  const tabs = [
    { key: "studio", name: "場景控制", icon: PanelsTopLeft, panel: null },
    {
      key: "play",
      name: "遊樂場",
      icon: Gamepad2,
      panel: route.panel && route.panel !== "engineering" ? route.panel : lastPlay.current,
    },
    { key: "engineering", name: "工程臺", icon: SlidersHorizontal, panel: "engineering" as const },
  ] as const;
  return (
    <div className="station-app" onClick={intercept}>
      <header className="station-topbar">
        <div className="station-topbar-inner">
          <a
            href={workspacePath({ ...route, panel: null, reference: null, sheet: null })}
            className="station-brand"
            aria-label="HEXAMOTION 場景控制"
          >
            <HexLogo />
            <b>
              HEXA<span>MOTION</span>
            </b>
          </a>
          <nav className="station-tabs" aria-label="主要工作區">
            {tabs.map(({ key, name, icon: Icon, panel }) => (
              <a
                key={key}
                aria-current={mode === key ? "page" : undefined}
                href={workspacePath({ ...route, panel, sheet: null, reference: null })}
              >
                <Icon size={17} />
                <span>{name}</span>
              </a>
            ))}
          </nav>
          <button
            type="button"
            className="station-doc"
            onClick={() => openReference("manual")}
            aria-label="開啟系統手冊"
          >
            <BookOpen size={18} />
            <span>手冊</span>
          </button>
        </div>
      </header>
      <div className="station-content">
        {(usedStudio || !route.panel) && (
          <div
            className="station-workspace station-studio"
            hidden={!!route.panel}
            inert={!!route.panel}
          >
            <Studio
              running={!route.panel && !route.reference}
              requestedScene={route.scene}
              dialog={!route.panel && !route.reference ? route.sheet : null}
              setDialog={sheet}
              onSceneChange={sceneSelected}
            />
          </div>
        )}
        {(usedLab || !!route.panel) && (
          <div
            className="station-workspace station-lab dark"
            hidden={!route.panel}
            inert={!route.panel}
          >
            <Suspense
              fallback={
                <div className="station-loading" role="status">
                  正在準備實驗工作區…
                </div>
              }
            >
              <Lab
                maze={route.maze}
                challenge={route.challenge}
                active={!!route.panel && !route.reference}
                panel={route.panel ?? lastLab.current}
                onPanelChange={enter}
                onHome={() => enter(null)}
                onDocument={openReference}
              />
            </Suspense>
          </div>
        )}
      </div>
      {route.reference && (
        <Suspense
          fallback={
            <div className="station-reference-loading" role="status">
              正在開啟文件…
            </div>
          }
        >
          <Reference
            kind={route.reference}
            onClose={() => closeOverlay("reference")}
            onNavigate={navigate}
          />
        </Suspense>
      )}
      <span className="station-announcement" role="status">
        {announced}
      </span>
    </div>
  );
}
