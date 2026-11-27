import { Vector3 } from "three";
import type { LabScene } from "./scene";
import type { Simulation } from "./simulation";
import { quaternion } from "./kinematics";
type Line = { x: number; y: number; ex: number; ey: number };
export function bindDeckPush(
  scene: LabScene,
  sim: Simulation,
  preview: (line: Line | null) => void,
  feedback: (impulse: number) => void,
) {
  const canvas = scene.renderer.domElement;
  let active: { id: number; start: Vector3; x: number; y: number } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0 || active || sim.paused || sim.estop) return;
    const hit = scene.localPointer(e);
    if (!hit) return;
    const r = sim.geometry.topRadius + 0.043;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      if (hit.x * Math.cos(a) + hit.y * Math.sin(a) > r * Math.cos(Math.PI / 6)) return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    active = { id: e.pointerId, start: hit, x: e.clientX - rect.left, y: e.clientY - rect.top };
    preview({ x: active.x, y: active.y, ex: active.x, ey: active.y });
  }
  function move(e: PointerEvent) {
    if (!active || e.pointerId !== active.id) return;
    e.stopImmediatePropagation();
    const r = canvas.getBoundingClientRect();
    preview({ x: active.x, y: active.y, ex: e.clientX - r.left, ey: e.clientY - r.top });
  }
  function end(e: PointerEvent) {
    if (!active || e.pointerId !== active.id) return;
    e.stopImmediatePropagation();
    const { start } = active;
    active = null;
    preview(null);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.type === "pointercancel" || sim.paused || sim.estop) return;
    const hit = scene.localPointer(e);
    if (!hit) return;
    const force = new Vector3((hit.x - start.x) * 12, (hit.y - start.y) * 12, -0.65);
    force.clampLength(0, 3.5);
    const q = quaternion(sim.pose);
    force.applyQuaternion(q);
    const origin = new Vector3(...(sim.pose.slice(0, 3) as [number, number, number]));
    const point = new Vector3(start.x, start.y, 0.023).applyQuaternion(q).add(origin);
    sim.plate.applyImpulseAtPoint(force, point, true);
    feedback(force.length());
  }
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", end, true);
  canvas.addEventListener("pointercancel", end, true);
  return () => {
    canvas.removeEventListener("pointerdown", down, true);
    canvas.removeEventListener("pointermove", move, true);
    canvas.removeEventListener("pointerup", end, true);
    canvas.removeEventListener("pointercancel", end, true);
    if (active && canvas.hasPointerCapture(active.id)) canvas.releasePointerCapture(active.id);
    preview(null);
  };
}
