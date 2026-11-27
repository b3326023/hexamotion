import { isWorld, type WorldId } from "./worlds/types";

export const labPanels = ["free", "path", "maze", "challenge", "film", "engineering"] as const;
export type LabPanel = (typeof labPanels)[number];
export type SceneId = "manual" | WorldId;
export type ReferenceKind = "manual" | "verification" | `credits:${WorldId}`;
export type StudioSheet = "catalog" | "telemetry" | "help" | "tools" | "leg";
export type WorkspaceRoute = {
  scene: SceneId;
  panel: LabPanel | null;
  sheet: StudioSheet | null;
  reference: ReferenceKind | null;
  maze: string | null;
  challenge: string | null;
};

export function isLabPanel(value: string | null): value is LabPanel {
  return labPanels.includes(value as LabPanel);
}

export function readWorkspaceRoute(url: URL): WorkspaceRoute {
  const q = url.searchParams;
  const scene = q.get("scene") || "";
  const panel = q.get("panel");
  const sheet = q.get("sheet");
  const ref = q.get("reference") || "";
  const maze = q.get("maze"),
    challenge = q.get("challenge");
  return {
    scene: isWorld(scene) ? scene : "manual",
    panel: isLabPanel(panel)
      ? panel
      : maze
        ? "maze"
        : challenge
          ? "challenge"
          : url.pathname === "/lab.html"
            ? "free"
            : null,
    sheet:
      sheet && ["catalog", "telemetry", "help", "tools", "leg"].includes(sheet)
        ? (sheet as StudioSheet)
        : url.hash === "#scenarios"
          ? "catalog"
          : null,
    reference:
      ref === "manual" ||
      ref === "verification" ||
      (ref.startsWith("credits:") && isWorld(ref.slice(8)))
        ? (ref as ReferenceKind)
        : null,
    maze,
    challenge,
  };
}

export function workspacePath(r: WorkspaceRoute): string {
  const q = new URLSearchParams();
  if (r.scene !== "manual") q.set("scene", r.scene);
  if (r.panel) q.set("panel", r.panel);
  if (r.maze && r.panel === "maze") q.set("maze", r.maze);
  if (r.challenge && r.panel === "challenge") q.set("challenge", r.challenge);
  if (r.sheet && !r.panel) q.set("sheet", r.sheet);
  if (r.reference) q.set("reference", r.reference);
  const search = q.toString();
  return "/" + (search ? "?" + search : "");
}
