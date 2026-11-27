import { useEffect, useRef } from "react";
import type { ApplicationSession } from "../lib/applications";

/** Two measured displacements share a zero and vertical scale, sampled on simulation time. */
export function SeismicTrace({ apps }: { apps: ApplicationSession }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!,
      ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0,
      last = -1;
    const points: { t: number; ground: number; roof: number }[] = [];
    function tick() {
      raf = requestAnimationFrame(tick);
      const f = apps.world;
      if (document.hidden || f.t === last || !ctx) return;
      if (f.t < last) points.length = 0;
      if (f.t >= last && f.t - last < 1 / 36) return;
      last = f.t;
      points.push({ t: f.t, ground: f.deckX, roof: f.specimen });
      while (points.length && f.t - points[0].t > 4) points.shift();
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#ffffff35";
      ctx.beginPath();
      ctx.moveTo(0, 22);
      ctx.lineTo(250, 22);
      ctx.stroke();
      for (const [id, color] of [
        ["ground", "#e6ece7"],
        ["roof", "#ff975e"],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((pt, i) => {
          const x = 248 - (f.t - pt.t) * 61,
            y = 22 - Math.max(-20, Math.min(20, pt[id] * 1050));
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }
    tick();
    return () => cancelAnimationFrame(raf);
  }, [apps]);
  return (
    <div className="seismic-trace" aria-label="近四秒位移紀錄，白線為台面 X 向，橙線為試體相對位移">
      <div>
        <span>台面 X</span>
        <span>試體</span>
        <small>4 s</small>
      </div>
      <canvas width="250" height="44" ref={canvas} />
    </div>
  );
}
