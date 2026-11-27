'use client';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  Circle,
  Crosshair,
  Hand,
  Plus,
  Sparkles,
  Route,
  Trophy,
  Video,
  Play,
  RotateCcw,
  Download,
  Share2,
  Move,
  Square,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Radar, fmt, Precision, Choice, Toggle } from './widgets';
import type { Simulation } from '@/lib/simulation';
import {
  PlaySession,
  CHALLENGES,
  ENERGY_HOLD,
  type PlayMode,
} from '@/lib/play-session';
import { MAZES } from '@/lib/mazes';
import { presetPath, type Point2 } from '@/lib/drawn-path';
import { scoreCard } from '@/lib/score-card';
import type { Clip, FilmOptions } from '@/lib/film-recorder';
import { compactViewport } from '@/lib/compact-screen';
export type PlayPanel = PlayMode | 'film';
function focusMobileStage() {
  if (
    !matchMedia(compactViewport).matches &&
    matchMedia('(max-width: 800px)').matches
  )
    document
      .querySelector('.viewport-panel')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
type Props = {
  sim: Simulation | null;
  session: PlaySession | null;
  act: (fn: (s: Simulation) => unknown) => void;
  refresh: () => void;
  onThrow: () => void;
  panel: PlayPanel;
  setPanel: (p: PlayPanel) => void;
  film: ReactNode;
  vectors: boolean;
  setVectors: (on: boolean) => void;
};
export function PlayControls({
  sim,
  session,
  act,
  refresh,
  onThrow,
  panel,
  setPanel,
  film,
  vectors,
  setVectors,
}: Props) {
  const pick = (value: string) => {
    const p = value as PlayPanel;
    setPanel(p);
    refresh();
  };
  const disabled = !sim || sim.estop || sim.replaying;
  return (
    <div className="play-controls">
      <div className="play-kicker">
        <Sparkles size={16} /> PLAYGROUND
      </div>
      <Tabs value={panel} onValueChange={(v) => pick(String(v))}>
        <TabsList className="play-tabs" aria-label="遊玩內容">
          <TabsTrigger value="free">
            <Hand />
            自由玩
          </TabsTrigger>
          <TabsTrigger value="path">
            <Route />
            畫路徑
          </TabsTrigger>
          <TabsTrigger value="maze">
            <Move />
            迷宮
          </TabsTrigger>
          <TabsTrigger value="challenge">
            <Trophy />
            挑戰
          </TabsTrigger>
          <TabsTrigger value="film">
            <Video />
            拍影片
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {panel === 'free' && (
        <>
          <h2>讓好奇心動起來。</h2>
          <p>丟一顆球，試著讓平台接住它。</p>
          <Button
            className="play-primary wide"
            disabled={disabled}
            onClick={() => act((s) => s.spawn())}
          >
            <Plus />
            投放乒乓球
          </Button>
          <Button
            className="secondary wide"
            disabled={disabled}
            onClick={onThrow}
          >
            <Hand />在 3D 畫面拋球
          </Button>
          <div className="play-task-pair">
            <Button
              className="secondary"
              aria-pressed={sim?.activeTask === 'center'}
              disabled={disabled}
              onClick={() => act((s) => s.setAuto(s.activeTask !== 'center'))}
            >
              <Crosshair />
              自動置中
            </Button>
            <Button
              className="secondary"
              aria-pressed={sim?.activeTask === 'circle'}
              disabled={disabled}
              onClick={() => act((s) => s.setCircle(s.activeTask !== 'circle'))}
            >
              <Circle />
              圓周運動
            </Button>
          </div>
          {sim?.activeTask === 'circle' && (
            <>
              <Precision
                label="圓周半徑"
                value={sim.circleRadius * 1000}
                min={20}
                max={180}
                step={5}
                unit="mm"
                onChange={(v) =>
                  act((s) => s.configureCircle({ radius: v / 1000 }))
                }
              />
              <Precision
                label="圓周速度"
                value={sim.circleSpeed * 1000}
                min={10}
                max={180}
                step={5}
                unit="mm/s"
                onChange={(v) =>
                  act((s) => s.configureCircle({ speed: v / 1000 }))
                }
              />
              <Choice
                label="圓周方向"
                value={String(sim.circleDirection)}
                options={[
                  ['1', '逆時針'],
                  ['-1', '順時針'],
                ]}
                onChange={(v) =>
                  act((s) =>
                    s.configureCircle({ direction: Number(v) as 1 | -1 }),
                  )
                }
              />
            </>
          )}
          <div className="play-tip">
            先投球，再選任務。球只會透過平台傾斜、重力與碰撞移動。
          </div>
        </>
      )}
      {panel === 'path' && (
        <>
          <h2>畫一條，讓球來走。</h2>
          <p>在俯視圖一筆畫出路線，首尾會自動接合。</p>
          <PathEditor sim={sim} act={act} />
          <Precision
            label="循跡速度"
            value={(sim?.pathSpeed ?? 0.08) * 1000}
            min={20}
            max={160}
            step={10}
            unit="mm/s"
            onChange={(v) =>
              act((s) => s.configurePath(s.pathPoints, v / 1000))
            }
          />
          <Button
            className="play-primary wide"
            disabled={disabled}
            aria-pressed={sim?.activeTask === 'path'}
            onClick={() => act((s) => s.setPath(s.activeTask !== 'path'))}
          >
            <Route />
            {sim?.activeTask === 'path'
              ? '循跡中 · 點一下停止'
              : '啟用這條路徑'}
          </Button>
          <Button
            className="secondary wide"
            disabled={disabled}
            onClick={() => act((s) => s.spawn())}
          >
            <Plus />
            投放乒乓球
          </Button>
          <div className="play-tip">
            紫線是平滑後的目標。急彎會提前減速，交叉點也會依路線順序通過。啟用循跡不會自動加球。
          </div>
        </>
      )}
      {panel === 'maze' && session && (
        <>
          <h2>穩住，轉過下一個彎。</h2>
          <p>用方向鍵、WASD 或搖桿傾斜平台。</p>
          <Choice
            label="迷宮關卡"
            value={String(session.mazeIndex)}
            options={MAZES.map((m, i) => [String(i), m.name])}
            onChange={(v) => {
              if (session.active) session.cancel();
              session.mazeIndex = Number(v);
              refresh();
            }}
          />
          <p className="level-description">{session.maze.description}</p>
          <Button
            className="play-primary wide"
            disabled={disabled}
            onClick={() => {
              session.startMaze();
              refresh();
              focusMobileStage();
            }}
          >
            <Play />
            {session.active ? '重新開始並放球' : '開始關卡並放球'}
          </Button>
          <Joystick session={session} refresh={refresh} />
          <div className="play-tip">
            依序通過光圈，在金色終點停穩。放開搖桿只會回水平，球仍有慣性；往反方向傾斜可以減速。重新開始會清空這次場景。
          </div>
        </>
      )}
      {panel === 'challenge' && session && (
        <>
          <h2>比上一次，再穩一點。</h2>
          <p>固定起點與物理條件，挑戰自己的最佳成績。</p>
          <div className="challenge-choices">
            {CHALLENGES.map((c) => (
              <button
                key={c.id}
                aria-pressed={session.challengeId === c.id}
                disabled={session.active}
                onClick={() => {
                  session.challengeId = c.id;
                  refresh();
                }}
              >
                <b>{c.name}</b>
                <span>{c.description}</span>
                <small>
                  {c.limit} 秒限時{' '}
                  {session.best[c.id]
                    ? `· 最佳 ${session.best[c.id].score} 分`
                    : ''}
                </small>
              </button>
            ))}
          </div>
          <Button
            className="play-primary wide"
            disabled={disabled}
            onClick={() => {
              session.startChallenge();
              refresh();
              focusMobileStage();
            }}
          >
            <Play />
            {session.active ? '重新挑戰並放球' : '開始挑戰並放球'}
          </Button>
          <Joystick session={session} refresh={refresh} />
          <p className="small-note">
            工程臺可查看本輪量測。開啟自動控制會結束手動計分。最佳成績儲存在這台裝置。
          </p>
        </>
      )}
      {panel === 'film' && film}
      {panel !== 'film' && (
        <div className="play-view-options">
          <Toggle
            label="速度與加速度箭頭"
            value={vectors}
            onChange={setVectors}
          />
          <div className="vector-legend">
            <span>青綠：速度</span>
            <span>琥珀：淨加速度</span>
            <span>紫色：目標方向</span>
          </div>
        </div>
      )}
    </div>
  );
}
function PathEditor({
  sim,
  act,
}: {
  sim: Simulation | null;
  act: Props['act'];
}) {
  const stroke = useRef<Point2[]>([]),
    pointer = useRef<number | null>(null);
  const [draft, setDraft] = useState<Point2[]>([]),
    [message, setMessage] = useState('');
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width - 0.5) * 0.44,
      y = (0.5 - (e.clientY - r.top) / r.height) * 0.44;
    const scale = Math.min(1, 0.2 / Math.max(0.0001, Math.hypot(x, y)));
    x *= scale;
    y *= scale;
    return { x, y };
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    act((s) => {
      const ok = s.configurePath(stroke.current);
      setMessage(ok ? '路徑已更新，準備開始循跡。' : s.message);
    });
  };
  const cancelStroke = (e: PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    setDraft([]);
  };
  const poly = (ps: Point2[]) =>
      ps.map((p) => `${220 + p.x * 1000},${220 - p.y * 1000}`).join(' '),
    preview = sim?.drawnPath.points ?? [];
  return (
    <>
      <div className="path-presets">
        {[
          ['eight', '8 字'],
          ['heart', '愛心'],
          ['flower', '花瓣'],
          ['circle', '圓形'],
        ].map(([id, label]) => (
          <Button
            key={id}
            className="secondary"
            disabled={!sim}
            onClick={() => {
              setDraft([]);
              setMessage('');
              act((s) => s.configurePath(presetPath(id)));
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <svg
        className="path-editor"
        viewBox="0 0 440 440"
        aria-label="手繪球體路徑"
        role="img"
        onPointerDown={(e) => {
          if (!sim || pointer.current !== null) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = e.pointerId;
          stroke.current = [point(e)];
          setDraft([...stroke.current]);
          setMessage('');
        }}
        onPointerMove={(e) => {
          if (pointer.current !== e.pointerId) return;
          const p = point(e),
            last = stroke.current.at(-1)!;
          if (
            Math.hypot(p.x - last.x, p.y - last.y) > 0.004 &&
            stroke.current.length < 1024
          ) {
            stroke.current.push(p);
            setDraft([...stroke.current]);
          }
        }}
        onPointerUp={finish}
        onPointerCancel={cancelStroke}
        onLostPointerCapture={cancelStroke}
      >
        <circle cx="220" cy="220" r="200" fill="#101e2c" stroke="#365363" />
        <path
          d="M20 220H420M220 20V420"
          stroke="#304554"
          strokeDasharray="4 7"
        />
        <circle cx="220" cy="220" r="100" fill="none" stroke="#243c4b" />
        <polyline
          points={poly(draft)}
          fill="none"
          stroke="#8396a5"
          strokeWidth="2"
          strokeDasharray="4 5"
        />
        <polyline
          points={poly([...preview, ...preview.slice(0, 1)])}
          fill="none"
          stroke="#c1a8ff"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {sim?.ball && !sim.ball.lost && (
          <circle
            cx={220 + sim.ball.x * 1000}
            cy={220 - sim.ball.y * 1000}
            r="9"
            fill="#b1ffe7"
          />
        )}
        <text x="230" y="29">
          +Y
        </text>
        <text x="394" y="211">
          +X
        </text>
      </svg>
      <div className="path-note" role="status">
        {message ||
          `路徑 ${fmt((sim?.drawnPath.length ?? 0) * 1000, 0)} mm · 一圈約 ${fmt(sim?.drawnPath.period, 1)} 秒`}
      </div>
    </>
  );
}
export function Joystick({
  session,
  refresh,
}: {
  session: PlaySession;
  refresh: () => void;
}) {
  const active = useRef<number | null>(null);
  const update = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / (r.width * 0.35),
      y = -(e.clientY - r.top - r.height / 2) / (r.height * 0.35),
      scale = Math.max(1, Math.hypot(x, y));
    session.setJoystick(x / scale, y / scale);
    refresh();
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    session.setJoystick(0, 0);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    refresh();
  };
  return (
    <div className="joystick-wrap">
      <div
        className={`joystick ${!session.active ? 'inactive' : ''}`}
        role="application"
        tabIndex={0}
        aria-label="平台傾斜搖桿，亦可使用方向鍵"
        onPointerDown={(e) => {
          if (!session.active || active.current !== null) return;
          e.preventDefault();
          active.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => {
          if (active.current === e.pointerId) update(e);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <span className="joy-axis horizontal" />
        <span className="joy-axis vertical" />
        <span className="joy-up">+Y</span>
        <span className="joy-right">+X</span>
        <div
          className="joy-knob"
          style={{
            transform: `translate(${session.joystick.x * 50}px,${-session.joystick.y * 50}px)`,
          }}
        >
          <Move size={24} />
        </div>
      </div>
      <Button
        className="secondary"
        disabled={!session.active}
        onClick={() => {
          session.level();
          refresh();
        }}
      >
        <RotateCcw />
        回水平
      </Button>
    </div>
  );
}
export function PlayTelemetry({
  sim,
  session,
  refresh,
  clip,
}: {
  sim: Simulation | null;
  session: PlaySession | null;
  refresh: () => void;
  clip: Clip | null;
}) {
  const [notice, setNotice] = useState('');
  const r = session?.run,
    result = r?.result,
    ball = sim?.ball;
  const downloadCard = async () => {
    if (!result) return;
    try {
      const b = await scoreCard(result),
        url = URL.createObjectURL(b),
        a = document.createElement('a');
      a.href = url;
      a.download = 'HEXAMOTION-score.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice('成績卡未能建立，請再試一次。');
    }
  };
  const share = async () => {
    if (!result) return;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    const panel = MAZES.some((m) => m.id === result.key) ? 'maze' : 'challenge';
    url.searchParams.set('panel', panel);
    url.searchParams.set(panel, result.key);
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice('挑戰連結已複製，可以傳給朋友！');
    } catch {
      setNotice(url.href);
    }
  };
  const path = sim?.auto && sim.ballMotion === 'path',
    motion = path ? sim.pathTarget : sim?.circleTarget,
    slowing =
      ball &&
      sim &&
      ball.vx * sim.ballAcceleration.x + ball.vy * sim.ballAcceleration.y <
        -0.001;
  return (
    <div className="play-telemetry">
      <div className="play-kicker">
        {r ? 'CHALLENGE / 挑戰進度' : 'LIVE / 即時觀察'}
      </div>
      {result ? (
        <div className="result-card">
          <Trophy size={35} />
          <span>{result.medal}</span>
          <strong>
            {result.score}
            <small>分</small>
          </strong>
          <h2>{result.reason}</h2>
          <p>
            {result.elapsed.toFixed(2)} 秒 · 接觸 {result.collisions} 次
          </p>
          {typeof result.workJ === 'number' && (
            <p>六腿機械功 {result.workJ.toFixed(2)} J</p>
          )}
          {result.success && (
            <>
              <Button
                className="play-primary wide"
                onClick={() => void downloadCard()}
              >
                <Download />
                下載成績卡
              </Button>
              <Button className="secondary wide" onClick={() => void share()}>
                <Share2 />
                複製挑戰連結
              </Button>
            </>
          )}
          <Button
            className="secondary wide"
            onClick={() => {
              session?.retry();
              refresh();
              focusMobileStage();
            }}
          >
            <RotateCcw />
            再挑戰一次
          </Button>
          {notice && (
            <p role="status" className="small-note">
              {notice}
            </p>
          )}
        </div>
      ) : r ? (
        <>
          <h2>{r.title}</h2>
          <div className="game-clock">
            {Math.max(0, r.limit - r.elapsed).toFixed(1)}
            <small>秒</small>
          </div>
          <p>
            {r.phase === 'ready'
              ? '等待球落到起點'
              : r.kind === 'maze'
                ? `光圈 ${r.checkpoint} / ${session?.maze.checkpoints.length} · 終點需停穩`
                : r.kind === 'sea'
                  ? '讓球保持在安全圓內'
                  : '停進目標光圈，慢下來並保持穩定'}
          </p>
          {r.kind === 'energy' && (
            <p aria-label="本輪累計機械功">
              六腿機械功 <b>{r.workJ.toFixed(2)} J</b> · 停穩{' '}
              {r.dwell.toFixed(1)} / {ENERGY_HOLD} s
            </p>
          )}
          <div className="dwell-meter">
            <span
              style={{
                width: `${Math.min(100, (r.dwell / (r.kind === 'maze' ? 0.6 : r.kind === 'energy' ? ENERGY_HOLD : 0.8)) * 100)}%`,
              }}
            />
          </div>
        </>
      ) : (
        <>
          <h2>
            {!ball
              ? '準備好就開始'
              : ball.lost
                ? '球離開平台了'
                : sim?.auto
                  ? motion?.phase === 'capture'
                    ? '正在接入路線'
                    : motion?.phase === 'ramp'
                      ? '平順加速中'
                      : slowing
                        ? '正在減速調整'
                        : path
                          ? '沿著你的路線前進'
                          : sim?.activeTask === 'circle'
                            ? '圓周追蹤中'
                            : '正在往中心移動'
                  : slowing
                    ? '球正在減速'
                    : '球正在自由滾動'}
          </h2>
          <p>
            {!ball
              ? '投球後，這裡會顯示它的軌跡與速度。'
              : sim?.auto
                ? '平台依據球的位置與速度，持續調整傾斜角度。'
                : '試著往反方向傾斜，感受球的慣性。'}
          </p>
        </>
      )}
      {sim && ball && (
        <>
          <Radar sim={sim} />
          <div className="play-metrics">
            <span>
              球速
              <b>
                {fmt(ball.speed * 1000, 0)}
                <small>mm/s</small>
              </b>
            </span>
            <span>
              {r ? '距離目標' : '追蹤誤差'}
              <b>
                {fmt(
                  (r
                    ? Math.hypot(ball.x - r.target.x, ball.y - r.target.y)
                    : ball.error) * 1000,
                  1,
                )}
                <small>mm</small>
              </b>
            </span>
          </div>
          {path && (
            <p className="small-note">
              設定 {sim.pathSpeed * 1000} mm/s · 目前目標速度{' '}
              {fmt(Math.hypot(sim.pathTarget.vx, sim.pathTarget.vy) * 1000, 0)}{' '}
              mm/s。急彎會自動限速。
            </p>
          )}
        </>
      )}
      {clip && (
        <div className="latest-clip">
          <div className="play-kicker">
            <Check size={15} /> 影片已完成
          </div>
          <ClipPreview key={clip.url} clip={clip} />
          <a download={clip.filename} href={clip.url}>
            下載影片 · {clip.filename.endsWith('mp4') ? 'MP4' : 'WebM'}
          </a>
          <small>
            {clip.width} × {clip.height} · {clip.duration.toFixed(1)} 秒
          </small>
        </div>
      )}
    </div>
  );
}
function ClipPreview({ clip }: { clip: Clip }) {
  const [status, setStatus] = useState('正在準備影片預覽…');
  return (
    <>
      <video
        controls
        playsInline
        preload="auto"
        src={clip.url}
        aria-label="錄製影片預覽"
        onLoadedData={(e) =>
          setStatus(
            `影片可播放 · ${e.currentTarget.videoWidth} × ${e.currentTarget.videoHeight}`,
          )
        }
        onError={() => setStatus('這個瀏覽器無法預覽此格式，請下載影片播放。')}
      />
      <p className="small-note" role="status">
        {status}
      </p>
    </>
  );
}
export function FilmPanel({
  active,
  elapsed,
  onStart,
  onStop,
  error,
}: {
  active: boolean;
  elapsed: number;
  onStart: (options: FilmOptions, audio: boolean) => void;
  onStop: () => void;
  error: string;
}) {
  const [orientation, setOrientation] = useState('landscape'),
    [duration, setDuration] = useState('15'),
    [director, setDirector] = useState(true),
    [includeAudio, setIncludeAudio] = useState(true);
  return (
    <>
      <h2>把這一刻，拍下來。</h2>
      <p>錄下目前正在進行的玩法，包含自動鏡頭與即時數據字幕。</p>
      <fieldset disabled={active} className="film-fields">
        <Choice
          label="影片比例"
          value={orientation}
          options={[
            ['landscape', '橫式 16:9 · YouTube'],
            ['portrait', '直式 9:16 · Shorts / Reels'],
          ]}
          onChange={setOrientation}
        />
        <Choice
          label="影片長度"
          value={duration}
          options={[
            ['15', '15 秒'],
            ['30', '30 秒'],
            ['60', '60 秒'],
          ]}
          onChange={setDuration}
        />
        <Toggle
          label="自動導演：全景、跟球、機構特寫"
          value={director}
          onChange={setDirector}
        />
        <Toggle
          label="開啟並錄入模擬音效"
          value={includeAudio}
          onChange={setIncludeAudio}
        />
      </fieldset>
      <Button
        className={active ? 'recording-stop wide' : 'play-primary wide'}
        onClick={() =>
          active
            ? onStop()
            : onStart(
                {
                  portrait: orientation === 'portrait',
                  duration: Number(duration),
                  director,
                },
                includeAudio,
              )
        }
      >
        {active ? (
          <>
            <Square />
            停止錄製 · {elapsed.toFixed(1)} s
          </>
        ) : (
          <>
            <Video />
            開始錄製目前畫面
          </>
        )}
      </Button>
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
      )}
      <div className="play-tip">
        先開啟循跡或開始挑戰，再回到這裡錄影。完成後可預覽及下載；切到背景分頁會自動結束，保留已錄片段。
      </div>
      <p className="small-note">
        影片格式依瀏覽器支援自動選擇 WebM 或 MP4，最長 60 秒。
      </p>
    </>
  );
}
