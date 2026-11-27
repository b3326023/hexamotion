import { Hand } from "lucide-react";
import type { WorldId } from "../lib/worlds/types";

type Guide = { target: string; single: string; pair: string };
const align = "兩指一起滑動，以四分之一靈敏度微調位置。";
export const worldGuides: Record<WorldId, Guide> = {
  flight: { target: "飛機", single: "橫拖壓低機翼，下拉抬起機鼻", pair: "雙指像轉駕駛盤一樣旋轉可壓低機翼，兩指一起下拉可抬頭。" },
  driving: { target: "賽車", single: "左右轉向，上推油門、下拉煞車", pair: "雙指旋轉可轉向，保持間距一起上推或下拉可調整油門與煞車。" },
  marine: { target: "海面", single: "橫撥改浪向，向上拉高浪峰", pair: "雙指旋轉可改變來浪方向，張開可增強湧浪。" },
  seismic: { target: "建築場景", single: "橫撥改震向，向上拉大震幅", pair: "雙指旋轉可改變激振方向，張開可增大震幅。" },
  optics: { target: "焦面", single: "橫拖、縱拖微調副鏡位置", pair: align },
  docking: { target: "對接畫面", single: "橫拖、縱拖對準捕獲環", pair: align },
  rail: { target: "列車", single: "橫拖修正傾角，上推提速", pair: "雙指旋轉可修正超高，兩指一起上推可提高車速。" },
  cinema: { target: "放映畫面", single: "橫拖調片速，上推增強座椅動感", pair: "雙指一起橫移可調片速，張開可增加座椅動感。" },
  camera: { target: "攝影場景", single: "橫拖調防震增益，上推增加手震頻率", pair: "雙指旋轉可調防震增益，張開可提高手震頻率。" },
  balance: { target: "測試場景", single: "橫撥改方向，向上拉長支撐面位移", pair: "雙指旋轉可改變擾動方向，張開可增加支撐面位移。" },
  machining: { target: "加工畫面", single: "橫拖調進給，上推擴大刀路", pair: "雙指一起橫移可調進給，張開可增加刀路半徑。" },
  vibration: { target: "激振臺", single: "橫拖掃頻，上推增加阻尼", pair: "雙指一起橫移可掃頻，張開可增加試體阻尼。" },
  photonics: { target: "光纖工作臺", single: "橫拖、縱拖搜尋光功率峰值", pair: align },
};

export function WorldCue({ id, unavailable }: { id: WorldId; unavailable: boolean }) {
  const guide = worldGuides[id];
  return (
    <div className="world-cue" id="scene-gesture-tip" hidden={unavailable}>
      <Hand size={18} aria-hidden="true" />
      <div><strong>直接拖曳{guide.target}</strong><span>{guide.single}</span></div>
    </div>
  );
}
