import { DEG, HOME, clamp, limits, type Pose } from "./kinematics";
import { DT, type Simulation } from "./simulation";
import { newWorldFrame } from "./worlds/types";
import { raceCourse } from "./worlds/race-course";
import { sampleVesselWave } from "./worlds/wave-field";

const motionCatalog = {
  label: "Moog 小型六自由度運動系統",
  url: "https://www.moog.com/content/dam/moog/literature/products/hexapods/Moog-Small-Motion-Systems-Catalog-en.pdf",
};

type ApplicationSpec = {
  id: string;
  title: string;
  en: string;
  category: string;
  description: string;
  gesture: string;
  axes: readonly [string, string];
  source: { label: string; url: string } | null;
};

/** References document real applications. Signal generators represent this tabletop rig. */
export const APPLICATIONS = [
  {
    id: "manual",
    title: "自由操控",
    en: "Free motion",
    category: "實驗台",
    description: "探索六根致動器如何協作，讓同一塊平台平移、傾斜與旋轉。",
    gesture: "拖曳控制盤，觀察六支致動器如何一起伸縮。",
    axes: ["左右", "前後"],
    source: null,
  },
  {
    id: "flight",
    title: "飛行座艙",
    en: "Flight simulator",
    category: "交通模擬",
    description: "給機身坡度與俯仰指令，感受陣風疊加時座艙的姿態延遲。",
    gesture: "左右壓桿讓客機轉彎，上下拉推改變俯仰。觀察機翼與台面如何先後傾斜。",
    axes: ["壓桿", "俯仰"],
    source: {
      label: "德國航太中心 AVES 飛行模擬器",
      url: "https://www.dlr.de/en/ft/about-us/departments/flight-dynamics-and-simulation/infrastructure-of-the-department/motion-platform",
    },
  },
  {
    id: "driving",
    title: "車輛動感",
    en: "Driving simulator",
    category: "交通模擬",
    description: "模擬轉彎和煞車。起始位移及持續傾斜共同產生駕駛體感線索。",
    gesture: "左右拖曳改變賽車走線，上下控制油門與煞車。觀察過彎時的側傾與煞車時的俯仰。",
    axes: ["方向盤", "油門／煞車"],
    source: motionCatalog,
  },
  {
    id: "marine",
    title: "海浪補償",
    en: "Offshore stabilization",
    category: "海事工程",
    description: "讓海浪帶動底座，觀察平台能將儀器保持在多接近水平的位置。",
    gesture: "左右改變來浪方向，向上增加浪高。船身與機構底座隨浪起伏，六腿伸縮讓台面保持水平。",
    axes: ["浪向", "浪高"],
    source: { label: "海上風電舷梯主動補償實驗", url: "https://www.mdpi.com/2077-1312/14/2/187" },
  },
  {
    id: "seismic",
    title: "地震振動台",
    en: "Seismic table",
    category: "結構試驗",
    description: "以合成震波激振，量測受彈簧約束的試體沿台面 X 軸滑動多少。",
    gesture: "左右改變震向，向上增加震幅。看台面重現地面搖動，再看屋頂如何因慣性落後地基。",
    axes: ["震向", "震幅"],
    source: {
      label: "六自由度並聯式地震振動台實驗",
      url: "https://onlinelibrary.wiley.com/doi/10.1155/2024/1231823",
    },
  },
  {
    id: "optics",
    title: "望遠鏡副鏡",
    en: "Telescope alignment",
    category: "精密定位",
    description: "追蹤緩慢漂移的光軸，以縮尺副鏡幾何量測焦面偏心。",
    gesture: "用左右和前後微調鏡面，讓焦面光點距離中心更近。",
    axes: ["鏡面 X", "鏡面 Y"],
    source: {
      label: "PI 與 ALMA 副反射鏡定位平台",
      url: "https://www.physikinstrumente.com/fileadmin/user_upload/physik_instrumente/files/CAT/PI-CAT136-Hexapod-Positioning-Systems.pdf",
    },
  },
  {
    id: "docking",
    title: "太空對接",
    en: "Spacecraft docking",
    category: "航太試驗",
    description: "對準固定介面後才能逐步接近。對位誤差超過允許值時暫停進給。",
    gesture: "把捕獲環移向右後方。偏心小於 3 mm 時，系統會自動進給。",
    axes: ["介面 X", "介面 Y"],
    source: {
      label: "NASA 詹森太空中心對接動力試驗系統",
      url: "https://www.nasa.gov/reference/jsc-rendezvous-prox-ops-docking-subsystems/",
    },
  },
  {
    id: "rail",
    title: "鐵路過彎",
    en: "Rail dynamics",
    category: "交通模擬",
    description: "調整軌道超高與車速，量測過彎時車廂內殘餘的橫向加速度。",
    gesture: "左右改變車廂傾角，前後調整車速。尋找橫向加速度最小的位置。",
    axes: ["超高補償", "車速"],
    source: motionCatalog,
  },
  {
    id: "cinema",
    title: "動感影院",
    en: "Motion theater",
    category: "娛樂體感",
    description: "循環播放抬升、俯衝與迴轉三段動感提示，量測台座實際垂直速度。",
    gesture: "橫向改變播放速度，上下調整動感幅度。",
    axes: ["速度", "動感幅度"],
    source: motionCatalog,
  },
  {
    id: "camera",
    title: "影像防震",
    en: "Camera stabilization",
    category: "影像測試",
    description: "重播不同頻率的手震，比較補償後預估影像位移。",
    gesture: "左右調整模擬防震增益，向上增加手震頻率。觀察殘餘像移。",
    axes: ["防震增益", "手震頻率"],
    source: {
      label: "PI 影像穩定器六軸測試",
      url: "https://www.physikinstrumente.com/en/knowledge-center/product-and-system-demonstrators/motion-simulation-testing-image-stabilization",
    },
  },
  {
    id: "balance",
    title: "平衡擾動",
    en: "Postural research",
    category: "人體動作研究",
    description: "重現姿勢研究用的支撐面擾動，量測台面本身的運動。",
    gesture: "橫向改變擾動方位，上下調整推移量。留意支撐面啟動與停止。",
    axes: ["擾動方向", "位移量"],
    source: {
      label: "魯汶大學 CAREN 姿勢分析實驗室",
      url: "https://gbiomed.kuleuven.be/english/research/50000743/research/research-infrastructure/MALL-facility/posture",
    },
  },
  {
    id: "machining",
    title: "曲面加工",
    en: "Parallel machining",
    category: "製造工程",
    description: "讓平台沿圓弧掃描工件並改變刀軸姿態，觀察實際刀尖輪廓誤差。",
    gesture: "橫向改變進給率，上下調整刀路半徑。觀察刀尖偏離理想圓的距離。",
    axes: ["進給率", "刀路半徑"],
    source: {
      label: "美國 NIST 平行機構工具機研究",
      url: "https://www.nist.gov/publications/workspace-variation-hexapod-machine-tool",
    },
  },
  {
    id: "vibration",
    title: "掃頻試驗",
    en: "Resonance testing",
    category: "結構試驗",
    description: "以定頻激振一個彈簧阻尼試體，比較實際基座位移與試體放大倍率。",
    gesture: "從左到右掃過共振峰，向上提高試體阻尼，等候數個週期。",
    axes: ["激振頻率", "試體阻尼"],
    source: {
      label: "Moog 六軸隔振平台模態試驗",
      url: "https://www.moog.com/content/dam/moog/literature/sdg/space/white-papers/vibration-isolation-white-paper.pdf",
    },
  },
  {
    id: "photonics",
    title: "光纖耦合",
    en: "Fiber alignment",
    category: "精密定位",
    description: "在放大的光斑模型中搜尋最佳耦合位置，以回傳光功率判斷對位程度。",
    gesture: "緩慢掃過平面尋找功率峰值，根據讀值逼近最亮的位置。",
    axes: ["掃描 X", "掃描 Y"],
    source: {
      label: "PI 矽光子主動對位系統",
      url: "https://www.pi-usa.us/en/products/photonics-alignment-solutions",
    },
  },
] as const satisfies readonly ApplicationSpec[];

export type ApplicationId = (typeof APPLICATIONS)[number]["id"];
export type ApplicationMetric = { label: string; value: number; unit: string; detail: string };
export type ApplicationPlane = {
  x: number;
  y: number;
  span: number;
  unit: string;
  radius?: number;
};
const TAU = Math.PI * 2;
const pose = (x = 0, y = 0, z = 0, roll = 0, pitch = 0, yaw = 0): Pose => [
  x,
  y,
  HOME[2] + z,
  roll,
  pitch,
  yaw,
];
const baseOrigin = (): Pose => [0, 0, 0, 0, 0, 0];
const measure = (
  label: string,
  value: number,
  unit: string,
  detail: string,
): ApplicationMetric => ({ label, value, unit, detail });
const degrees = (radians: number) => radians / DEG;
const smoothstep = (value: number) => {
  const s = clamp(value, 0, 1);
  return s * s * (3 - 2 * s);
};

/** Exponentially weighted displacement RMS for the moving base and the real proof mass. */
class VibrationResponse {
  deckMeanSquare = 0;
  articleMeanSquare = 0;
  update(deckDisplacement: number, articleDisplacement: number, dt: number) {
    const blend = -Math.expm1(-dt / 1.2);
    this.deckMeanSquare += (deckDisplacement ** 2 - this.deckMeanSquare) * blend;
    this.articleMeanSquare += (articleDisplacement ** 2 - this.articleMeanSquare) * blend;
    return Math.sqrt(this.articleMeanSquare / Math.max(this.deckMeanSquare, 1e-9));
  }
}

export class ApplicationSession {
  current: (typeof APPLICATIONS)[number] = APPLICATIONS[0];
  planarReading: ApplicationPlane | null = null;
  private inputX = 0;
  private inputY = 0;
  private x = 0;
  private y = 0;
  private started = 0;
  private lastStep = -Infinity;
  private phase = 0;
  private slowSteer = 0;
  private slowThrottle = 0;
  private cameraX = 0;
  private cameraY = 0;
  private approach = 0;
  private response = new VibrationResponse();
  private worldState = newWorldFrame();
  private lane = 0;
  private laneVelocity = 0;
  private lastMeasurement: ApplicationMetric = measure("平台傾角", 0, "°", "合成俯仰與橫滾");
  constructor(private sim: Simulation) {}

  select(id: ApplicationId) {
    const selected = APPLICATIONS.find((item) => item.id === id);
    if (!selected || this.sim.estop || this.sim.replaying || !this.sim.setApplicationFixture(id))
      return false;
    this.current = selected;
    this.planarReading = null;
    this.inputX = this.inputY = this.x = this.y = 0;
    this.slowSteer = this.slowThrottle = this.approach = this.phase = 0;
    this.cameraX = this.cameraY = 0;
    this.response = new VibrationResponse();
    this.worldState = newWorldFrame();
    this.lane = this.laneVelocity = 0;
    if (id === "driving") this.worldState.speed = 21;
    this.started = this.sim.time;
    this.lastStep = -Infinity;
    this.sim.setAuto(false);
    this.sim.basePose = baseOrigin();
    if (id === "manual") {
      this.sim.target = [...this.sim.pose];
      this.sim.planned = [...this.sim.pose];
    } else {
      this.sim.scenario = "application";
      this.lastMeasurement = measure(
        "平台傾角",
        degrees(Math.hypot(this.sim.pose[3], this.sim.pose[4])),
        "°",
        "應用初始化",
      );
      this.tick();
    }
    return true;
  }

  setInput(x: number, y: number) {
    this.inputX = clamp(Number.isFinite(x) ? x : 0, -1, 1);
    this.inputY = clamp(Number.isFinite(y) ? y : 0, -1, 1);
  }

  get metric(): ApplicationMetric {
    if (this.current.id === "manual") {
      return measure(
        "平台傾角",
        degrees(Math.hypot(this.sim.pose[3], this.sim.pose[4])),
        "°",
        "合成俯仰與橫滾",
      );
    }
    return this.lastMeasurement;
  }

  get world() {
    const f = this.worldState,
      s = this.sim;
    f.roll = s.target[3];
    f.pitch = s.target[4];
    f.yaw = s.target[5];
    f.baseHeave = s.basePose[2];
    f.baseRoll = s.basePose[3];
    f.basePitch = s.basePose[4];
    f.targetX = s.target[0];
    f.targetY = s.target[1];
    f.targetZ = s.target[2] - HOME[2];
    f.deckX = s.pose[0];
    f.deckY = s.pose[1];
    f.deckZ = s.pose[2] - HOME[2];
    f.deckRoll = s.pose[3];
    f.deckPitch = s.pose[4];
    f.specimen = s.specimen?.displacement ?? 0;
    f.phase = this.phase;
    f.metric = this.metric.value;
    f.planeX = this.planarReading?.x ?? 0;
    f.planeY = this.planarReading?.y ?? 0;
    f.planeSpan = this.planarReading?.span ?? 0;
    return f;
  }

  /** Call before each physics tick. Commands go to the shared IK and bounded servos. */
  tick() {
    const s = this.sim;
    if (
      this.current.id === "manual" ||
      s.scenario !== "application" ||
      s.estop ||
      s.paused ||
      s.replaying
    )
      return;
    if (s.time >= this.lastStep && s.time - this.lastStep < 2 * DT - 1e-8) return;
    // Compensate for a world reset and cap the controller step after a paused scheduler.
    const dt = Number.isFinite(this.lastStep) ? clamp(s.time - this.lastStep, DT, 1 / 30) : 2 * DT;
    this.lastStep = s.time;
    this.started = Math.min(s.time, this.started);
    const t = s.time - this.started;
    const inputBlend = -Math.expm1(-dt / 0.16);
    this.x += (this.inputX - this.x) * inputBlend;
    this.y += (this.inputY - this.y) * inputBlend;
    this.worldState.t = t;
    this.worldState.x = this.x;
    this.worldState.y = this.y;
    const p = this.sample(t, dt);
    // Validate against edited geometry as well as the adjusted moving-base transform.
    if (limits(p, s.geometry, s.basePose).valid) {
      s.target = p;
      s.plan = null;
    }
  }

  private sample(t: number, dt: number): Pose {
    const { x, y, sim: s } = this;
    const actual = s.pose;
    switch (this.current.id) {
      case "flight": {
        const roll = (x * 7.5 + 2.1 * Math.sin(t * 0.47) + 0.5 * Math.sin(t * 1.85)) * DEG;
        const pitch = (y * 5 + 1.4 * Math.sin(t * 0.65)) * DEG;
        this.worldState.speed = 130;
        this.worldState.distance += this.worldState.speed * dt;
        this.worldState.heading += ((s.gravity * Math.tan(roll)) / this.worldState.speed) * dt;
        this.lastMeasurement = measure(
          "實際坡度",
          degrees(actual[3]),
          "°",
          "指令 " + degrees(roll).toFixed(1) + "° · 含合成陣風",
        );
        return pose(0.008 * y, 0.008 * x, 0.009 * Math.sin(t * 1.5), roll, pitch, x * 0.035);
      }
      case "driving": {
        const f = this.worldState;
        const acceleration = clamp((21 + 13 * y - f.speed) * 0.95, -6, 4.5);
        f.speed += acceleration * dt;
        f.distance += f.speed * dt;
        f.course = f.distance;
        const laneAcceleration = clamp(7 * (2.35 * x - this.lane) - 4.6 * this.laneVelocity, -5, 5);
        this.laneVelocity += laneAcceleration * dt;
        this.lane += this.laneVelocity * dt;
        const road = raceCourse(f.course, this.lane);
        f.x = this.lane / 2.35;
        f.heading = road.heading + Math.atan2(this.laneVelocity, f.speed);
        const lateral = f.speed * f.speed * road.curvature + laneAcceleration;
        f.steering = clamp(Math.atan((2.65 * lateral) / (f.speed * f.speed)) / 0.52, -1, 1);
        const sideCue = Math.tanh(lateral / 8),
          surgeCue = Math.tanh(acceleration / 3);
        const lag = -Math.expm1(-dt / 0.72);
        this.slowSteer += (sideCue - this.slowSteer) * lag;
        this.slowThrottle += (surgeCue - this.slowThrottle) * lag;
        const roll = this.slowSteer * 0.105;
        const pitch = this.slowThrottle * -0.072;
        this.lastMeasurement = measure(
          "側向傾斜線索",
          s.gravity * Math.sin(actual[3]),
          "m/s²",
          "車速 " + (f.speed * 3.6).toFixed(0) + " km/h · 賽道曲率與走線產生側向加速度",
        );
        return pose(
          0.018 * (surgeCue - this.slowThrottle),
          0.021 * (sideCue - this.slowSteer),
          0.002 * Math.sin(f.distance * 0.3),
          roll,
          pitch,
          sideCue * 0.022,
        );
      }
      case "marine": {
        const height = 0.6 + 0.35 * y;
        const direction = 0.6 + 0.72 * x;
        const sea = sampleVesselWave(t, height, direction);
        this.worldState.waveHeight = height;
        this.worldState.waveDirection = direction;
        s.basePose = [0, 0, sea.heave, sea.roll, sea.pitch, 0];
        const tilt = degrees(Math.hypot(s.basePose[3], s.basePose[4]));
        this.lastMeasurement = measure(
          "載台殘餘傾角",
          degrees(Math.hypot(actual[3], actual[4])),
          "°",
          "底座傾角 " + tilt.toFixed(2) + "° · 目標水平",
        );
        return pose();
      }
      case "seismic": {
        const cycle = t % 12;
        const envelope = Math.sin((Math.PI * cycle) / 12) ** 2;
        const heading = (x * Math.PI) / 2;
        const vibration =
          (0.009 + 0.006 * y) *
          envelope *
          (Math.sin(cycle * 3.65) +
            0.28 * Math.sin(cycle * 8.4 + 0.5) +
            0.12 * Math.sin(cycle * 12.7));
        const ax = Math.cos(heading),
          ay = Math.sin(heading);
        this.lastMeasurement = measure(
          "試體相對位移",
          1000 * (s.specimen?.displacement ?? 0),
          "mm",
          "X 向 0.65 Hz 彈簧試體 · 合成震波 12 秒循環",
        );
        return pose(
          vibration * ax,
          vibration * ay,
          vibration * 0.2,
          ay * vibration * 0.9,
          -ax * vibration * 0.9,
        );
      }
      case "optics": {
        const driftX = 0.007 * Math.sin(t * 0.19 + 0.8);
        const driftY = 0.006 * Math.cos(t * 0.15);
        // Paraxial mirror: beam angle changes twice the mirror angle, focal length 0.4 m.
        const spotX = actual[0] + 0.8 * actual[4] - driftX;
        const spotY = actual[1] - 0.8 * actual[3] - driftY;
        this.planarReading = { x: 1000 * spotX, y: 1000 * spotY, span: 23, unit: "mm" };
        this.lastMeasurement = measure(
          "焦面偏心",
          1000 * Math.hypot(spotX, spotY),
          "mm",
          "縮尺焦面 ΔX " + (spotX * 1000).toFixed(1) + " / ΔY " + (spotY * 1000).toFixed(1) + " mm",
        );
        return pose(0.006 * x, 0.006 * y, 0.003 * Math.sin(t * 0.12), -0.009 * y, 0.009 * x);
      }
      case "docking": {
        const dx = 0.014 - actual[0],
          dy = -0.01 - actual[1];
        this.planarReading = { x: -1000 * dx, y: -1000 * dy, span: 45, radius: 3, unit: "mm" };
        const offset = Math.hypot(dx, dy);
        if (offset < 0.003) this.approach = Math.min(0.025, this.approach + 0.003 * dt);
        const gap = Math.max(0, HOME[2] + 0.025 - actual[2]);
        const state =
          gap < 0.001 && offset < 0.003 ? "已到達介面" : offset < 0.003 ? "對準進給中" : "等待對位";
        this.lastMeasurement = measure(
          "介面偏心",
          offset * 1000,
          "mm",
          state + " · 剩餘 " + (1000 * gap).toFixed(1) + " mm",
        );
        return pose(0.028 * x, 0.025 * y, this.approach);
      }
      case "rail": {
        const speed = 15 + 5 * y;
        const curve = 0.0022 * Math.sin(t * 0.36);
        this.worldState.speed = speed;
        this.worldState.distance += speed * dt;
        this.worldState.course = curve;
        this.worldState.heading += speed * curve * dt;
        const commandedCant = Math.atan((speed ** 2 * curve) / s.gravity) * 0.65 + 0.055 * x;
        const lateral = speed ** 2 * curve * Math.cos(actual[3]) - s.gravity * Math.sin(actual[3]);
        this.lastMeasurement = measure(
          "剩餘橫向加速度",
          lateral,
          "m/s²",
          "模型車速 " + (speed * 3.6).toFixed(0) + " km/h · 連續 S 彎",
        );
        return pose(
          0,
          0.005 * Math.sin(t * 0.36),
          0.0015 * Math.sin(t * 6.2),
          commandedCant,
          0.004 * Math.sin(t * 2.6),
          0.03 * Math.sin(t * 0.36),
        );
      }
      case "cinema": {
        this.phase += dt * (0.51 + 0.19 * x);
        const a = this.phase;
        const gain = 0.75 + 0.35 * y;
        const scene = ["抬升", "俯衝", "迴轉"][Math.floor(3 * ((a % TAU) / TAU))];
        this.lastMeasurement = measure(
          "垂直速度",
          1000 * s.velocity[2],
          "mm/s",
          "動感段落 · " + scene,
        );
        return pose(
          0.013 * gain * Math.sin(2 * a),
          0.012 * gain * Math.sin(a),
          0.032 * gain * Math.sin(a),
          0.065 * gain * Math.sin(2 * a),
          0.095 * gain * Math.cos(a),
          0.065 * gain * Math.sin(a),
        );
      }
      case "camera": {
        const frequency = 0.65 + 0.32 * y;
        this.worldState.frequency = frequency;
        this.phase += dt * TAU * frequency;
        const response = -Math.expm1(-dt / 0.09);
        this.cameraX += (actual[4] - this.cameraX) * response;
        this.cameraY += (actual[3] - this.cameraY) * response;
        const gain = (1 + x) / 2;
        const px = 780 * Math.tan(actual[4] - gain * this.cameraX);
        const py = -780 * Math.tan(actual[3] - gain * this.cameraY);
        this.planarReading = { x: px, y: py, span: 24, unit: "px" };
        this.lastMeasurement = measure(
          "殘餘像移",
          Math.hypot(px, py),
          "px",
          "估算焦距 780 px · 防震增益 " + (100 * gain).toFixed(0) + "%",
        );
        return pose(0, 0, 0, 0.023 * Math.sin(this.phase), 0.018 * Math.sin(1.7 * this.phase));
      }
      case "balance": {
        const cycle = t % 5;
        const step = smoothstep((cycle - 0.65) / 0.45) - smoothstep((cycle - 2.1) / 0.7);
        const amount = (0.024 + 0.014 * y) * step;
        const direction = (Math.PI / 3) * x;
        this.planarReading = { x: 1000 * actual[0], y: 1000 * actual[1], span: 40, unit: "mm" };
        this.lastMeasurement = measure(
          "支撐面位移",
          1000 * Math.hypot(actual[0], actual[1]),
          "mm",
          "5 秒擾動週期 · 量測平台位移",
        );
        return pose(
          amount * Math.cos(direction),
          amount * Math.sin(direction),
          0,
          0.25 * amount * Math.sin(direction),
          -0.25 * amount * Math.cos(direction),
        );
      }
      case "machining": {
        this.phase += dt * (0.7 + 0.35 * x);
        const r = 0.022 + 0.01 * y;
        this.worldState.radius = r;
        this.worldState.feed = 1000 * r * (0.7 + 0.35 * x);
        const cx = Math.cos(this.phase),
          cy = Math.sin(this.phase);
        const roll = -0.04 * cy,
          pitch = 0.04 * cx;
        const toolLength = 0.06;
        // Tool tip is 60 mm along local -Z. Use full rotated tip for contour measurement.
        const tipX =
          actual[0] -
          toolLength *
            (Math.cos(actual[5]) * Math.sin(actual[4]) * Math.cos(actual[3]) +
              Math.sin(actual[5]) * Math.sin(actual[3]));
        const tipY =
          actual[1] -
          toolLength *
            (Math.sin(actual[5]) * Math.sin(actual[4]) * Math.cos(actual[3]) -
              Math.cos(actual[5]) * Math.sin(actual[3]));
        this.planarReading = {
          x: 1000 * tipX,
          y: 1000 * tipY,
          span: 36,
          radius: 1000 * r,
          unit: "mm",
        };
        this.lastMeasurement = measure(
          "刀尖輪廓誤差",
          Math.abs(Math.hypot(tipX, tipY) - r) * 1000,
          "mm",
          "半徑 " + (1000 * r).toFixed(1) + " mm · 圓弧乾跑",
        );
        return pose(
          r * cx + toolLength * Math.sin(pitch) * Math.cos(roll),
          r * cy - toolLength * Math.sin(roll),
          0.005 * Math.sin(this.phase * 2),
          roll,
          pitch,
        );
      }
      case "vibration": {
        const frequency = 0.98 + x * 0.52;
        const damping = 0.12 + 0.08 * y;
        this.worldState.frequency = frequency;
        this.phase += dt * TAU * frequency;
        this.worldState.damping = damping;
        s.specimen?.setDamping(damping);
        const ratio = this.response.update(actual[0], s.specimen?.displacementWorldX ?? 0, dt);
        this.lastMeasurement = measure(
          "位移放大倍率",
          ratio,
          "×",
          "激振 " + frequency.toFixed(2) + " Hz · 試體固有頻率 1.02 Hz",
        );
        return pose(0.0055 * Math.sin(this.phase));
      }
      case "photonics": {
        const dx = (actual[0] - 0.009) / 0.012,
          dy = (actual[1] + 0.005) / 0.009;
        this.planarReading = {
          x: 1000 * (actual[0] - 0.009),
          y: 1000 * (actual[1] + 0.005),
          span: 33,
          unit: "mm",
        };
        const coupling = 100 * Math.exp(-(dx ** 2 + dy ** 2));
        this.lastMeasurement = measure("相對耦合功率", coupling, "%", "放大高斯光斑 · 峰值 100%");
        return pose(0.021 * x, 0.018 * y);
      }
      default:
        return [...HOME];
    }
  }
}
