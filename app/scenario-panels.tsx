import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plane,
  Car,
  Ship,
  Waves,
  Move3d,
  Orbit,
  Focus,
  TrainFront,
  Clapperboard,
  Camera,
  Footprints,
  Drill,
  AudioWaveform,
  ScanLine,
  X,
  Check,
  ChevronRight,
  Search,
  Layers3,
} from "lucide-react";
import { APPLICATIONS, type ApplicationId } from "../lib/applications";
import { worldIds } from "../lib/worlds/types";
export const icons = {
  manual: Move3d,
  flight: Plane,
  driving: Car,
  marine: Ship,
  seismic: Waves,
  optics: Focus,
  docking: Orbit,
  rail: TrainFront,
  cinema: Clapperboard,
  camera: Camera,
  balance: Footprints,
  machining: Drill,
  vibration: AudioWaveform,
  photonics: ScanLine,
};
export function ScenarioCards({
  selected,
  choose,
  showAll,
}: {
  selected: ApplicationId;
  choose: (id: ApplicationId) => void;
  showAll: () => void;
}) {
  return (
    <section className="library" id="scenarios">
      <div className="section-head">
        <div>
          <span className="eyebrow">
            <i />
            SCENARIO LIBRARY
          </span>
          <h2>應用場景庫</h2>
        </div>
        <button className="more" onClick={showAll}>
          搜尋場景 <span>{APPLICATIONS.length - 1}</span>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="card-grid">
        {worldIds.map((id) => {
          const a = APPLICATIONS.find((a) => a.id === id)!;
          const Icon = icons[id];
          return (
            <button
              className={"scene-card photo-" + id + (selected === id ? " selected" : "")}
              key={id}
              onClick={() => choose(id)}
              aria-pressed={id === selected}
            >
              <span
                className="photo"
                style={{ backgroundImage: "url(/worlds/previews/" + id + ".webp)" }}
              />
              <span className="card-shade" />
              <span className="card-icon">
                <Icon size={17} />
              </span>
              <span className="card-info">
                <span>{a.en.toUpperCase()}</span>
                <b>{a.title}</b>
              </span>
              <span className="go">
                {selected === id ? <Check size={15} /> : <ChevronRight size={16} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
export function Modal({
  title,
  kicker,
  close,
  children,
  wide = false,
  navigation,
  quickStop,
}: {
  title: string;
  kicker: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  navigation?: ReactNode;
  quickStop?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const viewport = window.visualViewport;
    function fitKeyboard() {
      if (!viewport || viewport.scale !== 1) return;
      el.style.setProperty("--visible-height", viewport.height + "px");
      el.style.setProperty(
        "--keyboard-inset",
        Math.max(0, innerHeight - viewport.height - viewport.offsetTop) + "px",
      );
    }
    fitKeyboard();
    viewport?.addEventListener("resize", fitKeyboard);
    viewport?.addEventListener("scroll", fitKeyboard);
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
      viewport?.removeEventListener("resize", fitKeyboard);
      viewport?.removeEventListener("scroll", fitKeyboard);
      el.close();
    };
  }, []);
  return (
    <dialog
      className={"studio-dialog" + (wide ? " wide" : "")}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <header
        className="sheet-heading"
        onPointerDown={(event) => {
          if (
            event.pointerType !== "touch" ||
            !event.isPrimary ||
            (event.target as Element).closest("button,a,input")
          )
            return;
          drag.current = { id: event.pointerId, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          const distance = event.clientY - drag.current.y;
          drag.current = null;
          if (distance > 48) close();
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div>
          <span className="eyebrow">
            <i />
            {kicker}
          </span>
          <h2>{title}</h2>
        </div>
        {quickStop}
        <button autoFocus aria-label="關閉" title="關閉" className="icon-btn" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
      {navigation}
    </dialog>
  );
}
const groups = [
  { name: "全部", ids: [] },
  { name: "載具", ids: ["flight", "driving", "marine", "rail", "docking"] },
  { name: "體感", ids: ["cinema", "camera", "balance"] },
  { name: "工程", ids: ["seismic", "vibration", "machining"] },
  { name: "光學", ids: ["optics", "photonics"] },
];
export function Catalog({
  compact = false,
  selected,
  choose,
}: {
  compact?: boolean;
  selected: ApplicationId;
  choose: (id: ApplicationId) => void;
}) {
  const [q, search] = useState("");
  const [group, setGroup] = useState(0);
  const list = APPLICATIONS.filter(
    (a) =>
      (!compact || group === 0 || groups[group].ids.includes(a.id)) &&
      (a.title + a.en + a.description + a.category).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="catalog-filters">
        <label className="catalog-search">
          <Search size={19} />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="搜尋飛行、海事、光學…"
            aria-label="搜尋場景"
          />
        </label>
        {compact && (
          <div className="mobile-categories" role="group" aria-label="依應用分類">
            {groups.map((g, i) => (
              <button
                type="button"
                key={g.name}
                aria-pressed={group === i}
                onClick={() => setGroup(i)}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="catalog-grid">
        {list.map((a) => {
          const Icon = icons[a.id] ?? Layers3;
          return (
            <button
              key={a.id}
              className={"catalog-item" + (a.id === selected ? " selected" : "")}
              onClick={() => choose(a.id)}
              aria-pressed={a.id === selected}
            >
              {a.id === "manual" ? (
                <span className="catalog-manual">
                  <Icon size={24} />
                </span>
              ) : (
                <img
                  className="catalog-preview"
                  src={"/worlds/previews/" + a.id + ".webp"}
                  alt=""
                />
              )}
              <div>
                <small>{a.en.toUpperCase()}</small>
                <b>{a.title}</b>
                <p>{a.description}</p>
              </div>
              {a.id === selected ? <Check size={15} /> : <ChevronRight size={15} />}
            </button>
          );
        })}
        {!list.length && <p>沒有符合的場景。</p>}
      </div>
    </>
  );
}
