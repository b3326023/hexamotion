import type { LabScene } from './scene';
import type { ActuatorAudio } from './actuator-audio';
export type FilmCaption = {
  title: string;
  task: string;
  speed: number;
  error: number;
  time: number;
  score?: number;
};
export type FilmOptions = {
  portrait: boolean;
  duration: number;
  director: boolean;
};
export type Clip = {
  blob: Blob;
  url: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
};
export class FilmRecorder {
  active = false;
  elapsed = 0;
  private recorder: MediaRecorder | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private cleanup: (() => void) | null = null;
  private cancelled = false;
  start(
    scene: LabScene,
    audio: ActuatorAudio | null,
    options: FilmOptions,
    caption: () => FilmCaption,
    done: (clip: Clip) => void,
    error: (message: string) => void,
  ) {
    if (this.active) throw new Error('目前已有影片正在錄製。');
    if (
      typeof MediaRecorder === 'undefined' ||
      !HTMLCanvasElement.prototype.captureStream
    )
      throw new Error('此瀏覽器不支援影片錄製，請使用新版 Chrome 或 Edge。');
    const canvas = document.createElement('canvas');
    canvas.width = options.portrait ? 720 : 1280;
    canvas.height = options.portrait ? 1280 : 720;
    const ctx = canvas.getContext('2d')!;
    const source = canvas.captureStream(30);
    let tap: MediaStreamAudioDestinationNode | null = null;
    const stream = new MediaStream(source.getVideoTracks());
    if (audio?.enabled) {
      tap = audio.context.createMediaStreamDestination();
      audio.compressor.connect(tap);
      for (const track of tap.stream.getAudioTracks()) stream.addTrack(track);
    }
    const candidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 4_000_000,
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      if (tap) audio?.compressor.disconnect(tap);
      throw new Error('影片編碼器未能啟動，請稍後再試。');
    }
    const previous = {
      position: scene.camera.position.clone(),
      quaternion: scene.camera.quaternion.clone(),
      target: scene.controls.target.clone(),
      enabled: scene.controls.enabled,
      cinematic: scene.cinematic,
      before: scene.onBeforeRender,
      after: scene.onAfterRender,
    };
    const start = performance.now(),
      samples: number[] = [];
    let last = 0,
      bytes = 0,
      failed = '';
    const chunks: Blob[] = [];
    this.cancelled = false;
    this.active = true;
    this.elapsed = 0;
    this.recorder = recorder;
    if (options.director) {
      scene.cinematic = false;
      scene.controls.enabled = false;
    }
    const hidden = () => {
      if (document.hidden) this.stop();
    };
    document.addEventListener('visibilitychange', hidden);
    this.cleanup = () => {
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = null;
      document.removeEventListener('visibilitychange', hidden);
      scene.onBeforeRender = previous.before;
      scene.onAfterRender = previous.after;
      scene.camera.position.copy(previous.position);
      scene.camera.quaternion.copy(previous.quaternion);
      scene.controls.target.copy(previous.target);
      scene.controls.enabled = previous.enabled;
      scene.cinematic = previous.cinematic;
      scene.controls.update();
      stream.getTracks().forEach((t) => t.stop());
      if (tap) audio?.compressor.disconnect(tap);
      this.active = false;
      this.recorder = null;
      this.cleanup = null;
    };
    scene.onBeforeRender = () => {
      previous.before?.();
      if (!options.director) return;
      const elapsed = (performance.now() - start) / 1000,
        shot = Math.floor(elapsed / 6) % 3,
        s = scene.lastState,
        ball =
          s?.ballVector && !s.ballVector.lost
            ? s.objects.find((o) => o.id === s.ballVector?.targetId)
            : undefined;
      const target = previous.target.clone(),
        position = previous.position.clone();
      if (shot === 1 && ball) {
        target.set(ball.position.x, ball.position.y, ball.position.z);
        position.set(
          ball.position.x + 0.45,
          ball.position.y - 0.58,
          ball.position.z + 0.56,
        );
      } else if (shot === 2) {
        target.set(0, 0, 0.26);
        position.set(0.75, -0.85, 0.55);
      } else {
        target.set(0, 0, 0.3);
        position.set(
          1.05 * Math.cos(-0.9 + elapsed * 0.025),
          1.05 * Math.sin(-0.9 + elapsed * 0.025),
          0.94,
        );
      }
      scene.camera.position.lerp(position, 0.035);
      scene.controls.target.lerp(target, 0.035);
    };
    scene.onAfterRender = (webgl) => {
      previous.after?.(webgl);
      const now = performance.now();
      this.elapsed = (now - start) / 1000;
      if (now - last < 1000 / 30) return;
      last = now;
      try {
        const w = canvas.width,
          h = canvas.height,
          p = options.portrait,
          c = caption();
        ctx.fillStyle = '#0b1723';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#76efd0';
        ctx.font = '600 18px Arial';
        ctx.fillText('HEXAMOTION / MOTION LAB', 40, 45);
        ctx.fillStyle = '#eef5fa';
        ctx.font = `600 ${p ? 34 : 32}px Microsoft JhengHei, Arial`;
        ctx.fillText(c.title.slice(0, 28), 40, 96);
        ctx.font = '20px Microsoft JhengHei, Arial';
        ctx.fillStyle = '#a7c1d2';
        ctx.fillText(c.task.slice(0, 40), 40, 134);
        const top = p ? 180 : 155,
          areaH = p ? 690 : 410,
          scale = Math.min((w - 32) / webgl.width, areaH / webgl.height);
        const dw = webgl.width * scale,
          dh = webgl.height * scale;
        ctx.drawImage(webgl, (w - dw) / 2, top + (areaH - dh) / 2, dw, dh);
        const metricsY = p ? 920 : 615;
        ctx.fillStyle = '#1b3444';
        ctx.fillRect(32, metricsY - 35, w - 64, p ? 120 : 76);
        const labels = [
          ['球速', `${(c.speed * 1000).toFixed(0)} mm/s`],
          ['追蹤誤差', `${(c.error * 1000).toFixed(1)} mm`],
          ['模擬時間', `${c.time.toFixed(1)} s`],
        ];
        labels.forEach(([label, value], i) => {
          const x = 55 + (i * (w - 90)) / 3;
          ctx.font = '17px Microsoft JhengHei, Arial';
          ctx.fillStyle = '#a6c1d0';
          ctx.fillText(label, x, metricsY - 8);
          ctx.font = `500 ${p ? 24 : 25}px Consolas, monospace`;
          ctx.fillStyle = '#a9ffe7';
          ctx.fillText(value, x, metricsY + 28);
        });
        samples.push(c.error);
        if (samples.length > 150) samples.shift();
        if (p) {
          ctx.strokeStyle = '#79ebd1';
          ctx.lineWidth = 3;
          ctx.beginPath();
          samples.forEach((v, i) => {
            const x = 45 + (i / 149) * (w - 90),
              y = 1160 - Math.min(1, v / 0.15) * 90;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.font = '16px Arial';
          ctx.fillStyle = '#91adbf';
          ctx.fillText('TRACKING ERROR / LIVE', 45, 1045);
        }
        ctx.font = '16px Arial';
        ctx.fillStyle = '#91adbf';
        ctx.fillText(
          'stewart playground · physics in your browser',
          40,
          h - 24,
        );
        ctx.textAlign = 'right';
        ctx.fillText(`${this.elapsed.toFixed(1)} s`, w - 40, h - 24);
        ctx.textAlign = 'left';
      } catch {
        failed = '錄影畫面無法擷取，請重新整理後再試。';
        this.stop();
      }
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > 48 * 1024 * 1024) this.stop();
      }
    };
    recorder.onerror = () => {
      failed = '影片錄製中斷，請縮短片長或關閉其他分頁後再試。';
      this.stop();
    };
    recorder.onstop = () => {
      const duration = this.elapsed;
      this.cleanup?.();
      if (this.cancelled) return;
      if (failed || !chunks.length) {
        error(failed || '沒有收到影片畫面，請再試一次。');
        return;
      }
      const type = recorder.mimeType || mime || 'video/webm',
        blob = new Blob(chunks, { type });
      done({
        blob,
        url: URL.createObjectURL(blob),
        filename: `HEXAMOTION-${paddedDate()}.${type.includes('mp4') ? 'mp4' : 'webm'}`,
        duration,
        width: canvas.width,
        height: canvas.height,
      });
    };
    try {
      scene.onAfterRender(scene.renderer.domElement);
      recorder.start(500);
      this.timeout = setTimeout(
        () => this.stop(),
        Math.max(5, Math.min(60, options.duration)) * 1000,
      );
    } catch {
      this.cleanup?.();
      throw new Error('影片未能開始錄製，請再試一次。');
    }
  }
  stop() {
    if (this.recorder && this.recorder.state !== 'inactive')
      this.recorder.stop();
  }
  dispose() {
    this.cancelled = true;
    this.stop();
    this.cleanup?.();
  }
}
function paddedDate() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
