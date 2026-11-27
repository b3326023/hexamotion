import { Simulation, DT } from './simulation';
import { DEFAULT_GEOMETRY, DEG, HOME, clamp } from './kinematics';
import { DEFAULT_CONTROL } from './controllers';
import { MAZES, type Maze } from './mazes';
import type { Point2 } from './drawn-path';
export type PlayMode = 'free' | 'path' | 'maze' | 'challenge';
export const ENERGY_HOLD = 1.2;
const ENERGY_REFERENCE = 20; // Mechanical work in joules corresponding to 500 points.
export const CHALLENGES = [
  {
    id: 'center',
    name: '置中衝刺',
    description: '用搖桿把球送回中心，穩定停住 0.8 秒。',
    limit: 60,
    par: 16,
    target: { x: 0, y: 0 },
  },
  {
    id: 'precision',
    name: '精準停球',
    description: '把球停進偏心光圈，練習提前煞車。',
    limit: 75,
    par: 24,
    target: { x: -0.1, y: 0.1 },
  },
  {
    id: 'sea',
    name: '海浪生存',
    description: '底座持續搖晃，手動讓球在安全圓內撐過 30 秒。',
    limit: 30,
    par: 30,
    target: { x: 0, y: 0 },
  },
  {
    id: 'energy',
    name: '節能控制',
    description: '把球送進偏心目標並停穩 1.2 秒。六腿消耗的累計機械功愈少，分數愈高。',
    limit: 45,
    par: 45,
    target: { x: -0.07, y: 0.065 },
  },
] as const;
export type PlayResult = {
  key: string;
  title: string;
  score: number;
  medal: string;
  elapsed: number;
  workJ?: number;
  rms: number;
  collisions: number;
  success: boolean;
  reason: string;
  date: string;
  trace: Point2[];
};
export type GameRun = {
  kind: 'maze' | typeof CHALLENGES[number]['id'];
  key: string;
  title: string;
  ballId: number;
  phase: 'ready' | 'running' | 'won' | 'lost';
  started: number;
  created: number;
  elapsed: number;
  startEnergy: number;
  workJ: number;
  limit: number;
  par: number;
  target: Point2;
  checkpoint: number;
  dwell: number;
  sumError: number;
  samples: number;
  collisions: number;
  lastImpact: number;
  trace: Point2[];
  result: PlayResult | null;
};
export class PlaySession {
  mode: PlayMode = 'free';
  mazeIndex = 0;
  challengeId = 'center';
  run: GameRun | null = null;
  joystick = { x: 0, y: 0 };
  keys = new Set<string>();
  best: Record<string, PlayResult> = {};
  onComplete?: (result: PlayResult) => void;
  constructor(public sim: Simulation) {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? JSON.parse(localStorage.getItem('stewart-v2-best') || '{}')
          : {};
      if (raw && typeof raw === 'object')
        for (const [key, value] of Object.entries(raw).slice(0, 12)) {
          const r = value as PlayResult;
          if (
            typeof r.title === 'string' &&
            Number.isFinite(r.score) &&
            Array.isArray(r.trace)
          )
            this.best[key] = r;
        }
    } catch {
      /* Device storage is optional. */
    }
  }
  get active() {
    return this.run?.phase === 'running' || this.run?.phase === 'ready';
  }
  get maze(): Maze {
    return MAZES[this.mazeIndex];
  }
  selectMode(mode: PlayMode) {
    if (this.mode === mode) return;
    this.cancel();
    if (this.sim.maze) this.sim.initialize();
    this.mode = mode;
    this.run = null;
    this.sim.playTarget = null;
    this.sim.paused = false;
    this.sim.setAuto(false);
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
  }
  resetWorld() {
    const s = this.sim;
    s.geometry = { ...DEFAULT_GEOMETRY };
    s.control = { ...DEFAULT_CONTROL };
    s.dynamic = true;
    s.gravity = 9.81;
    s.friction = 0.7;
    s.restitution = 0.25;
    s.rollingDamping = 0.15;
    s.airDrag = 0.01;
    s.ballMass = 0.0027;
    s.payloadOffset = 0;
    s.profile = 'S-Curve';
    s.fixtureId = 'manual';
    s.speed = 1;
    s.seed = 137;
    s.initialize();
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
  }
  startMaze(index = this.mazeIndex) {
    this.cancel();
    this.mode = 'maze';
    this.mazeIndex = clamp(Math.round(index), 0, MAZES.length - 1);
    this.resetWorld();
    const m = this.maze;
    this.sim.installMaze(m);
    const id = this.sim.spawn('ball', m.start.x, m.start.y, 0.045);
    if (id === undefined) return;
    this.newRun(
      'maze',
      m.id,
      m.name,
      id,
      m.limit,
      m.par,
      m.checkpoints[0] ?? m.goal,
    );
    this.sim.log('迷宮已備球：用方向鍵或搖桿依序通過光圈');
  }
  startChallenge(id = this.challengeId) {
    this.cancel();
    this.mode = 'challenge';
    this.challengeId = CHALLENGES.some((c) => c.id === id) ? id : 'center';
    this.resetWorld();
    const c = CHALLENGES.find((c) => c.id === this.challengeId)!;
    const ball = this.sim.spawn('ball', 0.115, -0.085, 0.045);
    if (ball === undefined) return;
    this.newRun(
      c.id,
      c.id,
      c.name,
      ball,
      c.limit,
      c.par,
      c.target,
    );
    this.sim.log('挑戰已備球：手動操作，放開搖桿回水平');
  }
  private newRun(
    kind: GameRun['kind'],
    key: string,
    title: string,
    ballId: number,
    limit: number,
    par: number,
    target: Point2,
  ) {
    this.sim.playTarget = {
      ...target,
      radius: kind === 'maze' ? 0.026 : 0.015,
      ...(kind === 'sea' ? { safeRadius: 0.18 } : {}),
    };
    this.run = {
      kind,
      key,
      title,
      ballId,
      phase: 'ready',
      started: 0,
      created: this.sim.time,
      elapsed: 0,
      startEnergy: this.sim.energy,
      workJ: 0,
      limit,
      par,
      target,
      checkpoint: 0,
      dwell: 0,
      sumError: 0,
      samples: 0,
      collisions: 0,
      lastImpact: -10,
      trace: [],
      result: null,
    };
  }
  retry() {
    if (this.mode === 'maze') this.startMaze();
    else this.startChallenge();
  }
  setJoystick(x: number, y: number) {
    this.joystick = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }
  level() {
    this.joystick = { x: 0, y: 0 };
    this.keys.clear();
    this.sim.home();
  }
  cancel() {
    if (this.active) this.finish(false, '已離開這次挑戰');
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
  }
  tick() {
    const s = this.sim,
      r = this.run;
    if (r && (r.phase === 'running' || r.phase === 'ready')) {
      if (s.time < r.created || s.estop || s.replaying) {
        this.finish(false, '挑戰已中止');
        return;
      }
      const ball = s.trackedBalls.find((b) => b.id === r.ballId);
      if (!ball || ball.lost || ball.z < 0.005) {
        this.finish(false, '球體已離開平台，準備再試一次');
        return;
      }
      if (s.auto) {
        this.finish(false, '已切換自動控制，這次手動成績不計分');
        return;
      }
      if (r.phase === 'ready') {
        if (ball.contact) {
          r.phase = 'running';
          r.started = s.time;
          r.startEnergy = s.energy;
        } else if (s.time - r.created > 4) {
          this.finish(false, '球未能到達起點');
          return;
        }
      }
      if (r.phase === 'running') {
        this.sim.playTarget = {
          ...r.target,
          radius: r.kind === 'maze' ? 0.026 : 0.015,
          ...(r.kind === 'sea' ? { safeRadius: 0.18 } : {}),
        };
        r.elapsed = s.time - r.started;
        r.workJ = Math.max(0, s.energy - r.startEnergy);
        const error = Math.hypot(ball.x - r.target.x, ball.y - r.target.y);
        r.sumError += error * error;
        r.samples++;
        if (s.count % 16 === 0 && r.trace.length < 2200)
          r.trace.push({ x: ball.x, y: ball.y });
        const hit = s.impacts.at(-1);
        if (
          hit &&
          hit.time > r.started + 0.4 &&
          hit.time - r.lastImpact > 0.16
        ) {
          r.collisions++;
          r.lastImpact = hit.time;
        }
        if (r.kind === 'maze') {
          const m = this.maze;
          if (
            r.checkpoint < m.checkpoints.length &&
            ball.contact &&
            error < 0.026
          ) {
            r.checkpoint++;
            s.mazeCheckpoint = r.checkpoint;
            r.target = m.checkpoints[r.checkpoint] ?? m.goal;
            r.dwell = 0;
            s.log(
              r.checkpoint === m.checkpoints.length
                ? '所有光圈完成，請在終點停穩'
                : `通過光圈 ${r.checkpoint} / ${m.checkpoints.length}`,
            );
          }
          if (r.checkpoint === m.checkpoints.length) {
            r.dwell =
              ball.contact && error < 0.027 && ball.speed < 0.045
                ? r.dwell + DT
                : 0;
            if (r.dwell >= 0.6) {
              this.finish(true, '迷宮完成！');
              return;
            }
          }
          if (r.elapsed >= r.limit) {
            this.finish(false, '時間到了，再試一次');
            return;
          }
        } else if (r.kind === 'sea') {
          if (Math.hypot(ball.x, ball.y) > 0.18) {
            this.finish(false, '球離開了安全圓');
            return;
          }
          s.basePose = [
            0,
            0,
            0.009 * Math.sin(r.elapsed * 1.1),
            0.035 * Math.sin(r.elapsed * 0.8),
            0.028 * Math.sin(r.elapsed * 0.65),
            0,
          ];
          if (r.elapsed >= r.limit) {
            this.finish(true, '成功撐過 30 秒！');
            return;
          }
        } else {
          r.dwell =
            ball.contact && error < 0.015 && ball.speed < 0.025
              ? r.dwell + DT
              : 0;
          if (r.dwell >= (r.kind === 'energy' ? ENERGY_HOLD : 0.8)) {
            this.finish(true, r.kind === 'energy' ? '節能停球完成！' : '精準停球完成！');
            return;
          }
          if (r.elapsed >= r.limit) {
            this.finish(false, '時間到了，再試一次');
            return;
          }
        }
      }
    }
    const manual = this.mode === 'maze' || this.mode === 'challenge';
    if (manual && this.active && !s.estop && s.count % 8 === 0) {
      const x = clamp(
        this.joystick.x +
          (this.keys.has('ArrowRight') || this.keys.has('d') ? 1 : 0) -
          (this.keys.has('ArrowLeft') || this.keys.has('a') ? 1 : 0),
        -1,
        1,
      );
      const y = clamp(
        this.joystick.y +
          (this.keys.has('ArrowUp') || this.keys.has('w') ? 1 : 0) -
          (this.keys.has('ArrowDown') || this.keys.has('s') ? 1 : 0),
        -1,
        1,
      );
      s.setPose([0, 0, 0.48, -y * 4.5 * DEG, x * 4.5 * DEG, 0], true, 0.1);
    }
  }
  private finish(success: boolean, reason: string) {
    const r = this.run;
    if (!r || r.result) return;
    r.phase = success ? 'won' : 'lost';
    const rms = Math.sqrt(r.sumError / Math.max(1, r.samples));
    let value = 1000 - Math.max(0, r.elapsed - r.par) * 7 - r.collisions * 3;
    if (r.kind === 'sea') value = 1000 - rms * 2200;
    if (r.kind === 'energy') value = 1000 * ENERGY_REFERENCE / (ENERGY_REFERENCE + r.workJ);
    const score = success ? Math.round(clamp(value, 100, 1000)) : 0;
    const result: PlayResult = {
      key: r.key,
      title: r.title,
      score,
      medal: success
        ? score >= 850
          ? '金牌'
          : score >= 650
            ? '銀牌'
            : '銅牌'
        : '再接再厲',
      elapsed: r.elapsed,
      ...(r.kind === 'energy' ? { workJ: r.workJ } : {}),
      rms,
      collisions: r.collisions,
      success,
      reason,
      date: new Date().toISOString(),
      trace: r.trace.filter((_, i) => i % 3 === 0),
    };
    r.result = result;
    this.joystick = { x: 0, y: 0 };
    this.keys.clear();
    this.sim.basePose = [0, 0, 0, 0, 0, 0];
    this.sim.setPose([...HOME]);
    this.sim.paused = true;
    if (success && (!this.best[r.key] || score > this.best[r.key].score)) {
      this.best[r.key] = result;
      try {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem('stewart-v2-best', JSON.stringify(this.best));
      } catch {
        /* Scores remain usable in this session. */
      }
    }
    this.sim.log(reason);
    this.onComplete?.(result);
  }
}
