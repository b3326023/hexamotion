import { useEffect, useState } from "react";
import { Activity, Gamepad2, LayoutGrid, SlidersHorizontal } from "lucide-react";
import type { StudioSheet } from "../lib/workspace-route";

import { compactViewport } from "../lib/compact-screen";
export type StudioDialog = StudioSheet | null;
const tabs = [
  { id: null, label: "操控", icon: Gamepad2 },
  { id: "catalog", label: "場景", icon: LayoutGrid },
  { id: "telemetry", label: "儀表", icon: Activity },
  { id: "tools", label: "工具", icon: SlidersHorizontal },
] as const;

export function MobileDock({
  current,
  choose,
}: {
  current: StudioDialog;
  choose: (panel: StudioDialog) => void;
}) {
  const active = current === "leg" ? "telemetry" : current === "help" ? "tools" : current;
  return (
    <nav className="mobile-dock" aria-label="手機工作區">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={label}
          aria-current={active === id ? "page" : undefined}
          onClick={() => choose(id)}
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function useCompactViewport() {
  const [query] = useState(() => matchMedia(compactViewport));
  const [compact, setCompact] = useState(query.matches);
  useEffect(() => {
    const resize = () => setCompact(query.matches);
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, [query]);
  return compact;
}
