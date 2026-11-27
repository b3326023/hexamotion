type Contact = { x: number; y: number; until: number };

// The CSS marker follows the rendered control, including SVG parts and dialog contents.
function isTouchControl(target: EventTarget | null, root: HTMLElement) {
  return (
    target instanceof Element &&
    (root.contains(target) || target.closest(".lab-dialog, .lab-select-menu") !== null) &&
    getComputedStyle(target).getPropertyValue("--hex-touch-control").trim() === "1"
  );
}

export function attachTouchGuards(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const contacts = new Map<number, Contact>();
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };

  doc.addEventListener(
    "touchstart",
    (event) => {
      const now = performance.now();
      for (const [id, point] of contacts) if (point.until < now) contacts.delete(id);
      for (const touch of Array.from(event.changedTouches)) {
        if (isTouchControl(touch.target, root))
          contacts.set(touch.identifier, { x: touch.clientX, y: touch.clientY, until: Infinity });
      }
    },
    options,
  );

  // Some engines deliver the menu just after pointer cancellation or release.
  function finishTouch(event: TouchEvent) {
    for (const touch of Array.from(event.changedTouches)) {
      const point = contacts.get(touch.identifier);
      if (point) point.until = performance.now() + 700;
    }
  }
  doc.addEventListener("touchend", finishTouch, options);
  doc.addEventListener("touchcancel", finishTouch, options);
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch") contacts.clear();
    },
    options,
  );
  doc.addEventListener("keydown", () => contacts.clear(), options);
  window.addEventListener("blur", () => contacts.clear(), options);

  doc.addEventListener(
    "contextmenu",
    (event) => {
      const target = event.target;
      const control = isTouchControl(target, root);
      // A captured finger may outlive its SVG part or button and be retargeted to the page.
      const offControl =
        target === doc || target === doc.body || target === doc.documentElement || target === root;
      if (!control && !offControl) return;
      const source = event as MouseEvent & {
        pointerType?: string;
        sourceCapabilities?: { firesTouchEvents: boolean } | null;
      };
      if (
        control &&
        (source.pointerType === "touch" || source.sourceCapabilities?.firesTouchEvents)
      ) {
        event.preventDefault();
        return;
      }
      if (source.pointerType === "pen") return;
      const now = performance.now();
      for (const point of contacts.values()) {
        if (
          point.until >= now &&
          Math.hypot(event.clientX - point.x, event.clientY - point.y) <= 26
        ) {
          event.preventDefault();
          return;
        }
      }
    },
    { capture: true, signal: listeners.signal },
  );
  return () => listeners.abort();
}
