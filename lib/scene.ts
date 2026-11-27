import * as T from "three";
import { launchVelocity, type LaunchSettings } from "./launch";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  makePlates,
  makeLeg,
  positionActuator,
  makeFixture,
  makeInstrumentFloor,
  makeContactShadow,
} from "./machined-model";
import { ServiceCable } from "./service-cable";
import { actuatorMount } from "./actuator-mount";
import { mazeFloor, MAZE_BOUNDARY, type Maze } from "./mazes";
import {
  HOME,
  DEFAULT_GEOMETRY,
  actuatorDimensions,
  endpoints,
  quaternion,
  type Pose,
  type Geometry,
} from "./kinematics";
export type VisualState = {
  fixtureId?: string;
  specimenDisplacement?: number;
  legFrames?: {
    base: { x: number; y: number; z: number };
    top: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  }[];
  pose: Pose;
  target: Pose;
  basePose: Pose;
  geometry: Geometry;
  actuators: { force: number; length: number }[];
  objects: {
    id: number;
    type: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  }[];
  ballTrail?: { x: number; y: number; z: number }[];
  circle?: { radius: number; target: { x: number; y: number } };
  path?: {
    points: { x: number; y: number }[];
    target: { x: number; y: number };
  };
  maze?: Maze | null;
  checkpoint?: number;
  gameTarget?: { x: number; y: number; radius: number; safeRadius?: number };
  ballVector?: {
    targetId?: number | null;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    ax: number;
    ay: number;
    lost: boolean;
    reference: { x: number; y: number };
  };
};
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export class LabScene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(32, 1, 0.01, 50);
  controls: OrbitControls;
  base = new T.Group();
  top = new T.Group();
  ghost = new T.Group();
  legs: ReturnType<typeof makeLeg>[] = [];
  private cables: ServiceCable[] = [];
  private mounts: ReturnType<typeof actuatorMount>[] = [];
  balls = new Map<number, T.Mesh>();
  forceArrows: T.ArrowHelper[] = [];
  grid: T.Object3D;
  application = "manual";
  fixture?: T.Group;
  private fixtureHeight = 0;
  private cameraPreset = "orbit";
  private envTarget: T.WebGLRenderTarget | null = null;
  private floorMesh!: T.Mesh;
  private defaultAngle = 35;
  workspace = new T.Group();
  trail: T.Line;
  axes = new T.AxesHelper(0.16);
  resize: ResizeObserver;
  transform: TransformControls;
  selected = -1;
  exploded = false;
  xray = false;
  showForces = false;
  heat = false;
  cinematic = false;
  showBallVectors = true;
  onAfterRender?: (canvas: HTMLCanvasElement) => void;
  onBeforeRender?: () => void;
  onThrowPreview?: (value: { x: number; y: number; speed: number } | null) => void;
  mazeGroup = new T.Group();
  pathGroup = new T.Group();
  vectorGroup = new T.Group();
  mazeId = "";
  pathIdentity: unknown = null;
  velocityArrow = new T.ArrowHelper(v(1, 0, 0), v(), 0.1, 0x79efd2, 0.014, 0.007);
  accelerationArrow = new T.ArrowHelper(v(1, 0, 0), v(), 0.1, 0xf3bb71, 0.014, 0.007);
  targetArrow = new T.ArrowHelper(v(1, 0, 0), v(), 0.1, 0xb59bff, 0.012, 0.006);
  gameGroup = new T.Group();
  gameRing = new T.Mesh(
    new T.RingGeometry(0.93, 1, 48),
    new T.MeshBasicMaterial({
      color: 0xf8c773,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.9,
    }),
  );
  safeRing = new T.Mesh(
    new T.RingGeometry(0.985, 1, 64),
    new T.MeshBasicMaterial({
      color: 0xf19a76,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.7,
    }),
  );
  pathMarker = new T.Mesh(
    new T.RingGeometry(0.007, 0.011, 24),
    new T.MeshBasicMaterial({
      color: 0xc6afff,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  landingMarker = new T.Mesh(
    new T.RingGeometry(0.02, 0.023, 32),
    new T.MeshBasicMaterial({
      color: 0xf3bd76,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  private throwPoint: T.Vector3 | null = null;
  private throwPointer: number | null = null;
  private throwConfig: LaunchSettings | null = null;
  geometry = { ...DEFAULT_GEOMETRY };
  onSelect?: (i: number) => void;
  onPose?: (p: Pose) => void;
  launchConfig: LaunchSettings | null = null;
  launchGroup = new T.Group();
  circleGroup = new T.Group();
  circleGuide = new T.Line(
    new T.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) =>
        v(Math.cos((i / 96) * Math.PI * 2), Math.sin((i / 96) * Math.PI * 2), 0),
      ),
    ),
    new T.LineDashedMaterial({
      color: 0xe3bc79,
      dashSize: 0.012,
      gapSize: 0.007,
      transparent: true,
      opacity: 0.8,
    }),
  );
  circleMarker = new T.Mesh(
    new T.RingGeometry(0.007, 0.011, 24),
    new T.MeshBasicMaterial({
      color: 0x8cf0d4,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  launchLine = new T.Line(
    new T.BufferGeometry().setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(240), 3),
    ),
    new T.LineDashedMaterial({
      color: 0x79d9ca,
      dashSize: 0.02,
      gapSize: 0.012,
      transparent: true,
      opacity: 0.9,
    }),
  );
  launchMarker = new T.Mesh(
    new T.SphereGeometry(0.02, 20, 14),
    new T.MeshBasicMaterial({
      color: 0x8de7d1,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    }),
  );
  lastState?: VisualState;
  frame = 0;
  raf = 0;
  private renderingActive = true;
  disposed = false;
  geometryKey = "";
  materials: T.Material[] = [];
  dragging = false;
  onThrow?: (x: number, y: number, vx: number, vy: number) => void;
  throwing = false;
  throwStart: { x: number; y: number } | null = null;
  private activePointers = new Set<number>();
  private pickStart: { id: number; x: number; y: number } | null = null;
  constructor(public container: HTMLElement) {
    this.scene.add(this.mazeGroup, this.pathGroup, this.vectorGroup, this.landingMarker);
    this.scene.add(this.gameGroup);
    this.gameGroup.add(this.gameRing, this.safeRing);
    this.landingMarker.visible = false;
    this.vectorGroup.add(this.velocityArrow, this.accelerationArrow, this.targetArrow);
    this.pathGroup.add(this.pathMarker);
    this.circleGroup.add(this.circleGuide, this.circleMarker);
    this.circleGroup.visible = false;
    this.scene.add(this.circleGroup);
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    container.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0.94, -1.35, 0.93);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.157);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.65;
    this.controls.maxDistance = 3.8;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.scene.background = new T.Color("#e1e4e4");
    const pmrem = new T.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.03);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.78;
    this.scene.environmentRotation.z = -0.36;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new T.HemisphereLight(0xf3f8ff, 0x8c918a, 0.64));
    const key = new T.DirectionalLight(0xfff3da, 2.2);
    key.position.set(-1.4, -1.8, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    Object.assign(key.shadow.camera, {
      left: -0.85,
      right: 0.85,
      top: 0.85,
      bottom: -0.85,
      near: 0.2,
      far: 7,
    });
    key.shadow.normalBias = 0.001;
    key.shadow.bias = -0.00016;
    key.shadow.radius = 3.5;
    this.scene.add(key);
    const rim = new T.DirectionalLight(0xc9e2ff, 1.55);
    rim.position.set(1.6, 0.9, 1.8);
    this.scene.add(rim);
    const floor = makeInstrumentFloor();
    this.floorMesh = floor;
    this.scene.add(floor, makeContactShadow());
    const catcher = new T.Mesh(
      new T.PlaneGeometry(8, 8),
      new T.ShadowMaterial({ opacity: 0.15, depthWrite: false }),
    );
    catcher.position.z = -0.0728;
    catcher.receiveShadow = true;
    this.scene.add(catcher);
    this.grid = new T.Object3D();
    this.scene.add(this.base, this.top, this.ghost, this.workspace, this.launchGroup);
    this.launchGroup.add(this.launchLine, this.launchMarker);
    this.launchGroup.visible = false;
    this.top.add(this.axes);
    this.axes.position.z = 0.023;
    this.trail = new T.Line(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({
        color: 0x65ded1,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.scene.add(this.trail);
    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.65);
    this.transform.setSpace("world");
    this.transform.enabled = false;
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (e) => {
      this.controls.enabled = !e.value;
      this.dragging = Boolean(e.value);
      if (this.dragging) this.pickStart = null;
    });
    this.transform.addEventListener("objectChange", () => {
      const e = new T.Euler().setFromQuaternion(this.ghost.quaternion, "ZYX");
      this.onPose?.([
        this.ghost.position.x,
        this.ghost.position.y,
        this.ghost.position.z,
        e.x,
        e.y,
        e.z,
      ]);
    });
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointercancel", this.pointerCancel);
    this.renderer.domElement.style.touchAction = "none";
    this.resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (w && h) {
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.fov = T.MathUtils.radToDeg(
          2 *
            Math.atan(
              Math.tan(T.MathUtils.degToRad(this.defaultAngle) / 2) *
                Math.max(1, 1.12 / this.camera.aspect),
            ),
        );
        this.camera.updateProjectionMatrix();
      }
    });
    this.resize.observe(container);
    this.rebuild(DEFAULT_GEOMETRY);
    this.update({
      pose: HOME,
      target: HOME,
      basePose: [0, 0, 0, 0, 0, 0],
      geometry: DEFAULT_GEOMETRY,
      actuators: [],
      objects: [],
    });
    this.draw();
  }
  cylinder(radius: number, height: number, material: T.Material, segments = 32) {
    const m = new T.Mesh(
      new T.CylinderGeometry(radius, radius, height, segments).rotateX(Math.PI / 2),
      material,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  label(text: string, color = "#9db7c0", size = 0.045) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.font = "500 29px monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 41);
    const map = new T.CanvasTexture(c),
      s = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, transparent: true }));
    s.scale.set(size * 4, size, 1);
    return s;
  }
  clear(group: T.Group) {
    while (group.children.length) {
      const child = group.children[0];
      child.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.Line) {
          o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => {
            (m as T.MeshStandardMaterial).map?.dispose();
            m.dispose();
          });
        }
      });
      group.remove(child);
    }
  }
  rebuild(g: Geometry) {
    this.geometry = { ...g };
    this.geometryKey = `${g.baseRadius}/${g.topRadius}/${g.maxLength}`;
    this.clear(this.base);
    this.clear(this.top);
    this.clear(this.ghost);
    this.clear(this.workspace);
    this.legs.forEach((l) => {
      this.clear(l);
      this.scene.remove(l);
    });
    this.legs = [];
    this.cables.forEach((c) => {
      this.scene.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    });
    this.cables = [];
    this.forceArrows.forEach((a) => this.scene.remove(a));
    this.forceArrows = [];
    const { lower, upper } = makePlates(g);
    this.base.add(lower);
    this.top.add(upper);
    this.axes = new T.AxesHelper(0.14);
    this.axes.position.z = 0.025;
    this.axes.visible = false;
    this.top.add(this.axes);
    this.fixture = makeFixture(this.application);
    this.top.add(this.fixture);
    const ghostPlate = this.cylinder(
      g.topRadius + 0.043,
      0.004,
      new T.MeshBasicMaterial({
        color: 0xff6a27,
        wireframe: true,
        transparent: true,
        opacity: 0.27,
      }),
      6,
    );
    this.ghost.add(ghostPlate);
    const e = endpoints(HOME, g);
    this.mounts = e.base.map(actuatorMount);
    for (let i = 0; i < 6; i++) {
      const leg = makeLeg(i, g);
      this.legs.push(leg);
      this.scene.add(leg);
      const cable = new ServiceCable();
      this.cables.push(cable);
      this.scene.add(cable);
      const arrow = new T.ArrowHelper(v(0, 0, 1), e.base[i], 0.18, 0xda6924, 0.035, 0.015);
      this.forceArrows.push(arrow);
      this.scene.add(arrow);
    }
    const w = new T.Mesh(
      new T.CylinderGeometry(0.16, 0.2, 0.22, 48, 8, true),
      new T.MeshBasicMaterial({
        color: 0x4bc9cb,
        wireframe: true,
        transparent: true,
        opacity: 0.055,
      }),
    );
    w.rotation.x = Math.PI / 2;
    w.position.z = 0.48;
    this.workspace.add(w);
    this.workspace.visible = false;
    this.setXray(this.xray);
  }
  update(s: VisualState) {
    this.lastState = s;
    if ((s.fixtureId ?? "manual") !== this.application)
      this.setApplication(s.fixtureId ?? "manual");
    if (this.launchConfig) this.updateLaunchPreview();
    if (
      this.geometryKey !==
      `${s.geometry.baseRadius}/${s.geometry.topRadius}/${s.geometry.maxLength}`
    )
      this.rebuild(s.geometry);
    const movingSpecimen = this.fixture?.getObjectByName("moving-specimen");
    if (movingSpecimen) movingSpecimen.position.x = s.specimenDisplacement ?? 0;
    this.base.position.set(s.basePose[0], s.basePose[1], s.basePose[2]);
    this.base.quaternion.copy(quaternion(s.basePose));
    this.top.position.set(s.pose[0], s.pose[1], s.pose[2] + (this.exploded ? 0.22 : 0));
    this.top.quaternion.copy(quaternion(s.pose));
    if (!this.dragging) {
      this.ghost.position.set(s.target[0], s.target[1], s.target[2]);
      this.ghost.quaternion.copy(quaternion(s.target));
    }
    this.ghost.visible = this.transform.enabled;
    const e = endpoints(s.pose, s.geometry, s.basePose);
    const dimensions = actuatorDimensions(s.geometry.maxLength);
    this.legs.forEach((leg, i) => {
      const frame = s.legFrames?.[i],
        base = frame ? v(frame.base.x, frame.base.y, frame.base.z) : e.base[i];
      const top = frame ? v(frame.top.x, frame.top.y, frame.top.z) : e.top[i];
      const mount = this.mounts[i];
      const dir = positionActuator(leg, base, top, mount.neutral, this.base.quaternion, dimensions.rod);
      if (this.exploded) leg.position.addScaledVector(base, 0.22);
      const plug = mount.cableSocket.clone();
      const exit = v(0, (0.014 * dimensions.barrel) / 0.345, 0.052)
        .applyQuaternion(leg.quaternion)
        .add(leg.position);
      this.cables[i].updateAnchors(
        exit,
        plug.applyQuaternion(this.base.quaternion).add(this.base.position),
      );
      this.cables[i].visible = !this.exploded;
      const sleeve = leg.sleeve.getObjectByName("coated") as T.Mesh;
      const mat = sleeve.material as T.MeshStandardMaterial;
      if (i === this.selected) mat.emissive.setHex(0x6b280a);
      else if (this.heat)
        mat.emissive.setRGB(
          0.64 * Math.min(1, Math.abs(s.actuators[i]?.force || 0) / s.geometry.maxForce),
          0.025,
          0,
        );
      else mat.emissive.setHex(0);
      this.forceArrows[i].visible = this.showForces;
      this.forceArrows[i].position.copy(base);
      this.forceArrows[i].setDirection(dir);
      this.forceArrows[i].setLength(
        0.08 + Math.min(0.3, Math.abs(s.actuators[i]?.force || 0) / 2000),
        0.027,
        0.012,
      );
    });
    const ids = new Set(s.objects.map((o) => o.id));
    for (const [id, m] of this.balls)
      if (!ids.has(id)) {
        this.scene.remove(m);
        m.traverse((child) => {
          if (child instanceof T.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.dispose());
          }
        });
        this.balls.delete(id);
      }
    for (const o of s.objects) {
      let mesh = this.balls.get(o.id);
      if (!mesh) {
        mesh = new T.Mesh(
          o.type === "cube" || o.type === "weight"
            ? new T.BoxGeometry(0.065, 0.065, 0.065)
            : o.type === "cylinder"
              ? new T.CylinderGeometry(0.025, 0.025, 0.075, 24).rotateX(Math.PI / 2)
              : new T.SphereGeometry(0.02, 32, 24),
          new T.MeshStandardMaterial({
            color:
              o.type === "ball"
                ? 0xf0e6cf
                : o.type === "steel"
                  ? 0x99acb6
                  : o.type === "cube"
                    ? 0x9b6b40
                    : 0x385b6d,
            metalness: o.type === "steel" ? 0.95 : 0.15,
            roughness: o.type === "steel" ? 0.14 : 0.44,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.balls.set(o.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(o.position.x, o.position.y, o.position.z);
      mesh.quaternion.set(o.rotation.x, o.rotation.y, o.rotation.z, o.rotation.w);
      if (o.type === "ball" && mesh.children.length === 0) {
        const band = new T.Mesh(
          new T.TorusGeometry(0.0201, 0.0008, 6, 48),
          new T.MeshStandardMaterial({ color: 0x25a78c, roughness: 0.6 }),
        );
        mesh.add(band);
        const dot = new T.Mesh(
          new T.SphereGeometry(0.0027, 8, 8),
          new T.MeshStandardMaterial({ color: 0x23495c, roughness: 0.7 }),
        );
        dot.position.z = 0.0198;
        mesh.add(dot);
      }
    }
    if (s.ballTrail) {
      this.trail.geometry.dispose();
      this.trail.geometry = new T.BufferGeometry().setFromPoints(
        s.ballTrail.map((p) => v(p.x, p.y, p.z)),
      );
    }
    this.circleGroup.visible = !!s.circle && !this.exploded;
    if (s.circle) {
      this.circleGroup.position.set(s.pose[0], s.pose[1], s.pose[2]);
      this.circleGroup.quaternion.copy(quaternion(s.pose));
      this.circleGuide.scale.setScalar(s.circle.radius);
      this.circleGuide.position.z = 0.025;
      this.circleGuide.computeLineDistances();
      this.circleMarker.position.set(s.circle.target.x, s.circle.target.y, 0.026);
    }
    this.updatePlayScene(s);
  }
  updatePlayScene(s: VisualState) {
    this.gameGroup.visible = !!s.gameTarget && !s.maze && !this.exploded;
    this.gameGroup.position.set(s.pose[0], s.pose[1], s.pose[2]);
    this.gameGroup.quaternion.copy(quaternion(s.pose));
    if (s.gameTarget) {
      const t = s.gameTarget;
      this.gameRing.position.set(t.x, t.y, 0.027);
      this.gameRing.scale.setScalar(t.radius);
      this.safeRing.visible = !!t.safeRadius;
      this.safeRing.position.z = 0.027;
      this.safeRing.scale.setScalar(t.safeRadius ?? 1);
    }
    this.top.visible = !s.maze;
    this.mazeGroup.visible = !!s.maze && !this.exploded;
    this.mazeGroup.position.set(s.pose[0], s.pose[1], s.pose[2]);
    this.mazeGroup.quaternion.copy(quaternion(s.pose));
    if ((s.maze?.id ?? "") !== this.mazeId) {
      this.mazeId = s.maze?.id ?? "";
      this.clear(this.mazeGroup);
      if (s.maze) {
        for (const cell of mazeFloor(s.maze)) {
          const m = new T.Mesh(
            new T.BoxGeometry(cell.w, cell.d, 0.038),
            new T.MeshStandardMaterial({
              color: 0x244654,
              roughness: 0.64,
              metalness: 0.35,
            }),
          );
          m.position.set(cell.x, cell.y, 0.003);
          m.castShadow = true;
          m.receiveShadow = true;
          this.mazeGroup.add(m);
        }
        for (const wall of [...MAZE_BOUNDARY, ...s.maze.walls]) {
          const m = new T.Mesh(
            new T.BoxGeometry(wall.w, wall.d, 0.056),
            new T.MeshStandardMaterial({
              color: 0xadcbd0,
              metalness: 0.45,
              roughness: 0.3,
            }),
          );
          m.position.set(wall.x, wall.y, 0.05);
          m.castShadow = true;
          m.receiveShadow = true;
          this.mazeGroup.add(m);
        }
        for (const [hIndex, hole] of s.maze.holes.entries()) {
          const line = new T.LineLoop(
            new T.BufferGeometry().setFromPoints([
              v(hole.x - hole.w / 2, hole.y - hole.d / 2, 0.024),
              v(hole.x + hole.w / 2, hole.y - hole.d / 2, 0.024),
              v(hole.x + hole.w / 2, hole.y + hole.d / 2, 0.024),
              v(hole.x - hole.w / 2, hole.y + hole.d / 2, 0.024),
            ]),
            new T.LineBasicMaterial({ color: 0xf28678 }),
          );
          line.name = `hole-${hIndex}`;
          this.mazeGroup.add(line);
        }
        [s.maze.start, ...s.maze.checkpoints, s.maze.goal].forEach((p, i) => {
          const ring = new T.Mesh(
            new T.RingGeometry(0.023, 0.027, 40),
            new T.MeshBasicMaterial({
              color:
                i === 0 ? 0x687e87 : i === s.maze!.checkpoints.length + 1 ? 0xf2c375 : 0x75eacf,
              side: T.DoubleSide,
              transparent: true,
            }),
          );
          ring.position.set(p.x, p.y, 0.024);
          ring.userData.checkpoint = i - 1;
          this.mazeGroup.add(ring);
        });
      }
    }
    this.mazeGroup.children.forEach((o) => {
      if (o.userData.checkpoint !== undefined && o instanceof T.Mesh) {
        const i = o.userData.checkpoint as number,
          m = o.material as T.MeshBasicMaterial;
        m.opacity =
          i < 0 ? 0.4 : i < (s.checkpoint ?? 0) ? 0.25 : i === (s.checkpoint ?? 0) ? 1 : 0.45;
      }
    });
    this.pathGroup.visible = !!s.path && !this.exploded;
    this.pathGroup.position.set(s.pose[0], s.pose[1], s.pose[2]);
    this.pathGroup.quaternion.copy(quaternion(s.pose));
    if (s.path && this.pathIdentity !== s.path.points) {
      this.pathIdentity = s.path.points;
      const old = this.pathGroup.getObjectByName("guide");
      if (old instanceof T.Line) {
        old.geometry.dispose();
        (old.material as T.Material).dispose();
        this.pathGroup.remove(old);
      }
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(
          [...s.path.points, s.path.points[0]].map((p) => v(p.x, p.y, 0.026)),
        ),
        new T.LineBasicMaterial({ color: 0xb8a0ff }),
      );
      line.name = "guide";
      this.pathGroup.add(line);
    }
    if (s.path) this.pathMarker.position.set(s.path.target.x, s.path.target.y, 0.027);
    const b = s.ballVector;
    this.vectorGroup.visible = !!b && !b.lost && this.showBallVectors && !this.exploded;
    this.vectorGroup.position.set(s.pose[0], s.pose[1], s.pose[2]);
    this.vectorGroup.quaternion.copy(quaternion(s.pose));
    if (b) {
      const arrows: [
        [T.ArrowHelper, number, number, number],
        [T.ArrowHelper, number, number, number],
        [T.ArrowHelper, number, number, number],
      ] = [
        [this.velocityArrow, b.vx, b.vy, 0.7],
        [this.accelerationArrow, b.ax, b.ay, 0.14],
        [this.targetArrow, b.reference.x - b.x, b.reference.y - b.y, 1],
      ];
      arrows.forEach(([arrow, x, y, scale]) => {
        const length = Math.hypot(x, y);
        arrow.visible = length > 0.003;
        arrow.position.set(b.x, b.y, b.z + 0.012);
        if (length) {
          arrow.setDirection(v(x / length, y / length, 0));
          arrow.setLength(Math.min(0.16, Math.max(0.012, length * scale)), 0.012, 0.006);
        }
      });
    }
  }
  projectAnchor(part: "plate" | "actuator" | "base") {
    let point: T.Vector3;
    if (part === "plate")
      point = this.top.localToWorld(v(0, -this.geometry.topRadius * 0.64, 0.022));
    else if (part === "base")
      point = this.base.localToWorld(v(this.geometry.baseRadius * 0.79, 0, 0.028));
    else point = this.legs[3].localToWorld(v(0, 0.21, 0));
    point.project(this.camera);
    return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
  }
  setApplication(id: string) {
    if (id === this.application) return;
    this.application = id;
    if (this.fixture) {
      this.clear(this.fixture);
      this.top.remove(this.fixture);
    }
    this.fixture = makeFixture(id);
    const bounds = new T.Box3().setFromObject(this.fixture);
    const newHeight = bounds.isEmpty() ? 0 : Math.max(0, bounds.max.z - 0.055);
    this.adjustFraming(this.fixtureHeight, newHeight);
    this.fixtureHeight = newHeight;
    this.top.add(this.fixture);
    this.setXray(this.xray);
  }
  setLaunchPreview(config: LaunchSettings | null) {
    this.launchConfig = config;
    this.launchGroup.visible = !!config;
    if (!config) this.landingMarker.visible = false;
    if (config) this.updateLaunchPreview();
  }
  updateLaunchPreview() {
    if (!this.launchConfig || !this.lastState) return;
    const c = this.launchConfig,
      pose = this.lastState.pose,
      q = quaternion(pose),
      origin = v(pose[0], pose[1], pose[2]),
      start = v(c.x, c.y, 0.022 + c.height)
        .applyQuaternion(q)
        .add(origin),
      raw = launchVelocity(c),
      velocity = v(raw.x, raw.y, raw.z).applyQuaternion(q);
    this.launchMarker.position.copy(start);
    const attribute = this.launchLine.geometry.getAttribute("position") as T.BufferAttribute;
    let n = 0;
    for (let i = 0; i < 80; i++) {
      const t = i * 0.02,
        p = start
          .clone()
          .addScaledVector(velocity, t)
          .add(v(0, 0, -0.5 * 9.81 * t * t));
      attribute.setXYZ(i, p.x, p.y, p.z);
      n++;
      const local = p.clone().sub(origin).applyQuaternion(q.clone().invert());
      if (local.z < 0.042 && i > 0) break;
    }
    attribute.needsUpdate = true;
    this.launchLine.geometry.setDrawRange(0, n);
    this.launchLine.computeLineDistances();
    if (n > 1) {
      const i = n - 1;
      const p = v(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      const local = p.clone().sub(origin).applyQuaternion(q.clone().invert());
      this.landingMarker.position.copy(v(local.x, local.y, 0.025).applyQuaternion(q).add(origin));
      this.landingMarker.quaternion.copy(q);
      this.landingMarker.visible = this.launchGroup.visible;
    }
  }
  setXray(on: boolean) {
    this.xray = on;
    for (const g of [this.base, this.top, ...this.legs.map((leg) => leg.sleeve)])
      g.traverse((o) => {
        if (o instanceof T.Mesh) {
          const m = o.material as T.MeshStandardMaterial;
          m.transparent = on;
          m.opacity = on ? 0.25 : 1;
          m.depthWrite = !on;
        }
      });
  }
  setManipulator(mode: string) {
    this.transform.detach();
    this.transform.enabled = mode !== "off";
    if (mode !== "off") {
      this.transform.attach(this.ghost);
      this.transform.setMode(mode === "rotate" ? "rotate" : "translate");
    }
    this.ghost.visible = mode !== "off";
  }
  preset(name: string) {
    this.cameraPreset = name;
    this.cinematic = name === "cinematic";
    const presets: Record<string, number[]> = {
      orbit: [0.94, -1.35, 0.93],
      front: [0, -1.9, 0.45],
      side: [1.9, 0, 0.45],
      top: [0, -0.001, 2.1],
      iso: [1.2, -1.2, 1.3],
      actuator: [0.58, -0.63, 0.4],
      ball: [0, -0.4, 1.15],
      cinematic: [1.2, -1.4, 0.8],
    };
    const p = presets[name] || presets.orbit;
    this.camera.position.set(p[0], p[1], p[2]);
    this.controls.target.set(0, 0, name === "ball" ? 0.48 : 0.157);
    this.adjustFraming(0, this.fixtureHeight);
    this.controls.update();
  }
  private adjustFraming(previous: number, current: number) {
    if (!["orbit", "front", "side", "iso"].includes(this.cameraPreset)) return;
    const target = this.controls.target;
    this.camera.position.sub(target).multiplyScalar((1 + current) / (1 + previous));
    target.z += (current - previous) * 0.4;
    this.camera.position.add(target);
  }
  pointerDown = (e: PointerEvent) => {
    this.activePointers.add(e.pointerId);
    this.pickStart =
      this.activePointers.size === 1 &&
      e.isPrimary &&
      e.button === 0 &&
      !this.throwing &&
      !this.dragging
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
    if (this.throwing) {
      if (!e.isPrimary || e.button !== 0 || this.throwPointer !== null) return;
      const point = this.localPointer(e);
      if (!point || Math.hypot(point.x, point.y) > 0.23) return;
      e.preventDefault();
      this.throwPoint = point;
      this.throwPointer = e.pointerId;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.throwStart = { x: e.clientX, y: e.clientY };
      this.controls.enabled = false;
      this.pointerMove(e);
    }
  };
  localPointer(e: PointerEvent) {
    if (!this.lastState) return null;
    const r = this.renderer.domElement.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const pose = this.lastState.pose,
      q = quaternion(pose),
      origin = v(pose[0], pose[1], pose[2]),
      plane = new T.Plane().setFromNormalAndCoplanarPoint(
        v(0, 0, 1).applyQuaternion(q),
        v(0, 0, 0.022).applyQuaternion(q).add(origin),
      );
    const hit = ray.ray.intersectPlane(plane, v());
    return hit ? hit.sub(origin).applyQuaternion(q.invert()) : null;
  }
  pointerMove = (e: PointerEvent) => {
    const pick = this.pickStart;
    if (pick && pick.id === e.pointerId && Math.hypot(e.clientX - pick.x, e.clientY - pick.y) > 5)
      this.pickStart = null;
    if (!this.throwPoint || this.throwPointer !== e.pointerId) return;
    const end = this.localPointer(e);
    if (!end) return;
    const dx = end.x - this.throwPoint.x,
      dy = end.y - this.throwPoint.y,
      speed = Math.min(0.85, Math.hypot(dx, dy) * 2.5);
    this.throwConfig = {
      x: this.throwPoint.x,
      y: this.throwPoint.y,
      height: 0.12,
      azimuth: (Math.atan2(dy, dx) * 180) / Math.PI,
      elevation: 0,
      speed,
    };
    this.setLaunchPreview(this.throwConfig);
    this.onThrowPreview?.({
      x: this.throwPoint.x,
      y: this.throwPoint.y,
      speed,
    });
  };
  cancelThrow = () => {
    this.throwStart = null;
    this.throwPoint = null;
    this.throwConfig = null;
    this.throwPointer = null;
    this.throwing = false;
    this.controls.enabled = true;
    this.setLaunchPreview(null);
    this.landingMarker.visible = false;
    this.onThrowPreview?.(null);
  };
  pointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.pickStart = null;
    if (e.pointerId === this.throwPointer) this.cancelThrow();
  };
  pointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    const pick = this.pickStart;
    this.pickStart = null;
    if (this.throwStart) {
      if (e.pointerId !== this.throwPointer) return;
      const config = this.throwConfig;
      if (config) {
        const velocity = launchVelocity(config);
        this.onThrow?.(config.x, config.y, velocity.x, velocity.y);
      }
      if (this.renderer.domElement.hasPointerCapture(e.pointerId))
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      this.cancelThrow();
      return;
    }
    if (
      this.dragging ||
      !pick ||
      pick.id !== e.pointerId ||
      Math.hypot(e.clientX - pick.x, e.clientY - pick.y) > 5
    )
      return;
    const r = this.container.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = ray.intersectObjects(this.legs, true)[0];
    if (hit) {
      let o: T.Object3D | null = hit.object;
      while (o && o.userData.actuator === undefined) o = o.parent;
      if (o) this.onSelect?.(o.userData.actuator);
    }
  };
  setRenderingActive(active: boolean) {
    if (this.disposed || this.renderingActive === active) return;
    this.renderingActive = active;
    if (active) this.raf = requestAnimationFrame(this.draw);
    else cancelAnimationFrame(this.raf);
  }
  draw = () => {
    if (this.disposed || !this.renderingActive) return;
    if (this.cinematic) {
      const t = performance.now() * 0.00008;
      this.camera.position.set(1.65 * Math.cos(t), 1.65 * Math.sin(t), 0.92);
    }
    this.onBeforeRender?.();
    this.controls.update();
    (this.floorMesh.material as T.ShaderMaterial).uniforms.showGrid.value = this.grid.visible
      ? 1
      : 0;
    this.renderer.render(this.scene, this.camera);
    this.onAfterRender?.(this.renderer.domElement);
    this.frame++;
    this.raf = requestAnimationFrame(this.draw);
  };
  screenshot() {
    return this.renderer.domElement.toDataURL("image/png");
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls.dispose();
    this.transform.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.removeEventListener("pointercancel", this.pointerCancel);
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          (m as T.MeshStandardMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
    this.envTarget?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
