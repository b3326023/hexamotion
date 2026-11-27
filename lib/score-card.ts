import type { PlayResult } from './play-session';
export async function scoreCard(result: PlayResult): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f1c2b';
  ctx.fillRect(0, 0, 1200, 800);
  ctx.strokeStyle = '#294958';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 1140, 740);
  ctx.fillStyle = '#7eedcd';
  ctx.font = '600 22px Arial';
  ctx.fillText('HEXAMOTION / MOTION LAB', 65, 90);
  ctx.fillStyle = '#edf5fa';
  ctx.font = '600 48px Microsoft JhengHei, Arial';
  ctx.fillText(result.title, 65, 175);
  ctx.fillStyle = '#f2c785';
  ctx.font = '500 28px Microsoft JhengHei, Arial';
  ctx.fillText(result.medal, 68, 232);
  ctx.fillStyle = '#aeffe5';
  ctx.font = '600 146px Consolas, monospace';
  ctx.fillText(String(result.score), 60, 405);
  ctx.font = '24px Microsoft JhengHei, Arial';
  ctx.fillStyle = '#96b1c2';
  ctx.fillText('POINTS', 72, 454);
  ctx.font = '26px Microsoft JhengHei, Arial';
  ctx.fillText(`完成時間  ${result.elapsed.toFixed(2)} 秒`, 68, 537);
  ctx.fillText(`接觸碰撞  ${result.collisions} 次`, 68, 590);
  if (typeof result.workJ === 'number') {
    ctx.fillText(`六腿機械功  ${result.workJ.toFixed(2)} J`, 68, 643);
  }
  const cx = 900,
    cy = 420,
    r = 210;
  ctx.strokeStyle = '#2c4857';
  for (const radius of [70, 140, 210]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#81f1d4';
  ctx.lineWidth = 4;
  ctx.beginPath();
  result.trace.forEach((p, i) => {
    const x = cx + (p.x / 0.2) * r,
      y = cy - (p.y / 0.2) * r;
    if (!i) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#8ca9bb';
  ctx.font = '21px Microsoft JhengHei, Arial';
  ctx.fillText('我的實際滾球軌跡', 760, 680);
  ctx.fillText('一起來挑戰六軸平台！', 65, 730);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('成績卡無法建立'))),
      'image/png',
    ),
  );
}
