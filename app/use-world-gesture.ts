import { useLayoutEffect, useRef } from "react";
import { WorldGesture, worldKeyCommand, type SceneCommand } from "../lib/world-gesture";
import type { WorldId } from "../lib/worlds/types";

export function useWorldGesture(
  id: WorldId,
  disabled: boolean,
  stick: SceneCommand,
  onInput: (x: number, y: number) => void,
) {
  const surface = useRef<HTMLDivElement>(null);
  const send = useRef(onInput);
  const value = useRef(stick);
  useLayoutEffect(() => {
    send.current = onInput;
  }, [onInput]);
  useLayoutEffect(() => {
    value.current = { x: stick.x, y: stick.y };
  }, [stick.x, stick.y]);

  useLayoutEffect(() => {
    const node = surface.current;
    if (!node || disabled) return;
    const gesture = new WorldGesture(id);
    const traces = Array.from(node.querySelectorAll<SVGPathElement>(".world-gesture-path"));
    const dots = Array.from(node.querySelectorAll<SVGCircleElement>(".world-gesture-point"));
    const chord = node.querySelector<SVGLineElement>(".world-gesture-chord");
    let bounds: DOMRect | null = null;
    let frame: number | null = null;
    let fine = false;
    function paint() {
      const contacts = [...gesture.contacts.values()];
      if (contacts.length) node!.dataset.dragging = String(contacts.length);
      else delete node!.dataset.dragging;
      for (let i = 0; i < dots.length; i++) {
        const c = contacts[i];
        dots[i].setAttribute("visibility", c ? "visible" : "hidden");
        traces[i].setAttribute(
          "d",
          c
            ? c.trail
                .map((p, j) => (j ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1))
                .join(" ")
            : "",
        );
        if (c) {
          dots[i].setAttribute("cx", String(c.point.x));
          dots[i].setAttribute("cy", String(c.point.y));
        }
      }
      if (chord) {
        chord.setAttribute("visibility", contacts.length === 2 ? "visible" : "hidden");
        if (contacts.length === 2) {
          chord.setAttribute("x1", String(contacts[0].point.x));
          chord.setAttribute("y1", String(contacts[0].point.y));
          chord.setAttribute("x2", String(contacts[1].point.x));
          chord.setAttribute("y2", String(contacts[1].point.y));
        }
      }
    }
    function publish(next: SceneCommand) {
      if (next.x === value.current.x && next.y === value.current.y) return;
      value.current = next;
      send.current(next.x, next.y);
    }
    function flush() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (bounds) publish(gesture.sample(value.current, bounds, fine));
    }
    function schedule() {
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          flush();
          paint();
        });
    }
    function point(e: PointerEvent) {
      return { x: e.clientX - bounds!.left, y: e.clientY - bounds!.top };
    }
    function down(e: PointerEvent) {
      if (
        e.button !== 0 ||
        gesture.contacts.size >= 2 ||
        (e.target as Element)?.closest("button,a")
      )
        return;
      if (!gesture.contacts.size) bounds = node!.getBoundingClientRect();
      else flush();
      if (!gesture.begin(e.pointerId, point(e), e.timeStamp)) return;
      fine = e.shiftKey;
      e.preventDefault();
      node!.setPointerCapture(e.pointerId);
      node!.focus({ preventScroll: true });
      paint();
    }
    function move(e: PointerEvent) {
      if (!bounds || !gesture.contacts.has(e.pointerId)) return;
      fine = e.shiftKey;
      let moved = false;
      for (const sample of e.getCoalescedEvents?.() ?? [])
        if (gesture.move(e.pointerId, point(sample))) moved = true;
      if (gesture.move(e.pointerId, point(e)) || moved) schedule();
    }
    function end(e: PointerEvent) {
      if (!bounds || !gesture.contacts.has(e.pointerId)) return;
      const cancelled = e.type !== "pointerup";
      if (!cancelled) {
        fine = e.shiftKey;
        gesture.move(e.pointerId, point(e));
        flush();
      }
      const reset = gesture.end(e.pointerId, e.timeStamp, e.pointerType, cancelled);
      if (node!.hasPointerCapture(e.pointerId)) node!.releasePointerCapture(e.pointerId);
      if (reset) publish({ x: 0, y: 0 });
      if (!gesture.contacts.size) bounds = null;
      paint();
    }
    function cancel() {
      const captured = [...gesture.contacts.keys()];
      gesture.clear();
      bounds = null;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      for (const pointer of captured)
        if (node!.hasPointerCapture(pointer)) node!.releasePointerCapture(pointer);
      paint();
    }
    function visibility() {
      if (document.hidden) cancel();
    }
    function key(e: KeyboardEvent) {
      if (e.target !== node || e.ctrlKey || e.altKey || e.metaKey) return;
      const next = worldKeyCommand(id, value.current, e.key, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Home") cancel();
      publish(next);
    }
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("lostpointercapture", end);
    node.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      node.removeEventListener("lostpointercapture", end);
      node.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, disabled]);
  return surface;
}
