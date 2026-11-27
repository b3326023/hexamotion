import { clamp } from "./kinematics";
import type { ApplicationId } from "./applications";
import type { WorldFrame, WorldId } from "./worlds/types";

export const soundLabels: Record<WorldId, string> = {
  flight: "雙發渦扇與高空氣流",
  driving: "引擎、輪胎與路面",
  marine: "湧浪、柴油機與浮標鐘",
  seismic: "地鳴與窗框震響",
  optics: "山風與副鏡伺服",
  docking: "艙內通風與接近提示",
  rail: "輪軌、接縫與輪緣",
  cinema: "影廳配樂與座椅低頻",
  camera: "攝影棚底噪與防震馬達",
  balance: "訓練節拍與移動踏台",
  machining: "空轉主軸與進給馬達",
  vibration: "激振器與試件共鳴",
  photonics: "耦合功率聽覺回授",
};
type Timbre = "sine" | "triangle" | number[];
type Layer = (frequency: number, level: number, now: number) => void;
type Updater = (f: WorldFrame, now: number) => void;

class SceneVoice {
  private readonly bus: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly pulses = new Set<OscillatorNode>();
  private readonly updateSound: Updater;
  private running = false;
  private cueIndex = new Map<string, number>();
  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    id: WorldId,
    private noise: AudioBuffer,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
    this.updateSound = this.design(id);
  }
  private connectVoice(source: AudioNode, pan: number) {
    const gain = this.ctx.createGain(),
      p = this.ctx.createStereoPanner();
    gain.gain.value = 0;
    p.pan.value = pan;
    source.connect(gain).connect(p).connect(this.bus);
    this.nodes.push(gain, p);
    return gain;
  }
  private tone(timbre: Timbre, pan = 0): Layer {
    const osc = this.ctx.createOscillator(),
      g = this.connectVoice(osc, pan);
    if (Array.isArray(timbre)) {
      const real = new Float32Array(timbre.length + 1),
        imag = new Float32Array([0, ...timbre]);
      osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag));
    } else osc.type = timbre;
    this.nodes.push(osc);
    this.sources.push(osc);
    osc.start();
    return (hz, level, t) => {
      osc.frequency.setTargetAtTime(Math.max(19, hz), t, 0.052);
      g.gain.setTargetAtTime(level, t, 0.045);
    };
  }
  private air(kind: BiquadFilterType, q: number, pan = 0): Layer {
    const src = this.ctx.createBufferSource(),
      filter = this.ctx.createBiquadFilter();
    src.buffer = this.noise;
    src.loop = true;
    filter.type = kind;
    filter.Q.value = q;
    src.connect(filter);
    const g = this.connectVoice(filter, pan);
    this.nodes.push(src, filter);
    this.sources.push(src);
    src.start(0, (this.nodes.length * 0.193) % this.noise.duration);
    return (hz, level, t) => {
      filter.frequency.setTargetAtTime(clamp(hz, 28, 12000), t, 0.065);
      g.gain.setTargetAtTime(level, t, 0.055);
    };
  }
  private bell(freq: number, level: number, decay: number, pan = 0, delay = 0, fall = 1) {
    if (this.pulses.size > 24) return;
    const c = this.ctx,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain(),
      p = c.createStereoPanner();
    p.pan.value = pan;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(22, freq * fall), t + decay);
    g.gain.setValueAtTime(0.00001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.00002, level), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.00001, t + decay);
    o.connect(g).connect(p).connect(this.bus);
    this.pulses.add(o);
    o.onended = () => {
      this.pulses.delete(o);
      o.disconnect();
      g.disconnect();
      p.disconnect();
    };
    o.start(t);
    o.stop(t + decay + 0.02);
  }
  private crossing(key: string, cycle: number, play: () => void) {
    const value = Math.floor(cycle),
      last = this.cueIndex.get(key);
    this.cueIndex.set(key, value);
    if (last !== undefined && value > last) play();
  }
  private design(id: WorldId): Updater {
    const pi = Math.PI,
      tau = 2 * pi;
    switch (id) {
      case "flight": {
        const left = this.tone([1, 0.25, 0.11, 0.14, 0.36, 0.18, 0.21, 0.04, 0.12], -0.59),
          right = this.tone([1, 0.29, 0.15, 0.07, 0.34, 0.11, 0.18, 0.05, 0.11], 0.59);
        const air = this.air("lowpass", 0.37),
          fan = this.air("bandpass", 0.7, 0.25);
        return (f, t) => {
          const load = Math.min(1, Math.abs(f.roll) * 2 + Math.max(0, f.pitch) * 4),
            n = 82 + load * 18;
          left(n, 0.22, t);
          right(n * 1.012, 0.21, t);
          air(790 + load * 410, 0.57, t);
          fan(1140 + n * 3, 0.17 + load * 0.09, t);
        };
      }
      case "driving": {
        const engine = this.tone(
            [1, 0.32, 0.75, 0.22, 0.47, 0.16, 0.26, 0.12, 0.23, 0.09, 0.12],
            -0.18,
          ),
          body = this.tone([1, 0.2, 0.45, 0.1], 0.13);
        const tires = this.air("bandpass", 1.3, 0.46),
          track = this.air("lowpass", 0.5, -0.3);
        return (f, t) => {
          const gear = Math.min(5, 1 + Math.floor(f.speed / 8.5)),
            rpm = 1350 + (f.speed * 365) / (0.76 + gear * 0.3);
          engine((rpm / 60) * 4, 0.27 + 0.1 * Math.max(0, f.y), t);
          body(rpm / 60, 0.2, t);
          tires(
            1140 + 2300 * Math.abs(f.steering),
            0.05 + 0.54 * Math.min(1, Math.abs(f.roll) * 7 + Math.max(0, -f.y) * 0.5),
            t,
          );
          track(350 + f.speed * 14, 0.38, t);
        };
      }
      case "marine": {
        const wash = this.air("lowpass", 0.47, -0.49),
          foam = this.air("bandpass", 0.59, 0.54),
          diesel = this.tone([1, 0.38, 0.16, 0.24, 0.1], 0.1);
        return (f, t) => {
          const crest = 0.5 + 0.5 * Math.sin(f.t * 0.81 + 0.24),
            swell = Math.min(1, f.waveHeight);
          wash(420 + crest * 1160, (0.25 + 0.49 * crest) * swell + 0.12, t);
          foam(1250 + crest * 1550, (0.14 + 0.63 * crest * crest) * swell, t);
          diesel(46 + f.baseHeave * 90, 0.12, t);
          this.crossing("buoy", (f.t * 0.81 + 1.1) / tau, () => {
            this.bell(520, 0.11, 0.82, -0.69);
            this.bell(1276, 0.034, 0.42, -0.69, 0.016);
          });
        };
      }
      case "seismic": {
        const ground = this.air("lowpass", 0.82),
          frame = this.air("bandpass", 2.1, 0.43),
          mode = this.tone([1, 0.3, 0.13], -0.24);
        return (f, t) => {
          const shake = clamp(Math.hypot(f.deckX, f.deckY) * 65 + Math.abs(f.specimen) * 20, 0, 1);
          ground(65 + shake * 125, 0.1 + shake * 1.7, t);
          mode(43 + shake * 7, shake * 0.31, t);
          frame(850 + 360 * shake, 0.012 + shake * 0.45, t);
          this.crossing("rattle", f.t * 3.2, () => {
            if (shake > 0.14) {
              this.bell(615 + 285 * shake, 0.11 * shake, 0.08, 0.41, 0, 0.63);
              this.bell(1150, 0.04 * shake, 0.055, -0.27, 0.028);
            }
          });
        };
      }
      case "optics": {
        const ridge = this.air("bandpass", 0.48, -0.45),
          bearing = this.tone([1, 0.08, 0.52, 0.14], 0.47),
          drive = this.air("bandpass", 2, 0.35);
        let x = 0,
          y = 0,
          prev = -1;
        return (f, t) => {
          const dt = clamp(f.t - prev, 0.015, 0.15),
            v = prev < 0 ? 0 : clamp((Math.hypot(f.deckRoll - x, f.deckPitch - y) / dt) * 45, 0, 1);
          x = f.deckRoll;
          y = f.deckPitch;
          prev = f.t;
          ridge(650 + 220 * Math.sin(f.t * 0.31), 0.16 + 0.06 * Math.sin(f.t * 0.51), t);
          bearing(275 + v * 340, 0.025 + 0.13 * v, t);
          drive(1650 + v * 770, 0.045 + 0.16 * v, t);
        };
      }
      case "docking": {
        const cabin = this.air("bandpass", 0.62, -0.3),
          vent = this.tone([1, 0.22, 0.11, 0.17], 0.32);
        let cycle = 0,
          prev = -1,
          aligned = false;
        return (f, t) => {
          const lock = f.metric < 3,
            dt = prev < 0 ? 0 : clamp(f.t - prev, 0, 0.15);
          prev = f.t;
          cycle += dt * (lock ? 2.3 : 0.6 + Math.max(0, 1 - f.metric / 45) * 0.65);
          cabin(530, 0.26, t);
          vent(92, 0.075, t);
          this.crossing("range", cycle, () => this.bell(lock ? 1130 : 675, 0.095, 0.145, 0.24));
          if (lock && !aligned) {
            this.bell(700, 0.12, 0.25);
            this.bell(1048, 0.1, 0.34, 0, 0.14);
          }
          aligned = lock;
        };
      }
      case "rail": {
        const motors = this.tone([1, 0.32, 0.26, 0.14, 0.16, 0.09], -0.22),
          rollers = this.air("lowpass", 0.7),
          flange = this.tone([1, 0.12, 0.21], 0.67);
        return (f, t) => {
          const side = clamp(Math.abs(f.metric) / 0.7, 0, 1);
          motors(85 + 2.8 * f.speed, 0.15, t);
          rollers(490 + 25 * f.speed, 0.65, t);
          flange(1050 + Math.abs(f.course) * 132000, 0.008 + 0.096 * side, t);
          this.crossing("joint", f.distance / 16, () => {
            this.bell(128, 0.21, 0.094, -0.52, 0, 0.48);
            this.bell(105, 0.18, 0.087, 0.5, 0.102, 0.49);
          });
        };
      }
      case "cinema": {
        const low = this.tone([1, 0.35, 0.12], -0.28),
          r = this.tone([1, 0.16, 0.07], 0.48),
          whoosh = this.air("bandpass", 0.77, 0.1);
        return (f, t) => {
          const segment = Math.floor((f.phase % tau) / (tau / 3)),
            notes = [65.41, 77.78, 58.27],
            base = notes[segment],
            lift = (1 + Math.sin(f.phase)) / 2;
          low(base, 0.13 + 0.08 * lift, t);
          r(base * 1.5, 0.1, t);
          whoosh(280 + 1700 * lift, 0.18 + 0.52 * lift * (0.7 + 0.3 * f.y), t);
          this.crossing("score", (f.phase * 8) / tau, () => {
            this.bell(base * 4, 0.15, 0.56, 0.35);
            this.bell(base, 0.17, 0.33, -0.22, 0, 0.78);
          });
        };
      }
      case "camera": {
        const room = this.air("lowpass", 0.52, -0.31),
          gimbal = this.tone([1, 0.3, 0.025, 0.16], 0.35),
          bearing = this.air("bandpass", 2, 0.2);
        return (f, t) => {
          const correction = clamp(
            (1 + f.x) * 0.5 * (0.3 + 0.7 * Math.abs(Math.cos(f.phase))),
            0,
            1,
          );
          room(420, 0.24, t);
          gimbal(310 + correction * 430, 0.018 + 0.136 * correction, t);
          bearing(1380 + 670 * f.frequency, 0.053 + correction * 0.2, t);
          this.crossing("monitor", f.phase / (tau * 3), () => this.bell(1480, 0.035, 0.075, 0.6));
        };
      }
      case "balance": {
        const mat = this.air("bandpass", 1, -0.25),
          bed = this.air("lowpass", 0.48, 0.45);
        return (f, t) => {
          const moving = clamp(Math.abs(f.deckX) + Math.abs(f.deckY), 0, 0.045) / 0.045;
          bed(360, 0.19, t);
          mat(320 + moving * 740, 0.028 + 0.33 * moving, t);
          this.crossing("start", (f.t + 4.35) / 5, () => this.bell(784, 0.14, 0.19, -0.1));
          this.crossing("end", (f.t + 2.9) / 5, () => this.bell(523, 0.095, 0.23, 0.12));
        };
      }
      case "machining": {
        const spindle = this.tone([1, 0.17, 0.58, 0.21, 0.35, 0.11, 0.17], 0.33),
          gantry = this.tone([1, 0.38, 0.12], -0.37),
          fan = this.air("bandpass", 0.62);
        return (f, t) => {
          spindle(264 + f.feed * 0.58, 0.115, t);
          gantry(85 + f.feed * 3.9, 0.1 + 0.035 * Math.cos(f.phase), t);
          fan(750 + f.feed * 15, 0.29, t);
        };
      }
      case "vibration": {
        const coil = this.tone([1, 0.18, 0.26, 0.07], -0.21),
          caseNoise = this.air("bandpass", 1.1, 0.31);
        return (f, t) => {
          const flex = Math.min(1, Math.abs(f.specimen) * 65),
            load = 0.28 + 0.72 * Math.abs(Math.sin(f.phase));
          coil(62 + f.frequency * 32, 0.11 + 0.16 * load, t);
          caseNoise(860 + flex * 770, 0.085 + flex * 0.49, t);
          this.crossing("peak", f.phase / pi, () =>
            this.bell(230 + 210 * f.damping, 0.06 + flex * 0.12, 0.13, 0.33, 0, 0.77),
          );
        };
      }
      case "photonics": {
        const electronics = this.air("lowpass", 0.44, -0.23),
          feedback = this.tone("sine", 0.2);
        let phase = 0,
          prev = -1;
        return (f, t) => {
          const power = clamp(f.metric / 100, 0, 1),
            dt = prev < 0 ? 0 : clamp(f.t - prev, 0, 0.15);
          prev = f.t;
          phase += dt * (0.65 + power * 3.1);
          electronics(410, 0.15, t);
          feedback(270 + power * 420, 0.023 + power * 0.068, t);
          this.crossing("readback", phase, () => this.bell(470 + power * 550, 0.085, 0.12, 0.26));
        };
      }
    }
  }
  update(f: WorldFrame) {
    const now = this.ctx.currentTime;
    this.updateSound(f, now);
  }
  gate(on: boolean) {
    if (this.running === on) return;
    this.running = on;
    this.bus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, on ? 0.034 : 0.014);
  }
  retire() {
    this.gate(false);
    const end = this.ctx.currentTime + 0.065;
    this.sources[0].onended = () => this.disconnect();
    for (const s of this.sources) s.stop(end);
    for (const s of this.pulses) {
      try {
        s.stop(end);
      } catch {}
    }
  }
  private disconnect() {
    this.bus.disconnect();
    for (const n of this.nodes) n.disconnect();
  }
  dispose() {
    this.bus.disconnect();
    for (const s of this.sources) s.stop();
    for (const n of this.nodes) n.disconnect();
    for (const s of this.pulses) {
      try {
        s.stop();
      } catch {}
    }
    this.pulses.clear();
  }
}

/** A single procedural scene bus shares the six motors' output, mute and limiter. */
export class SceneSoundstage {
  private voice: SceneVoice | null = null;
  private id: ApplicationId = "manual";
  private noise: AudioBuffer;
  private last = -Infinity;
  constructor(
    private ctx: BaseAudioContext,
    private output: AudioNode,
  ) {
    this.noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2.73), ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 0x58924a;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
  }
  update(id: ApplicationId, f: WorldFrame, silent: boolean) {
    if (id !== this.id) {
      this.voice?.retire();
      this.voice = null;
      this.id = id;
      this.last = -Infinity;
      if (id !== "manual") {
        this.voice = new SceneVoice(this.ctx, this.output, id, this.noise);
      }
    }
    this.voice?.gate(!silent);
    if (silent || !this.voice || this.ctx.currentTime - this.last < 1 / 36) return;
    this.last = this.ctx.currentTime;
    this.voice.update(f);
  }
  quiet() {
    this.voice?.gate(false);
  }
  dispose() {
    this.voice?.dispose();
    this.voice = null;
  }
}
