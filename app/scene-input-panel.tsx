import { useId, useState, type CSSProperties, type ComponentProps } from "react";
import { Activity, CircleHelp, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { SceneControls, sceneGestureInfo } from "./scene-controls";

type Props = ComponentProps<typeof SceneControls> & { axes: readonly [string, string]; help: () => void };

export function SceneInputPanel({ axes, help, ...controls }: Props) {
  const [precision, setPrecision] = useState(false);
  const contentId = useId();
  const { id, value, onCenter, disabled } = controls;
  return (
    <section className="scene-feedback" data-precision={precision} style={{ "--feedback-accent": sceneGestureInfo[id].color } as CSSProperties}>
      <header className="feedback-head">
        <h3><Activity size={16} aria-hidden="true" />輸入回饋</h3>
        <button type="button" className="precision-toggle" aria-controls={contentId} aria-expanded={precision}
          onClick={() => setPrecision(!precision)}>
          {precision ? <X size={14} /> : <SlidersHorizontal size={14} />}
          {precision ? "收起操控" : "精密操控"}
        </button>
        <button type="button" className="feedback-icon" onClick={help} title="場景手勢說明" aria-label="場景手勢說明"><CircleHelp size={17} /></button>
      </header>
      <div id={contentId}>
        {precision ? <>
          <SceneControls {...controls} />
          <p className="precision-hint">{sceneGestureInfo[id].hint}</p>
        </> : <div className="feedback-readings">
          {(["x", "y"] as const).map((axis, index) => {
            const percent = Math.round(value[axis] * 100);
            return <div key={axis} className="command-reading" data-axis={axis} data-value={percent}>
              <div><span>{axes[index]}</span><b>{percent > 0 ? "+" : ""}{percent}<small>%</small></b></div>
              <div className="command-track" aria-hidden="true"><i style={{ left: (50 + Math.min(0, percent) / 2) + "%", width: (Math.abs(percent) / 2) + "%" }} /></div>
            </div>;
          })}
          <button type="button" className="feedback-reset" disabled={disabled} onClick={onCenter} title="兩軸指令歸零"><RotateCcw size={15} /><span>歸零</span></button>
        </div>}
      </div>
    </section>
  );
}
