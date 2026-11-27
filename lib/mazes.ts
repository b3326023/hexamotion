import type { Point2 } from './drawn-path';
export type Wall = Point2 & { w: number; d: number };
export type Maze = {
  id: string;
  name: string;
  description: string;
  par: number;
  limit: number;
  walls: Wall[];
  holes: Wall[];
  start: Point2;
  checkpoints: Point2[];
  goal: Point2;
};
export const MAZE_BOUNDARY: Wall[] = [
  { x: -0.19, y: 0, w: 0.012, d: 0.38 },
  { x: 0.19, y: 0, w: 0.012, d: 0.38 },
  { x: 0, y: -0.19, w: 0.392, d: 0.012 },
  { x: 0, y: 0.19, w: 0.392, d: 0.012 },
];
export const MAZES: Maze[] = [
  {
    id: 'switchback',
    name: '01 / 折返入門',
    description: '繞過兩道牆，依序收集光圈，最後停在終點。',
    par: 45,
    limit: 120,
    walls: [
      { x: -0.04, y: -0.06, w: 0.3, d: 0.012 },
      { x: 0.04, y: 0.06, w: 0.3, d: 0.012 },
    ],
    holes: [],
    start: { x: -0.14, y: -0.135 },
    checkpoints: [
      { x: 0.145, y: -0.105 },
      { x: 0.145, y: 0 },
      { x: -0.145, y: 0 },
      { x: -0.145, y: 0.135 },
    ],
    goal: { x: 0.135, y: 0.135 },
  },
  {
    id: 'slalom',
    name: '02 / 交錯閘門',
    description: '提前反向傾斜減速，穿過三道交錯的閘門。',
    par: 60,
    limit: 150,
    walls: [
      { x: -0.1, y: -0.065, w: 0.012, d: 0.25 },
      { x: 0, y: 0.065, w: 0.012, d: 0.25 },
      { x: 0.1, y: -0.065, w: 0.012, d: 0.25 },
    ],
    holes: [],
    start: { x: -0.145, y: -0.14 },
    checkpoints: [
      { x: -0.145, y: 0.13 },
      { x: -0.05, y: 0.13 },
      { x: -0.05, y: -0.13 },
      { x: 0.05, y: -0.13 },
      { x: 0.05, y: 0.13 },
      { x: 0.145, y: 0.13 },
    ],
    goal: { x: 0.145, y: -0.14 },
  },
  {
    id: 'islands',
    name: '03 / 空洞之間',
    description: '避開真正的落球孔洞，沿外圍找到安全路線。',
    par: 45,
    limit: 120,
    walls: [{ x: -0.075, y: 0.06, w: 0.1, d: 0.012 }],
    holes: [
      { x: -0.04, y: -0.05, w: 0.07, d: 0.07 },
      { x: 0.08, y: 0.07, w: 0.07, d: 0.07 },
    ],
    start: { x: -0.14, y: -0.14 },
    checkpoints: [
      { x: 0.14, y: -0.14 },
      { x: 0.145, y: 0.14 },
      { x: 0, y: 0.145 },
      { x: -0.145, y: 0.145 },
    ],
    goal: { x: -0.145, y: -0.005 },
  },
];
/** Non-overlapping slab rectangles; actual missing cells are physical holes. */
export function mazeFloor(maze: Maze): Wall[] {
  const xs = [
    -0.3,
    0.3,
    ...maze.holes.flatMap((h) => [h.x - h.w / 2, h.x + h.w / 2]),
  ].sort((a, b) => a - b);
  const ys = [
    -0.3,
    0.3,
    ...maze.holes.flatMap((h) => [h.y - h.d / 2, h.y + h.d / 2]),
  ].sort((a, b) => a - b);
  const cells: Wall[] = [];
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const x = (xs[i] + xs[i - 1]) / 2,
        y = (ys[j] + ys[j - 1]) / 2;
      if (
        !maze.holes.some(
          (h) => Math.abs(x - h.x) < h.w / 2 && Math.abs(y - h.y) < h.d / 2,
        )
      )
        cells.push({ x, y, w: xs[i] - xs[i - 1], d: ys[j] - ys[j - 1] });
    }
  return cells;
}
