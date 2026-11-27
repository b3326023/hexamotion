import { clamp } from './kinematics';

export type MotorState = {
  velocity: number;
  acceleration: number;
  force: number;
  failed: boolean;
};
type Voice = {
  motor: OscillatorNode;
  gear: OscillatorNode;
  motorGain: GainNode;
  gearGain: GainNode;
  friction: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
};

// Six separately modulated motor/ballscrew voices. No audio assets or network access.
export class ActuatorAudio {
  context = new AudioContext();
  master = this.context.createGain();
  compressor = this.context.createDynamicsCompressor();
  noise = this.context.createBufferSource();
  voices: Voice[] = [];
  enabled = false;
  volume = 0.35;
  lastUpdate = -1;
  disposed = false;
  lastImpact = -1;
  constructor() {
    const ctx = this.context;
    this.master.gain.value = 0;
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;
    this.master.connect(this.compressor).connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = 0.75 * previous + 0.25 * (Math.random() * 2 - 1);
      data[i] = previous;
    }
    this.noise.buffer = buffer;
    this.noise.loop = true;
    for (let i = 0; i < 6; i++) {
      const motor = ctx.createOscillator(),
        gear = ctx.createOscillator(),
        motorGain = ctx.createGain(),
        gearGain = ctx.createGain(),
        friction = ctx.createGain(),
        filter = ctx.createBiquadFilter(),
        pan = ctx.createStereoPanner();
      motor.type = 'triangle';
      gear.type = 'sine';
      motor.frequency.value = 100 + i * 7;
      gear.frequency.value = 300 + i * 11;
      motorGain.gain.value = 0;
      gearGain.gain.value = 0;
      friction.gain.value = 0;
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.6;
      pan.pan.value = 0.7 * Math.cos((i * Math.PI) / 3);
      motor.connect(motorGain).connect(pan);
      gear.connect(gearGain).connect(pan);
      this.noise.connect(filter).connect(friction).connect(pan);
      pan.connect(this.master);
      motor.start();
      gear.start();
      this.voices.push({
        motor,
        gear,
        motorGain,
        gearGain,
        friction,
        filter,
        pan,
      });
    }
    this.noise.start();
  }
  async setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      await this.context.resume();
      if (!this.enabled || this.disposed) return;
      this.master.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.08,
      );
    } else {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.025);
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!this.enabled && !this.disposed) await this.context.suspend();
    }
  }
  setVolume(value: number) {
    this.volume = clamp(value, 0, 1);
    this.master.gain.setTargetAtTime(
      this.enabled ? this.volume : 0,
      this.context.currentTime,
      0.05,
    );
  }
  update(actuators: MotorState[], silent: boolean) {
    if (this.disposed || !this.enabled) return;
    const t = this.context.currentTime;
    if (t - this.lastUpdate < 1 / 30) return;
    this.lastUpdate = t;
    this.voices.forEach((voice, i) => {
      const a = actuators[i],
        speed = a ? Math.abs(a.velocity) : 0;
      const motion =
        silent || !a || a.failed ? 0 : clamp((speed - 0.0005) / 0.12, 0, 1);
      const load = a ? clamp(Math.abs(a.force) / 900, 0, 1) : 0,
        transient = motion ? clamp(Math.abs(a.acceleration) / 1.4, 0, 1) : 0;
      voice.motor.frequency.setTargetAtTime(
        95 + i * 7 + speed * 2100,
        t,
        0.055,
      );
      voice.gear.frequency.setTargetAtTime(
        280 + i * 13 + speed * 7200,
        t,
        0.045,
      );
      voice.filter.frequency.setTargetAtTime(450 + motion * 1800, t, 0.08);
      voice.motorGain.gain.setTargetAtTime(
        0.075 * Math.sqrt(motion) * (1 + 0.35 * load),
        t,
        0.06,
      );
      voice.gearGain.gain.setTargetAtTime(
        0.022 * motion * (0.6 + load),
        t,
        0.045,
      );
      voice.friction.gain.setTargetAtTime(
        0.035 * motion + 0.018 * transient,
        t,
        0.045,
      );
    });
  }
  impact(kind: string, force: number, x: number) {
    if (!this.enabled || this.disposed) return;
    const ctx = this.context,
      t = ctx.currentTime;
    if (t - this.lastImpact < 0.065) return;
    this.lastImpact = t;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner();
    oscillator.type = kind === 'steel' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(
      kind === 'steel' ? 1800 : kind === 'ball' ? 720 : 190,
      t,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === 'steel' ? 650 : 180,
      t + 0.11,
    );
    gain.gain.setValueAtTime(
      Math.min(0.22, 0.025 + Math.sqrt(force) * 0.045),
      t,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    pan.pan.value = clamp(x * 2, -0.9, 0.9);
    oscillator.connect(gain).connect(pan).connect(this.master);
    oscillator.start(t);
    oscillator.stop(t + 0.15);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.noise.stop();
    this.voices.forEach((v) => {
      v.motor.stop();
      v.gear.stop();
    });
    if (this.context.state !== 'closed') await this.context.close();
  }
}
