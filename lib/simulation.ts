import RAPIER from '@dimforge/rapier3d-compat';
import { ActuatorAssembly, createFoundation, hexHull, type LegFrame } from './actuator-assembly';
import { attachFixture, FIXTURE_MASS, isFixtureId, type FixtureId, type Specimen } from './application-fixtures';
import { launchVelocity, type LaunchSettings } from './launch';
import { circlePath, emptyCircleTarget } from './circle-path';
import { compilePath, followPath, presetPath, type Point2 } from './drawn-path';
import { mazeFloor, MAZE_BOUNDARY, type Maze } from './mazes';
import { Vector3, Quaternion } from 'three';
import {
  HOME,
  DEG,
  DEFAULT_GEOMETRY,
  actuatorDimensions,
  clamp,
  quaternion,
  poseFromTransform,
  ik,
  fk,
  jacobian,
  condition,
  solve,
  limits,
  type Pose,
  type Geometry,
} from './kinematics';
import {
  BallController,
  DEFAULT_CONTROL,
  type ControllerSettings,
} from './controllers';
export const DT = 1 / 240;
export type Actuator = {
  length: number;
  target: number;
  velocity: number;
  acceleration: number;
  force: number;
  current: number;
  power: number;
  temperature: number;
  travel: number;
  failed: boolean;
  command: number;
  commandVelocity: number;
  commandAcceleration: number;
};
export type ObjectKind = 'ball' | 'steel' | 'cube' | 'cylinder' | 'weight';
export type Profile =
  | 'S-Curve'
  | 'Minimum Jerk'
  | 'Linear'
  | 'Trapezoid'
  | 'Step';
export type Sample = {
  t: number;
  target: number;
  actual: number;
  error: number;
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
  ballX: number;
  ballY: number;
  ballV: number;
  lengths: number[];
  forces: number[];
  energy: number;
};
export type TrackedBall = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  contact: boolean;
  lost: boolean;
  airborne: boolean;
};
export type BallData = {
  targetId: number | null;
  controlledCount: number;
  activeCount: number;
  totalCount: number;
  lostCount: number;
  airborneCount: number;
  rmsRadius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  error: number;
  speed: number;
  contact: boolean;
  lost: boolean;
  spin: number;
  envelope: string;
};
export type RecordedFrame = {
  time: number;
  pose: Pose;
  target: Pose;
  basePose: Pose;
  actuators: Actuator[];
  legFrames?: LegFrame[];
  fixtureId?: FixtureId;
  specimenDisplacement?: number;
  objects: {
    id: number;
    type: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  }[];
};
export const SCENARIOS = [
  ['basic', 'Basic Motion', '六自由度循環'],
  ['dance', 'Actuator Dance', '致動器協同'],
  ['drop', 'Ball Drop', '自由落體與彈跳'],
  ['recovery', 'Ball Recovery', '邊緣落球與自動救援'],
  ['disturbance', 'Disturbance Rejection', '外力擾動抑制'],
  ['sea', 'Sea Stabilization', '船體運動補償'],
  ['tracking', 'Precision Tracking', '六維軌跡追蹤'],
  ['singularity', 'Workspace Sweep', '工作空間與條件數'],
  ['failure', 'Actuator Failure', '單腿失效注入'],
  ['estop', 'Emergency Stop', '控制制動示範'],
];
export class Simulation {
  world!: RAPIER.World;
  plate!: RAPIER.RigidBody;
  foundation!: RAPIER.RigidBody;
  assembly: ActuatorAssembly | null = null;
  fixtureId: FixtureId = 'manual';
  fixtureColliders: RAPIER.Collider[] = [];
  specimen: Specimen | null = null;
  private appliedOffset = NaN;
  private appliedMass = NaN;
  collider!: RAPIER.Collider;
  objects: { id: number; type: ObjectKind; body: RAPIER.RigidBody }[] = [];
  geometry: Geometry = { ...DEFAULT_GEOMETRY };
  control: ControllerSettings = { ...DEFAULT_CONTROL };
  pose: Pose = [...HOME];
  target: Pose = [...HOME];
  planned: Pose = [...HOME];
  basePose: Pose = [0, 0, 0, 0, 0, 0];
  velocity: Pose = [0, 0, 0, 0, 0, 0];
  acceleration: Pose = [0, 0, 0, 0, 0, 0];
  actuators: Actuator[] = [];
  time = 0;
  paused = false;
  speed = 1;
  estop = false;
  dynamic = true;
  auto = false;
  ballMotion: 'center' | 'circle' | 'path' = 'center';
  pathPoints = presetPath('eight');
  pathSpeed = 0.08;
  drawnPath = compilePath(this.pathPoints, this.pathSpeed);
  pathTarget = emptyCircleTarget();
  pathStart: { x: number; y: number; time: number; offset: number } | null =
    null;
  maze: Maze | null = null;
  playTarget: {
    x: number;
    y: number;
    radius: number;
    safeRadius?: number;
  } | null = null;
  mazeCheckpoint = 0;
  mazeColliders: RAPIER.Collider[] = [];
  surfaceColliders: RAPIER.Collider[] = [];
  eventQueue = new RAPIER.EventQueue(true);
  impacts: {
    id: number;
    type: ObjectKind;
    force: number;
    time: number;
    x: number;
  }[] = [];
  impactCounter = 0;
  circleRadius = 0.08;
  circleSpeed = 0.08;
  circleDirection: 1 | -1 = 1;
  circleTarget = emptyCircleTarget();
  circleStart: { x: number; y: number; time: number } | null = null;
  scenario = 'manual';
  scenarioTime = 0;
  profile: Profile = 'S-Curve';
  friction = 0.7;
  restitution = 0.45;
  airDrag = 0.01;
  rollingDamping = 0.15;
  gravity = 9.81;
  ballMass = 0.0027;
  payloadOffset = 0;
  controller = new BallController();
  ball: BallData | null = null;
  ballAcceleration = { x: 0, y: 0 };
  private previousBall: {
    id: number | null;
    vx: number;
    vy: number;
    time: number;
  } | null = null;
  trackedBalls: TrackedBall[] = [];
  trackedKey = '';
  ballControlMode: 'latest' | 'group' | 'selected' = 'latest';
  focusBallId: number | null = null;
  history: Sample[] = [];
  trail: { x: number; y: number; z: number }[] = [];
  events: { t: number; text: string; level: string }[] = [];
  message = 'Stewart geometry calibrated';
  status = 'NOMINAL';
  condition = 0;
  strokeMargin = 0;
  residual = 0;
  energy = 0;
  rmsSum = 0;
  rmsCount = 0;
  maxError = 0;
  peakTilt = 0;
  settled: number | null = null;
  settleDwell = 0;
  autoStart = 0;
  forcePeak = 0;
  recording = false;
  record: RecordedFrame[] = [];
  replaying = false;
  replayIndex = 0;
  replayFrame: RecordedFrame | null = null;
  turbulence = false;
  trajectory: { t: number; pose: Pose }[] = [];
  sensorQueue: (BallData & { capturedAt: number })[] = [];
  private sensorCaptureTime = -Infinity;
  private sensorCaptureKey = '';
  private lastFeedbackTime = -Infinity;
  count = 0;
  seed = 137;
  nextId = 1;
  plan: { start: Pose; end: Pose; t: number; duration: number } | null = null;
  pendingDisturbance = new Vector3();
  pendingTorque = new Vector3();
  brake: number[] = [];
  static async create() {
    await RAPIER.init();
    const s = new Simulation();
    s.initialize();
    return s;
  }
  initialize() {
    this.playTarget = null;
    this.previousBall = null;
    this.ballAcceleration = { x: 0, y: 0 };
    this.maze = null;
    this.mazeCheckpoint = 0;
    this.mazeColliders = [];
    this.surfaceColliders = [];
    this.impacts = [];
    this.ballMotion = 'center';
    this.circleStart = null;
    this.pathStart = null;
    this.pathTarget = emptyCircleTarget();
    this.circleTarget = emptyCircleTarget();
    this.paused = false;
    this.recording = false;
    this.trackedBalls = [];
    this.trackedKey = '';
    this.focusBallId = null;
    this.replayIndex = 0;
    this.nextId = 1;
    this.condition = 0;
    this.strokeMargin = 0;
    this.residual = 0;
    this.scenarioTime = 0;
    this.rmsSum = 0;
    this.rmsCount = 0;
    this.maxError = 0;
    this.peakTilt = 0;
    this.forcePeak = 0;
    this.settleDwell = 0;
    this.pendingDisturbance.set(0, 0, 0);
    this.pendingTorque.set(0, 0, 0);
    this.turbulence = false;
    this.world?.free();
    this.world = new RAPIER.World({ x: 0, y: 0, z: -this.gravity });
    this.world.timestep = DT;
    this.world.numSolverIterations = 12;
    this.objects = [];
    const ground = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, -0.087),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 5, 0.015).setFriction(0.7),
      ground,
    );
    const desc = this.dynamic
      ? RAPIER.RigidBodyDesc.dynamic()
      : RAPIER.RigidBodyDesc.kinematicPositionBased();
    this.plate = this.world.createRigidBody(
      desc
        .setTranslation(...(HOME.slice(0, 3) as [number, number, number]))
        .setLinearDamping(0.08)
        .setAngularDamping(0.12)
        .setCcdEnabled(true),
    );
    const cd = hexHull(this.geometry.topRadius + 0.043, -0.016, 0.022, Math.PI / 6);
    cd.setMass(this.geometry.mass)
      .setFriction(this.friction)
      .setRestitution(this.restitution);
    this.collider = this.world.createCollider(cd, this.plate);
    this.surfaceColliders = [this.collider];
    this.appliedOffset = NaN;
    this.updatePayload();
    this.foundation = createFoundation(this.world, this.geometry.baseRadius);
    this.assembly = this.dynamic ? new ActuatorAssembly(this.world, this.plate, this.foundation, this.geometry, HOME) : null;
    this.mountFixture(this.fixtureId);
    this.pose = [...HOME];
    this.target = [...HOME];
    this.planned = [...HOME];
    this.velocity = [0, 0, 0, 0, 0, 0];
    this.acceleration = [0, 0, 0, 0, 0, 0];
    this.basePose = [0, 0, 0, 0, 0, 0];
    this.actuators = ik(HOME, this.geometry).map((l) => ({
      length: l,
      target: l,
      velocity: 0,
      acceleration: 0,
      force: 0,
      current: 0,
      power: 0,
      temperature: 24,
      travel: 0,
      failed: false,
      command: l,
      commandVelocity: 0,
      commandAcceleration: 0,
    }));
    this.time = 0;
    this.count = 0;
    this.ball = null;
    this.auto = false;
    this.estop = false;
    this.plan = null;
    this.scenario = 'manual';
    this.history = [];
    this.trail = [];
    this.energy = 0;
    this.settled = null;
    this.sensorQueue = [];
    this.sensorCaptureTime = this.lastFeedbackTime = -Infinity;
    this.controller.reset();
    this.status = 'NOMINAL';
    this.brake = [];
    this.replaying = false;
    this.replayFrame = null;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  log(text: string, level = 'info') {
    this.message = text;
    this.events.unshift({ t: this.time, text, level });
    this.events = this.events.slice(0, 60);
  }
  setPose(p: Pose, manual = true, duration?: number) {
    if (this.estop) return this.reject('E-STOP：請先解除制動');
    if (p.length !== 6 || !p.every(Number.isFinite) ||
        (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)))
      return this.reject('姿態或運動時間無效');
    const target = p.map((x, i) =>
      clamp(
        x,
        i < 2
          ? -0.12
          : i === 2
            ? 0.34
            : i === 5
              ? -0.3
              : -this.geometry.tiltLimit,
        i < 2 ? 0.12 : i === 2 ? 0.62 : i === 5 ? 0.3 : this.geometry.tiltLimit,
      ),
    ) as Pose;
    const test = limits(target, this.geometry, this.basePose);
    if (!test.valid)
      return this.reject('LIMIT APPROACH：目標超過機械行程或接頭角度');
    if (target.some((v, i) => v !== p[i]))
      this.log('LIMIT APPROACH：姿態命令已限制在操作範圍內', 'warning');
    if (manual) {
      this.auto = false;
      this.scenario = 'manual';
    }
    this.target = target;
    const distance = Math.max(
      ...ik(target, this.geometry, this.basePose).map((l, i) =>
        Math.abs(l - this.actuators[i].command),
      ),
    );
    this.plan = {
      start: [...this.planned],
      end: [...target],
      t: 0,
      duration:
        duration ??
        Math.max(0.55, (distance / this.geometry.maxVelocity) * 1.8),
    };
    return true;
  }
  reject(m: string) {
    this.log(m, 'warning');
    return false;
  }
  setActuator(i: number, length: number) {
    if (this.estop) return this.reject('E-STOP：請先解除制動');
    if (!Number.isInteger(i) || i < 0 || i > 5 || !Number.isFinite(length)) return false;
    const lengths = ik(this.target, this.geometry, this.basePose);
    lengths[i] = clamp(
      length,
      this.geometry.minLength,
      this.geometry.maxLength,
    );
    const result = fk(lengths, this.pose, this.geometry, this.basePose);
    this.residual = result.residual;
    if (
      !result.valid ||
      !limits(result.pose, this.geometry, this.basePose).valid
    )
      return this.reject('UNREACHABLE：致動器組合無法形成合法姿態');
    return this.setPose(result.pose);
  }
  home() {
    const ok = this.setPose([...HOME]);
    if (ok) this.log('回到校正原點');
  }
  setAuto(on: boolean) {
    if (on && (this.estop || this.replaying)) return;
    this.auto = on;
    this.ballMotion = 'center';
    this.circleStart = null;
    this.pathStart = null;
    this.pathTarget = emptyCircleTarget();
    this.circleTarget = emptyCircleTarget();
    this.scenario = 'manual';
    this.plan = null;
    this.controller.reset();
    this.sensorQueue = [];
    this.autoStart = this.time;
    this.rmsSum = 0;
    this.rmsCount = 0;
    this.maxError = 0;
    this.peakTilt = 0;
    this.settled = null;
    this.settleDwell = 0;
    this.log(
      on
        ? this.ball
          ? 'AUTO CENTER：閉迴路控制啟動'
          : 'AUTO CENTER：已啟用，等待投球'
        : 'MANUAL：手動姿態控制',
    );
  }
  get activeTask():
    | 'center'
    | 'circle'
    | 'path'
    | 'level'
    | 'sea'
    | 'tracking'
    | null {
    if (this.auto) return this.ballMotion;
    return this.scenario === 'level' ||
      this.scenario === 'sea' ||
      this.scenario === 'tracking'
      ? this.scenario
      : null;
  }
  setTask(task: 'level' | 'sea' | 'tracking') {
    if (this.estop || this.replaying) return false;
    const wasActive = this.activeTask === task;
    this.auto = false;
    this.scenario = wasActive ? 'manual' : task;
    this.scenarioTime = 0;
    this.controller.reset();
    this.sensorQueue = [];
    this.circleStart = null;
    this.pathStart = null;
    this.pathTarget = emptyCircleTarget();
    this.circleTarget = emptyCircleTarget();
    if (wasActive) {
      this.target = [...this.planned];
      this.plan = null;
    } else if (task === 'level') this.setPose([...HOME], false);
    else this.plan = null;
    this.log(
      wasActive
        ? '任務已停止，保持目前姿態'
        : `${task === 'level' ? 'AUTO LEVEL' : task === 'sea' ? 'SEA COMP.' : 'TRAJECTORY'}：已啟用，保留現有球體`,
    );
    return true;
  }
  get circleEffectiveSpeed() {
    return Math.min(
      this.circleSpeed,
      1.2 * this.circleRadius,
      Math.sqrt(0.35 * this.circleRadius),
    );
  }
  configureCircle(values: {
    radius?: number;
    speed?: number;
    direction?: 1 | -1;
  }) {
    if (!Object.values(values).every(Number.isFinite)) return false;
    this.circleRadius = clamp(
      values.radius ?? this.circleRadius,
      0.02,
      Math.min(0.18, this.geometry.topRadius * 0.866 - 0.045),
    );
    this.circleSpeed = clamp(values.speed ?? this.circleSpeed, 0.01, 0.18);
    if (values.direction !== undefined)
      this.circleDirection = values.direction === -1 ? -1 : 1;
    this.circleStart = null;
    this.pathStart = null;
    this.pathTarget = emptyCircleTarget();
    this.circleTarget = emptyCircleTarget();
    this.controller.reset();
    this.sensorQueue = [];
    if (this.auto && this.ballMotion === 'circle')
      this.log('圓周參數已更新，平滑接入新路徑');
    return true;
  }
  setCircle(on: boolean) {
    if (on && (this.estop || this.replaying)) return false;
    this.setAuto(on);
    if (on) {
      this.ballMotion = 'circle';
      if (this.ballControlMode === 'group') this.ballControlMode = 'latest';
      this.configureCircle({});
      this.log(
        this.ball
          ? 'CIRCLE：球體接觸後平滑接入圓周'
          : 'CIRCLE：已啟用，等待投球',
      );
    }
    return true;
  }
  configurePath(points: Point2[], speed = this.pathSpeed) {
    try {
      const path = compilePath(
        points,
        speed,
        Math.min(0.2, this.geometry.topRadius * 0.866 - 0.045),
      );
      this.pathPoints = points.map((p) => ({ ...p }));
      this.pathSpeed = path.requestedSpeed;
      this.drawnPath = path;
      this.pathStart = null;
      this.pathTarget = emptyCircleTarget();
      this.controller.reset();
      this.sensorQueue = [];
      this.log('路徑已平滑處理，急彎會提前減速');
      return true;
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : '路徑無效');
    }
  }
  setPath(on: boolean) {
    if (on && (this.estop || this.replaying || this.maze)) return false;
    if (on && !this.configurePath(this.pathPoints, this.pathSpeed))
      return false;
    this.setAuto(on);
    if (on) {
      this.ballMotion = 'path';
      if (this.ballControlMode === 'group') this.ballControlMode = 'latest';
      this.log('循跡已啟用，球體接觸後會平滑進入路線');
    }
    return true;
  }
  installMaze(maze: Maze) {
    // Scale contact tolerances to the 40 mm ball and 70 mm openings.
    this.world.integrationParameters.lengthUnit = 0.05;
    this.maze = maze;
    this.mazeCheckpoint = 0;
    this.world.removeCollider(this.collider, true);
    const cells = mazeFloor(maze),
      area = cells.reduce((a, c) => a + c.w * c.d, 0);
    this.surfaceColliders = cells.map((c) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.w / 2, c.d / 2, 0.019)
          .setTranslation(c.x, c.y, 0.003)
          .setMass(
            (this.geometry.mass * c.w * c.d) / area,
          )
          .setFriction(0.65)
          .setRestitution(0.1),
        this.plate,
      ),
    );
    this.collider = this.surfaceColliders[0];
    this.mazeColliders = [...MAZE_BOUNDARY, ...maze.walls].map((w) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w.w / 2, w.d / 2, 0.028)
          .setTranslation(w.x, w.y, 0.05)
          .setMass(0)
          .setFriction(0.15)
          .setRestitution(0.1),
        this.plate,
      ),
    );
  }
  stop() {
    this.estop = true;
    this.auto = false;
    this.scenario = 'manual';
    this.plan = null;
    this.brake = this.actuators.map((a) => a.length);
    this.target = [...this.pose];
    this.planned = [...this.pose];
    this.actuators.forEach((a) => {
      a.target = a.length;
      a.command = a.length;
      a.commandVelocity = 0;
      a.commandAcceleration = 0;
    });
    this.log('EMERGENCY STOP：控制器關閉，致動器制動保持', 'critical');
  }
  release() {
    this.estop = false;
    this.brake = [];
    this.log('制動已解除，等待新指令');
  }
  spawn(
    type: ObjectKind = 'ball',
    x = 0.09,
    y = 0.065,
    height = 0.18,
    vx = 0,
    vy = 0,
    vz = 0,
  ) {
    if (this.replaying) {
      this.reject('請先重設，再投球');
      return;
    }
    if (![x, y, height, vx, vy, vz].every(Number.isFinite)) {
      this.reject('投球參數必須為有限數值');
      return;
    }
    if (this.objects.length >= 12) {
      this.reject('最多可放置 12 個剛體');
      return;
    }
    const local = new Vector3(
      clamp(x, -0.3, 0.3),
      clamp(y, -0.3, 0.3),
      0.022 + clamp(height, 0.04, 0.8),
    )
      .applyQuaternion(quaternion(this.pose))
      .add(new Vector3(this.pose[0], this.pose[1], this.pose[2]));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(local.x, local.y, local.z)
        .setLinvel(clamp(vx, -3, 3), clamp(vy, -3, 3), clamp(vz, -3, 3))
        .setCcdEnabled(true)
        .setLinearDamping(this.airDrag)
        .setAngularDamping(this.rollingDamping),
    );
    const cd =
      type === 'cube' || type === 'weight'
        ? RAPIER.ColliderDesc.cuboid(0.0325, 0.0325, 0.0325)
        : type === 'cylinder'
          ? RAPIER.ColliderDesc.cylinder(0.0375, 0.025).setRotation(
              new Quaternion().setFromAxisAngle(
                new Vector3(1, 0, 0),
                Math.PI / 2,
              ),
            )
          : RAPIER.ColliderDesc.ball(0.02);
    const mass =
      type === 'ball'
        ? this.ballMass
        : type === 'steel'
          ? 0.26
          : type === 'weight'
            ? 10
            : type === 'cube'
              ? 0.12
              : 0.35;
    if (type === 'ball') {
      const I = (2 / 3) * mass * 0.02 ** 2;
      cd.setMassProperties(
        mass,
        { x: 0, y: 0, z: 0 },
        { x: I, y: I, z: I },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    } else cd.setMass(mass);
    cd.setFriction(this.friction)
      .setRestitution(this.maze ? 0.1 : this.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0.1);
    this.world.createCollider(cd, body);
    this.objects.push({ id: this.nextId++, type, body });
    this.trail = [];
    this.settled = null;
    this.settleDwell = 0;
    this.log(`${type.toUpperCase()} 已投放 · ${Math.round(mass * 1000)} g`);
    this.measure();
    return this.nextId - 1;
  }
  launch(config: LaunchSettings, type: ObjectKind = 'ball') {
    const raw = launchVelocity(config),
      velocity = new Vector3(raw.x, raw.y, raw.z).applyQuaternion(
        quaternion(this.pose),
      );
    return this.spawn(
      type,
      config.x,
      config.y,
      config.height,
      velocity.x,
      velocity.y,
      velocity.z,
    );
  }
  clearObjects() {
    if (this.replaying) return this.reject('重播模式中無法移除物體');
    this.objects.forEach((o) => this.world.removeRigidBody(o.body));
    this.objects = [];
    this.ball = null;
    this.trackedBalls = [];
    this.trackedKey = '';
    this.trail = [];
    this.sensorQueue = [];
    this.controller.reset();
    this.rmsSum = 0;
    this.rmsCount = 0;
    this.maxError = 0;
    this.peakTilt = 0;
    this.settled = null;
    this.settleDwell = 0;
    this.circleStart = null;
    this.pathStart = null;
    this.pathTarget = emptyCircleTarget();
    this.circleTarget = emptyCircleTarget();
    this.log('球體已清空；平台姿態、任務與控制啟用狀態保留');
  }
  impulse(kind = 'impulse') {
    if (kind === 'torque') this.pendingTorque.add(new Vector3(0.13, -0.1, 0));
    else this.pendingDisturbance.add(new Vector3(1.2, -0.6, 0.25));
    this.log(
      kind === 'torque' ? '已施加角衝量 0.13 N·m·s' : '已施加線衝量 1.2 N·s',
    );
  }
  applySettings(g: Geometry) {
    if (
      !Object.keys(DEFAULT_GEOMETRY).every((key) => Number.isFinite(g[key as keyof Geometry])) ||
      g.baseRadius < 0.3 ||
      g.baseRadius > 0.55 ||
      g.topRadius < 0.2 ||
      g.topRadius > 0.38 ||
      g.minLength >= g.maxLength ||
      g.minLength < 0.25 ||
      g.maxLength > 0.85 ||
      g.mass < 5 ||
      g.payload < 0 ||
      g.payload > 300 ||
      g.maxVelocity <= 0 ||
      g.maxAcceleration <= 0 ||
      g.maxJerk <= 0 ||
      g.maxForce <= 0 || g.tiltLimit <= 0 || g.jointLimit <= 0
    )
      return this.reject('幾何參數或限制無效');
    if (actuatorDimensions(g.maxLength).rod + 0.01 > g.minLength)
      return this.reject('單級伸縮缸收納空間不足，請增加最短長度或縮短最大行程');
    if (!limits(HOME, g).valid)
      return this.reject('新的幾何設定無法容納原點姿態');
    this.geometry = { ...g };
    this.initialize();
    this.log('幾何已重新校正，模擬已重設');
    return true;
  }
  private updatePayload() {
    if (this.appliedOffset === this.payloadOffset && this.appliedMass === this.geometry.payload) return;
    this.appliedOffset = this.payloadOffset;
    const mass = this.geometry.payload;
    this.appliedMass = mass;
    // The payload is a rigid 100 mm cubic ballast at the deck-relative offset.
    const inertia = mass * 0.1 ** 2 / 6;
    this.plate.setAdditionalMassProperties(mass, { x: this.payloadOffset, y: 0, z: 0 },
      { x: inertia, y: inertia, z: inertia }, { x: 0, y: 0, z: 0, w: 1 }, true);
    this.plate.recomputeMassPropertiesFromColliders();
  }
  setPayload(mass: number, offset = this.payloadOffset) {
    if (!Number.isFinite(mass) || !Number.isFinite(offset) || mass < 0 || mass > 300 || Math.abs(offset) > 0.15)
      return this.reject('配重或偏心距離超過範圍');
    this.geometry.payload = mass;
    this.payloadOffset = offset;
    this.updatePayload();
    return true;
  }
  setApplicationFixture(id: string) {
    if (!isFixtureId(id)) return false;
    if (this.fixtureId === id) return true;
    for (const c of this.fixtureColliders) this.world.removeCollider(c, true);
    if (this.specimen) this.world.removeRigidBody(this.specimen.body);
    this.mountFixture(id);
    this.plate.recomputeMassPropertiesFromColliders();
    this.plate.wakeUp();
    return true;
  }
  private mountFixture(id: FixtureId) {
    const { colliders, specimen } = attachFixture(this.world, this.plate, id);
    this.fixtureColliders = colliders;
    this.specimen = specimen;
    this.fixtureId = id;
  }
  setSurface(friction: number, restitution: number) {
    this.friction = clamp(friction, 0, 1.5);
    this.restitution = clamp(restitution, 0, 1);
    this.surfaceColliders.forEach((c) => {
      c.setFriction(this.friction);
      c.setRestitution(this.restitution);
    });
    this.objects.forEach((o) => {
      o.body.collider(0).setFriction(this.friction);
      o.body.collider(0).setRestitution(this.restitution);
    });
  }
  runScenario(id: string) {
    if (id === 'sea' || id === 'tracking') {
      this.setTask(id);
      return;
    }
    this.initialize();
    this.paused = false;
    this.scenario = id;
    this.scenarioTime = 0;
    this.log(`SCENARIO：${SCENARIOS.find((s) => s[0] === id)?.[1] || id}`);
    if (id === 'drop') this.spawn();
    if (id === 'recovery') {
      this.spawn('ball', 0.12, -0.08, 0.1, 0.04, 0.025);
      this.setAuto(true);
      this.scenario = id;
    }
    if (id === 'failure') this.actuators[2].failed = true;
  }
  controlStep(dt: number) {
    if (this.estop) return;
    if (this.scenario !== 'manual') {
      const t = this.scenarioTime;
      if (this.scenario === 'level') this.target = [...HOME];
      if (this.scenario === 'basic')
        this.target = [
          0.022 * Math.sin(t * 0.65),
          0.016 * Math.sin(t * 0.8),
          0.48 + 0.025 * Math.sin(t * 0.75),
          0.055 * Math.sin(t * 0.7),
          0.06 * Math.sin(t * 0.55),
          0.06 * Math.sin(t * 0.4),
        ];
      if (this.scenario === 'dance') {
        const lengths = ik(HOME, this.geometry);
        lengths.forEach(
          (_, i) =>
            (lengths[i] += 0.018 * Math.sin(t * 0.7 + (i * Math.PI) / 3)),
        );
        const solved = fk(lengths, this.pose, this.geometry);
        if (solved.valid) this.target = solved.pose;
      }
      if (this.scenario === 'tracking')
        this.target = [
          0.03 * Math.sin(t),
          0.022 * Math.sin(2 * t),
          0.48 + 0.02 * Math.cos(t),
          0.05 * Math.sin(0.8 * t),
          0.045 * Math.cos(0.65 * t),
          0.045 * Math.sin(0.6 * t),
        ];
      if (this.scenario === 'sea') {
        this.basePose = [
          0,
          0,
          0.016 * Math.sin(t * 1.1),
          0.075 * Math.sin(t * 0.8),
          0.06 * Math.sin(t * 0.65),
          0,
        ];
        this.target = [...HOME];
      }
      if (this.scenario === 'disturbance') {
        this.target = [...HOME];
        if (this.count % 480 === 0) this.impulse();
      }
      if (this.scenario === 'singularity')
        this.target = [
          0,
          0,
          0.48 + 0.12 * (0.5 - 0.5 * Math.cos(t * 0.35)),
          0.08 * Math.sin(t * 0.3),
          0,
          0.23 * Math.sin(t * 0.3),
        ];
      if (this.scenario === 'failure')
        this.target = [0, 0, 0.48, 0.04 * Math.sin(t), 0.04 * Math.cos(t), 0];
      if (this.scenario === 'estop') {
        this.target = [
          0,
          0,
          0.48 + 0.03 * Math.sin(t),
          0.08 * Math.sin(t),
          0,
          0,
        ];
        if (t > 3) this.stop();
      }
      if (this.scenario === 'trajectory' && this.trajectory.length > 1) {
        const tt = t % this.trajectory[this.trajectory.length - 1].t;
        let j = this.trajectory.findIndex((f) => f.t > tt);
        if (j < 1) j = 1;
        const a = this.trajectory[j - 1],
          b = this.trajectory[j],
          u = clamp((tt - a.t) / (b.t - a.t), 0, 1),
          s = u * u * (3 - 2 * u);
        this.target = a.pose.map((v, i) => v + (b.pose[i] - v) * s) as Pose;
      }
    }
    if (
      this.auto &&
      this.ball &&
      !this.ball.lost &&
      this.ball.activeCount > 0
    ) {
      if (this.ballMotion === 'circle') {
        if (!this.circleStart && this.ball.contact)
          this.circleStart = {
            x: this.ball.x,
            y: this.ball.y,
            time: this.time,
          };
        if (!this.circleStart) return;
        this.circleTarget = circlePath(
          this.time - this.circleStart.time,
          this.circleStart,
          this.circleRadius,
          this.circleEffectiveSpeed,
          this.circleDirection,
        );
      }
      if (this.ballMotion === 'path') {
        if (!this.pathStart && this.ball.contact)
          this.pathStart = {
            x: this.ball.x,
            y: this.ball.y,
            time: this.time,
            offset: this.drawnPath.nearest(this.ball),
          };
        if (!this.pathStart) return;
        this.pathTarget = followPath(
          this.drawnPath,
          this.pathStart,
          this.time - this.pathStart.time,
          this.pathStart.offset,
        );
      }
      this.captureSensor();
      const deliveryDeadline = this.time - this.control.delay / 1000;
      const b = this.sensorQueue.findLast(sample => sample.capturedAt <= deliveryDeadline + 1e-10);
      if (b && b.capturedAt !== this.lastFeedbackTime) {
        this.lastFeedbackTime = b.capturedAt;
        const reference =
            this.ballMotion === 'path'
              ? this.pathTarget
              : this.ballMotion === 'circle'
                ? this.circleTarget
                : emptyCircleTarget(),
          out = this.controller.run(
            b.x - reference.x,
            b.y - reference.y,
            b.vx - reference.vx,
            b.vy - reference.vy,
            this.control,
            dt,
            Math.min(this.geometry.tiltLimit, 8 * DEG),
          );
        const pitch =
            out.pitch + reference.ax / Math.max(0.1, 0.6 * this.gravity),
          roll = out.roll - reference.ay / Math.max(0.1, 0.6 * this.gravity);
        const scale = Math.min(
          1,
          Math.min(this.geometry.tiltLimit, 8 * DEG) /
            Math.max(1e-8, Math.hypot(pitch, roll)),
        );
        this.target = [0, 0, 0.48, roll * scale, pitch * scale, 0];
        this.plan = null;
      }
    }
    if (this.auto && (!this.ball || this.ball.activeCount === 0)) {
      this.circleStart = null;
      this.pathStart = null;
      this.pathTarget = emptyCircleTarget();
      this.circleTarget = emptyCircleTarget();
    }
    if (!limits(this.target, this.geometry, this.basePose).valid) {
      this.target = [...this.planned];
      this.status = 'LIMIT APPROACH';
    }
  }
  accelerationCap(margin: number) {
    let lo = 0,
      hi = this.geometry.maxAcceleration;
    const da = this.geometry.maxJerk * DT;
    for (let k = 0; k < 24; k++) {
      const a = (lo + hi) / 2,
        n = Math.ceil(a / da),
        brake = DT * (n * a - (da * n * (n - 1)) / 2);
      if (brake <= Math.max(0, margin)) lo = a;
      else hi = a;
    }
    return lo;
  }
  private captureSensor() {
    if (!this.auto || this.estop || !this.ball || this.ball.lost || !this.ball.activeCount) return;
    if (this.sensorCaptureTime === this.time && this.sensorCaptureKey === this.trackedKey) return;
    if (this.sensorCaptureKey !== this.trackedKey) this.lastFeedbackTime = -Infinity;
    this.sensorCaptureKey = this.trackedKey;
    this.sensorCaptureTime = this.time;
    if (this.random() < this.control.dropout) return;
    const noise = () => ((this.random() - 0.5) * 2 * this.control.noise + this.control.bias) / 1000;
    this.sensorQueue.push({ ...this.ball, x: this.ball.x + noise(), y: this.ball.y + noise(), capturedAt: this.time });
    if (this.sensorQueue.length > 120) this.sensorQueue.shift();
  }
  tick() {
    if (this.replaying) {
      this.replayIndex = Math.min(
        this.record.length - 1,
        this.replayIndex + DT * 30,
      );
      this.replayFrame = this.record[Math.floor(this.replayIndex)] ?? null;
      if (this.replayIndex >= this.record.length - 1) this.paused = true;
      return;
    }
    this.count++;
    this.time += DT;
    this.scenarioTime += DT;
    this.captureSensor();
    if (this.count % Math.max(1, Math.round(240 / this.control.rate)) === 0)
      this.controlStep(Math.max(1, Math.round(240 / this.control.rate)) * DT);
    if (this.plan) {
      this.plan.t += DT;
      const u = clamp(this.plan.t / this.plan.duration, 0, 1);
      let s = u;
      if (this.profile === 'Step') s = 1;
      else if (this.profile === 'S-Curve') s = u * u * (3 - 2 * u);
      else if (this.profile === 'Minimum Jerk')
        s = u * u * u * (10 - 15 * u + 6 * u * u);
      else if (this.profile === 'Trapezoid')
        s =
          u < 0.25
            ? (u * u) / 0.375
            : u > 0.75
              ? 1 - (1 - u) ** 2 / 0.375
              : (u - 0.125) / 0.75;
      this.planned = this.plan.start.map(
        (v, i) => v + (this.plan!.end[i] - v) * s,
      ) as Pose;
      if (u >= 1) this.plan = null;
    } else this.planned = [...this.target];
    const desired = ik(this.planned, this.geometry, this.basePose);
    this.actuators.forEach((a, i) => {
      a.target = this.estop ? this.brake[i] : desired[i];
      if (a.failed) {
        a.commandVelocity = 0;
        a.commandAcceleration = 0;
        return;
      }
      const wn =
          18 /
          Math.sqrt(1 + (this.geometry.payload / this.geometry.mass) * 0.25),
        acc = clamp(
          wn * wn * (a.target - a.command) -
            2 * this.control.damping * wn * a.commandVelocity,
          -this.accelerationCap(this.geometry.maxVelocity + a.commandVelocity),
          this.accelerationCap(this.geometry.maxVelocity - a.commandVelocity),
        );
      a.commandAcceleration += clamp(
        acc - a.commandAcceleration,
        -this.geometry.maxJerk * DT,
        this.geometry.maxJerk * DT,
      );
      a.commandVelocity += a.commandAcceleration * DT;
      a.command = clamp(
        a.command + a.commandVelocity * DT,
        this.geometry.minLength,
        this.geometry.maxLength,
      );
    });
    const prev = [...this.pose] as Pose,
      prevV = [...this.velocity] as Pose;
    this.foundation.setNextKinematicTranslation({ x: this.basePose[0], y: this.basePose[1], z: this.basePose[2] });
    this.foundation.setNextKinematicRotation(quaternion(this.basePose));
    if (this.dynamic) {
      this.plate.resetForces(true);
      this.plate.resetTorques(true);
      this.updatePayload();
      this.assembly!.drive(this.plate, this.actuators, this.geometry, this.gravity, this.specimen?.body);
      if (this.pendingDisturbance.length())
        this.plate.applyImpulse(this.pendingDisturbance, true);
      if (this.pendingTorque.length())
        this.plate.applyTorqueImpulse(this.pendingTorque, true);
      if (this.turbulence)
        this.plate.addForce(
          {
            x: 15 * Math.sin(this.time * 3.4),
            y: 10 * Math.sin(this.time * 2.7),
            z: 4 * Math.cos(this.time * 1.9),
          },
          true,
        );
    } else {
      const result = fk(
        this.actuators.map((a) => a.command),
        this.pose,
        this.geometry,
        this.basePose,
      );
      this.residual = result.residual;
      if (
        result.valid &&
        limits(result.pose, this.geometry, this.basePose).valid
      ) {
        const next = result.pose;
        this.plate.setNextKinematicTranslation({
          x: next[0],
          y: next[1],
          z: next[2],
        });
        this.plate.setNextKinematicRotation(quaternion(next));
      } else {
        this.status = 'LIMIT APPROACH';
        this.actuators.forEach((a) => {
          a.command = a.length;
          a.commandVelocity = 0;
          a.commandAcceleration = 0;
        });
      }
      if (this.pendingDisturbance.length() || this.pendingTorque.length()) {
        const p = [...this.target] as Pose;
        p[0] += 0.01;
        p[3] += 0.02;
        this.setPose(p, false, 0.4);
        this.log('Realtime 模式：擾動以伺服目標偏移近似');
      }
    }
    this.pendingDisturbance.set(0, 0, 0);
    this.pendingTorque.set(0, 0, 0);
    this.world.step(this.eventQueue);
    this.eventQueue.drainContactForceEvents((event) => {
      const object = this.objects.find(
        (o) =>
          o.body.collider(0).handle === event.collider1() ||
          o.body.collider(0).handle === event.collider2(),
      );
      if (
        object &&
        event.totalForceMagnitude() >
          Math.max(0.12, object.body.mass() * this.gravity * 2.5)
      ) {
        this.impacts.push({
          id: ++this.impactCounter,
          type: object.type,
          force: event.totalForceMagnitude(),
          time: this.time,
          x: object.body.translation().x,
        });
        if (this.impacts.length > 24) this.impacts.shift();
      }
    });
    this.pose = poseFromTransform(
      this.plate.translation(),
      this.plate.rotation(),
    );
    this.velocity = this.pose.map((v, i) => (v - prev[i]) / DT) as Pose;
    this.acceleration = this.velocity.map(
      (v, i) => (v - prevV[i]) / DT,
    ) as Pose;
    const lengths = this.assembly?.measuredLengths() ?? ik(this.pose, this.geometry, this.basePose);
    if (!this.dynamic) {
      const movingMass = this.geometry.mass + this.geometry.payload + FIXTURE_MASS[this.fixtureId];
      const weight = new Vector3(0, 0, movingMass * this.gravity);
      const gravityMoment = new Vector3().copy(this.plate.worldCom()).sub(this.plate.translation()).cross(weight);
      const J = jacobian(this.pose, this.geometry, this.basePose),
        f = solve(
          J[0].map((_, i) => J.map((r) => r[i])),
          [
            movingMass * this.acceleration[0],
            movingMass * this.acceleration[1],
            movingMass * (this.gravity + this.acceleration[2]),
            gravityMoment.x, gravityMoment.y, gravityMoment.z,
          ],
        );
      this.actuators.forEach((a, i) => {
        a.force = clamp(
          f?.[i] ?? 0,
          -this.geometry.maxForce,
          this.geometry.maxForce,
        );
      });
    }
    this.actuators.forEach((a, i) => {
      const vv = (lengths[i] - a.length) / DT;
      a.acceleration = (vv - a.velocity) / DT;
      a.velocity = vv;
      a.travel += Math.abs(lengths[i] - a.length);
      a.length = lengths[i];
      a.current = Math.abs(a.force) / 150;
      a.power = Math.abs(a.force * a.velocity);
      a.temperature +=
        DT * (a.current * a.current * 0.018 - (a.temperature - 24) * 0.008);
      this.energy += a.power * DT;
      this.forcePeak = Math.max(this.forcePeak, Math.abs(a.force));
    });
    this.measure();
    if (this.count % 8 === 0) this.sample();
    if (this.count % 24 === 0) {
      this.condition = condition(this.pose, this.geometry, this.basePose);
      this.strokeMargin = clamp(
        (limits(this.pose, this.geometry, this.basePose).stroke /
          (this.geometry.maxLength - this.geometry.minLength)) *
          200,
        0,
        100,
      );
      this.status = this.estop
        ? 'EMERGENCY STOP'
        : this.actuators.some((a) => a.failed)
          ? 'ACTUATOR FAULT'
          : this.actuators.some(
                (a) => Math.abs(a.force) >= this.geometry.maxForce * 0.98,
              )
            ? 'SATURATION'
            : this.condition > 100
              ? 'SINGULARITY'
              : this.strokeMargin < 8
                ? 'LIMIT APPROACH'
                : 'NOMINAL';
      if (
        !this.pose.every(Number.isFinite) ||
        this.pose[2] < 0.17 ||
        Math.abs(this.pose[3]) > 0.65 ||
        Math.abs(this.pose[4]) > 0.65
      ) {
        this.paused = true;
        this.stop();
        this.log('機構失穩：模擬安全凍結，請重設', 'critical');
      }
    }
  }
  measure() {
    if (
      this.auto &&
      this.ballMotion !== 'center' &&
      this.ballControlMode === 'group'
    )
      this.ballControlMode = 'latest';
    const balls = this.objects.filter(
      (o) => o.type === 'ball' || o.type === 'steel',
    );
    if (!balls.length) {
      this.ball = null;
      this.trackedBalls = [];
      return;
    }
    const q = quaternion(this.pose).invert(),
      platePos = new Vector3(this.pose[0], this.pose[1], this.pose[2]);
    this.trackedBalls = balls.map((obj) => {
      const p = obj.body.translation(),
        w = obj.body.linvel(),
        s = obj.body.angvel(),
        local = new Vector3(p.x, p.y, p.z).sub(platePos).applyQuaternion(q),
        relative = new Vector3(w.x, w.y, w.z).sub(this.plate.velocityAtPoint(p)).applyQuaternion(q);
      const radius = Math.hypot(local.x, local.y),
        lost = local.z < -0.035 || radius > this.geometry.topRadius + 0.055;
      return {
        id: obj.id,
        x: local.x,
        y: local.y,
        z: local.z,
        vx: relative.x,
        vy: relative.y,
        speed: Math.hypot(relative.x, relative.y),
        spin: Math.hypot(s.x, s.y, s.z),
        contact: Math.abs(local.z - 0.042) < 0.014,
        lost,
        airborne: !lost && local.z > 0.095,
      };
    });
    const available = this.trackedBalls.filter((b) => !b.lost && !b.airborne),
      incoming = this.trackedBalls.filter((b) => !b.lost);
    const focus = available.find((b) => b.id === this.focusBallId);
    const active =
      this.ballControlMode === 'group'
        ? available
        : this.ballControlMode === 'selected' && focus
          ? [focus]
          : available.length
            ? [available[available.length - 1]]
            : [];
    const tracked = active.length
      ? active
      : incoming.length
        ? [incoming[incoming.length - 1]]
        : [this.trackedBalls[this.trackedBalls.length - 1]];
    const key = active.map((b) => b.id).join('/');
    if (key !== this.trackedKey) {
      this.trackedKey = key;
      this.controller.reset();
      this.sensorQueue = [];
      this.settled = null;
      this.settleDwell = 0;
      this.autoStart = this.time;
      this.rmsSum = 0;
      this.rmsCount = 0;
      this.maxError = 0;
      this.trail = [];
      this.circleStart = null;
      this.pathStart = null;
      this.pathTarget = emptyCircleTarget();
      this.circleTarget = emptyCircleTarget();
    }
    const mean = (k: 'x' | 'y' | 'z' | 'vx' | 'vy' | 'spin') =>
      tracked.reduce((s, b) => s + b[k], 0) / tracked.length;
    const x = mean('x'),
      y = mean('y'),
      z = mean('z'),
      vx = mean('vx'),
      vy = mean('vy'),
      spin = mean('spin'),
      error =
        this.auto && this.ballMotion !== 'center'
          ? Math.hypot(
              x -
                (this.ballMotion === 'path'
                  ? this.pathTarget
                  : this.circleTarget
                ).x,
              y -
                (this.ballMotion === 'path'
                  ? this.pathTarget
                  : this.circleTarget
                ).y,
            )
          : Math.hypot(x, y),
      speed = Math.hypot(vx, vy),
      rmsRadius = Math.sqrt(
        tracked.reduce((s, b) => s + b.x * b.x + b.y * b.y, 0) / tracked.length,
      ),
      lost = incoming.length === 0;
    const stopMargin = active.length
      ? Math.min(
          ...active.map(
            (b) =>
              this.geometry.topRadius -
              0.025 -
              Math.hypot(b.x, b.y) -
              (b.speed * b.speed) /
                (2 * 0.6 * this.gravity * Math.sin(this.geometry.tiltLimit)),
          ),
        )
      : 0;
    this.ball = {
      targetId: this.ballControlMode === 'group' ? null : tracked[0].id,
      controlledCount: active.length,
      x,
      y,
      z,
      vx,
      vy,
      error,
      speed,
      spin,
      rmsRadius,
      contact: active.length > 0 && active.every((b) => b.contact),
      lost,
      activeCount: available.length,
      totalCount: balls.length,
      lostCount: this.trackedBalls.filter((b) => b.lost).length,
      airborneCount: this.trackedBalls.filter((b) => b.airborne).length,
      envelope: lost
        ? 'LOST'
        : !active.length
          ? 'AWAITING CONTACT'
          : stopMargin < 0
            ? 'UNRECOVERABLE'
            : stopMargin < 0.05
              ? 'MARGINAL'
              : active.length > 1
                ? 'GROUP CONTROL'
                : 'RECOVERABLE',
    };
    if (
      this.previousBall &&
      this.previousBall.id === this.ball.targetId &&
      this.time > this.previousBall.time
    ) {
      const dt = this.time - this.previousBall.time;
      this.ballAcceleration = {
        x: (vx - this.previousBall.vx) / dt,
        y: (vy - this.previousBall.vy) / dt,
      };
    }
    this.previousBall = { id: this.ball.targetId, vx, vy, time: this.time };
    if (this.auto && active.length && this.ballMotion === 'center') {
      this.rmsSum += rmsRadius * rmsRadius;
      this.rmsCount++;
      this.maxError = Math.max(
        this.maxError,
        ...active.map((b) => Math.hypot(b.x, b.y)),
      );
      this.peakTilt = Math.max(
        this.peakTilt,
        Math.hypot(this.pose[3], this.pose[4]),
      );
      const clusterLimit =
        active.length === 1 ? 0.004 : 0.022 * Math.sqrt(active.length);
      if (
        error < 0.004 &&
        rmsRadius < clusterLimit &&
        active.every((b) => b.contact && b.speed < 0.018)
      )
        this.settleDwell += DT;
      else {
        this.settleDwell = 0;
        this.settled = null;
      }
      if (this.settleDwell > 0.75 && this.settled === null) {
        this.settled = this.time - this.autoStart;
        this.log(
          active.length > 1
            ? 'GROUP STABLE：球群已在中心附近穩定'
            : 'TARGET LOCKED：球體已進入穩定範圍',
        );
      }
    }
    if (this.auto && active.length && this.ballMotion !== 'center') {
      this.rmsSum += error * error;
      this.rmsCount++;
      this.maxError = Math.max(this.maxError, error);
      this.peakTilt = Math.max(
        this.peakTilt,
        Math.hypot(this.pose[3], this.pose[4]),
      );
      this.settled = null;
      this.settleDwell = 0;
    }
    if (this.auto && lost && this.message !== 'TRACKING LOST：等待新的球體')
      this.log('TRACKING LOST：等待新的球體', 'warning');
    if (this.count % 8 === 0 && active.length) {
      const obj = balls.find((b) => b.id === active[0].id)!;
      const p = obj.body.translation();
      this.trail.push({ x: p.x, y: p.y, z: p.z });
      if (this.trail.length > 360) this.trail.shift();
    }
  }

  sample() {
    this.history.push({
      t: this.time,
      target: this.target[4] / DEG,
      actual: this.pose[4] / DEG,
      error: (this.target[4] - this.pose[4]) / DEG,
      x: this.pose[0] * 1000,
      y: this.pose[1] * 1000,
      z: (this.pose[2] - 0.48) * 1000,
      roll: this.pose[3] / DEG,
      pitch: this.pose[4] / DEG,
      yaw: this.pose[5] / DEG,
      ballX: (this.ball?.x ?? 0) * 1000,
      ballY: (this.ball?.y ?? 0) * 1000,
      ballV: this.ball?.speed ?? 0,
      lengths: this.actuators.map((a) => a.length * 1000),
      forces: this.actuators.map((a) => a.force),
      energy: this.energy,
    });
    if (this.history.length > 900) this.history.shift();
    if (this.recording) {
      this.record.push(this.snapshot());
      if (this.record.length >= 9000) {
        this.recording = false;
        this.log('錄製已達 5 分鐘上限');
      }
    }
  }
  snapshot(): RecordedFrame {
    return {
      time: this.time,
      pose: [...this.pose],
      target: [...this.target],
      basePose: [...this.basePose],
      actuators: this.actuators.map((a) => ({ ...a })),
      legFrames: this.assembly?.frames(),
      fixtureId: this.fixtureId,
      specimenDisplacement: this.specimen?.displacement,
      objects: this.objects.map((o) => ({
        id: o.id,
        type: o.type,
        position: { ...o.body.translation() },
        rotation: { ...o.body.rotation() },
      })),
    };
  }
  view() {
    return {
      ...(this.replayFrame ?? this.snapshot()),
      geometry: this.geometry,
      ballTrail: this.trail,
      path:
        this.auto && this.ballMotion === 'path' && !this.replaying
          ? { points: this.drawnPath.points, target: this.pathTarget }
          : undefined,
      maze: !this.replaying ? this.maze : null,
      checkpoint: this.mazeCheckpoint,
      gameTarget: this.playTarget ?? undefined,
      ballVector:
        !this.replaying && this.ball
          ? {
              ...this.ball,
              ax: this.ballAcceleration.x,
              ay: this.ballAcceleration.y,
              reference:
                this.playTarget ??
                (this.auto && this.ballMotion === 'path'
                  ? this.pathTarget
                  : this.auto && this.ballMotion === 'circle'
                    ? this.circleTarget
                    : { x: 0, y: 0 }),
            }
          : undefined,
      circle:
        this.auto && this.ballMotion === 'circle' && !this.replaying
          ? { radius: this.circleRadius, target: this.circleTarget }
          : undefined,
    };
  }
  startRecord() {
    this.record = [];
    this.recording = true;
    this.log('RECORDING：每秒記錄 30 組完整狀態');
  }
  replay() {
    if (!this.record.length) return this.reject('請先錄製實驗');
    this.recording = false;
    this.replaying = true;
    this.replayIndex = 0;
    this.paused = false;
    this.log('REPLAY：播放已錄製狀態');
  }
  exportExperiment() {
    return {
      format: 'StewartLab',
      version: 1,
      geometry: this.geometry,
      control: this.control,
      physics: {
        dynamic: this.dynamic,
        friction: this.friction,
        restitution: this.restitution,
        gravity: this.gravity,
        payloadOffset: this.payloadOffset,
      },
      profile: this.profile,
      scenario: this.scenario,
      circle: {
        radius: this.circleRadius,
        speed: this.circleSpeed,
        direction: this.circleDirection,
      },
      drawnPath: { points: this.pathPoints, speed: this.pathSpeed },
      initialState: this.snapshot(),
      trajectory: this.trajectory,
      result: {
        energy: this.energy,
        rms: Math.sqrt(this.rmsSum / Math.max(1, this.rmsCount)),
        settled: this.settled,
        maxError: this.maxError,
      },
      recording: this.record,
      samples: this.history,
    };
  }
  loadExperiment(data: unknown) {
    const d = data as ReturnType<Simulation['exportExperiment']>;
    if (
      d?.format !== 'StewartLab' ||
      d.version !== 1 ||
      !d.geometry ||
      !d.control ||
      !d.physics
    )
      return this.reject('不支援的實驗格式');
    if (
      !['PID', 'Cascaded PID', 'LQR', 'MPC', 'Adaptive'].includes(
        d.control.kind,
      ) ||
      ![
        d.control.kp,
        d.control.ki,
        d.control.kd,
        d.physics.gravity,
        d.physics.friction,
        d.physics.restitution,
      ].every(Number.isFinite)
    )
      return this.reject('實驗參數無效');
    if (!this.applySettings(d.geometry)) return false;
    const parameter = (value: number, fallback: number, lower: number, upper: number) =>
      Number.isFinite(value) ? clamp(value, lower, upper) : fallback;
    this.control = {
      ...DEFAULT_CONTROL,
      kind: d.control.kind,
      kp: clamp(d.control.kp, 0, 3),
      ki: clamp(d.control.ki, 0, 0.5),
      kd: clamp(d.control.kd, 0, 2),
      horizon: Math.round(parameter(d.control.horizon, DEFAULT_CONTROL.horizon, 4, 100)),
      rate: [60, 120, 240].includes(d.control.rate) ? d.control.rate : DEFAULT_CONTROL.rate,
      noise: parameter(d.control.noise, DEFAULT_CONTROL.noise, 0, 8),
      bias: parameter(d.control.bias, DEFAULT_CONTROL.bias, -10, 10),
      dropout: parameter(d.control.dropout, DEFAULT_CONTROL.dropout, 0, 0.8),
      delay: parameter(d.control.delay, DEFAULT_CONTROL.delay, 0, 300),
      damping: parameter(d.control.damping, DEFAULT_CONTROL.damping, 0.1, 3),
    };
    this.dynamic = !!d.physics.dynamic;
    this.gravity = clamp(d.physics.gravity, 0, 20);
    this.payloadOffset = Number.isFinite(d.physics.payloadOffset) ? clamp(d.physics.payloadOffset, -0.15, 0.15) : 0;
    this.fixtureId = isFixtureId(d.initialState?.fixtureId) ? d.initialState.fixtureId : 'manual';
    this.friction = clamp(d.physics.friction, 0, 1.5);
    this.restitution = clamp(d.physics.restitution, 0, 1);
    this.initialize();
    if (
      ['S-Curve', 'Minimum Jerk', 'Linear', 'Trapezoid', 'Step'].includes(
        d.profile,
      )
    )
      this.profile = d.profile;
    if (d.circle) this.configureCircle(d.circle);
    if (d.drawnPath && Array.isArray(d.drawnPath.points))
      this.configurePath(d.drawnPath.points, d.drawnPath.speed);
    if (
      Array.isArray(d.initialState?.target) &&
      d.initialState.target.length === 6
    )
      this.setPose(d.initialState.target);
    if (Array.isArray(d.trajectory))
      this.trajectory = d.trajectory
        .filter(
          (f) =>
            Number.isFinite(f.t) &&
            f.t >= 0 &&
            Array.isArray(f.pose) &&
            f.pose.length === 6 &&
            f.pose.every(Number.isFinite),
        )
        .sort((a, b) => a.t - b.t)
        .filter((f, i, all) => i === 0 || f.t > all[i - 1].t)
        .slice(0, 30);
    if (this.trajectory.length < 2 || this.trajectory.at(-1)!.t <= 0)
      this.trajectory = [];
    const frames = Array.isArray(d.recording) ? d.recording.slice(0, 9000) : [];
    const finiteVector = (v: RAPIER.Vector | undefined) => v && [v.x, v.y, v.z].every(Number.isFinite);
    const validFrames = frames.every(
      (f, i) =>
        f && Number.isFinite(f.time) &&
        (i === 0 || f.time >= frames[i - 1].time) &&
        [f.pose, f.target, f.basePose].every(
          (p) => Array.isArray(p) && p.length === 6 && p.every(Number.isFinite),
        ) &&
        Array.isArray(f.actuators) &&
        f.actuators.length === 6 &&
        f.actuators.every((a) =>
          a && Number.isFinite(a.length) && Number.isFinite(a.force) && Object.values(a).every(
            (v) =>
              typeof v === 'boolean' ||
              (typeof v === 'number' && Number.isFinite(v)),
          ),
        ) &&
        (f.legFrames === undefined || (Array.isArray(f.legFrames) && f.legFrames.length === 6 &&
          f.legFrames.every(leg => leg && finiteVector(leg.base) && finiteVector(leg.top) &&
            finiteVector(leg.rotation) && Number.isFinite(leg.rotation.w)))) &&
        (f.fixtureId === undefined || isFixtureId(f.fixtureId)) &&
        (f.specimenDisplacement === undefined || Number.isFinite(f.specimenDisplacement)) &&
        Array.isArray(f.objects) &&
        f.objects.length <= 12 &&
        f.objects.every(
          (o) =>
            o && Number.isFinite(o.id) &&
            ['ball', 'steel', 'cube', 'cylinder', 'weight'].includes(o.type) &&
            finiteVector(o.position) && finiteVector(o.rotation) && Number.isFinite(o.rotation.w),
        ),
    );
    this.record = validFrames ? frames : [];
    this.log(validFrames ? '實驗設定已載入，模擬從原點開始' : '設定已載入，錄製影格格式無效而未載入', validFrames ? 'info' : 'warning');
    return true;
  }
  command(text: string) {
    const s = text.trim().toLowerCase();
    let m;
    if (
      (m = s.match(/^pose\s+(x|y|z|roll|pitch|yaw)\s+([-+\d.]+)(deg|mm)?$/))
    ) {
      const index = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'].indexOf(m[1]),
        p = [...this.target] as Pose;
      p[index] =
        Number(m[2]) * (index < 3 ? 0.001 : DEG) + (index === 2 ? 0.48 : 0);
      return this.setPose(p);
    }
    if ((m = s.match(/^actuator\s+([1-6])\s+length\s+([-+\d.]+)(mm)?$/)))
      return this.setActuator(Number(m[1]) - 1, Number(m[2]) * 0.001);
    if (s === 'home') {
      this.home();
      return true;
    }
    if (s === 'ball.spawn') {
      this.spawn();
      return true;
    }
    if (s === 'center on') {
      this.setAuto(true);
      return true;
    }
    if (s === 'center off') {
      this.setAuto(false);
      return true;
    }
    if (s === 'estop') {
      this.stop();
      return true;
    }
    if (s === 'reset') {
      this.initialize();
      return true;
    }
    if (s === 'disturbance') {
      this.impulse();
      return true;
    }
    if ((m = s.match(/^controller (pid|lqr|mpc)$/))) {
      this.control.kind = m[1].toUpperCase() as 'PID' | 'LQR' | 'MPC';
      return true;
    }
    return this.reject(
      '指令未識別：pose pitch 5deg / actuator 3 length 490mm / home / ball.spawn / center on / estop',
    );
  }
  dispose() {
    this.eventQueue.free();
    this.world.free();
  }
}
