import type { Simulation } from './simulation';
import type { PlaySession } from './play-session';
import { MAZES } from './mazes';
import { presetPath, type Point2 } from './drawn-path';
export function registerLabTools(
  sim: Simulation,
  refresh: () => void,
  play?: PlaySession,
) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (tool: unknown, options: unknown) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools = [
    {
      name: 'read_stewart_state',
      title: 'Read Stewart state',
      description:
        'Read simulated pose, actuator states and ball tracking in SI units.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        time: sim.time,
        pose: sim.pose,
        actuators: sim.actuators,
        ball: sim.ball,
        objectCount: sim.objects.length,
        auto: sim.auto,
        activeTask: sim.activeTask,
        version: '2.0',
        path: {
          speed: sim.pathSpeed,
          minSpeed: sim.drawnPath.minSpeed,
          period: sim.drawnPath.period,
          target: sim.pathTarget,
        },
        game: play?.run,
        maze: sim.maze?.id,
        circle: {
          radius: sim.circleRadius,
          speed: sim.circleSpeed,
          effectiveSpeed: sim.circleEffectiveSpeed,
          direction: sim.circleDirection,
          target: sim.circleTarget,
        },
        status: sim.status,
      }),
    },
    {
      name: 'set_stewart_pose',
      title: 'Command platform pose',
      description:
        'Command six-axis target through motion planning, inverse kinematics and actuator servos. SI units; z is absolute height.',
      inputSchema: {
        type: 'object',
        properties: {
          pose: {
            type: 'array',
            items: { type: 'number' },
            minItems: 6,
            maxItems: 6,
          },
        },
        required: ['pose'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = (input as { pose?: unknown })?.pose;
        if (
          !Array.isArray(p) ||
          p.length !== 6 ||
          !p.every((v) => typeof v === 'number' && Number.isFinite(v))
        )
          throw Error('pose must contain six finite SI values');
        if (!sim.setPose(p as [number, number, number, number, number, number]))
          throw Error(sim.message);
        refresh();
        return { target: sim.target, status: 'commanded' };
      },
    },
    {
      name: 'start_ball_centering',
      title: 'Start ball centering',
      description:
        'Enable closed-loop centering for existing balls, or wait for a user to launch a ball. Does not spawn objects.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: () => {
        if (sim.estop || sim.replaying)
          throw Error('Reset replay or release emergency stop first');
        sim.setAuto(true);
        refresh();
        return { auto: sim.auto, objects: sim.objects.length };
      },
    },
    {
      name: 'set_ball_circle',
      title: 'Configure ball circle tracking',
      description:
        'Configure a physical ball circle in local XY, radius in metres and tangential speed in m/s. Enable or disable tracking without spawning or moving bodies directly.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          radius: { type: 'number', minimum: 0.02, maximum: 0.18 },
          speed: { type: 'number', minimum: 0.01, maximum: 0.18 },
          direction: { type: 'number', enum: [1, -1] },
        },
        required: ['enabled'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = input as {
          enabled: boolean;
          radius?: number;
          speed?: number;
          direction?: 1 | -1;
        };
        if (
          typeof p?.enabled !== 'boolean' ||
          [p.radius, p.speed, p.direction].some(
            (v) => v !== undefined && !Number.isFinite(v),
          )
        )
          throw Error('Invalid circle settings');
        if (sim.estop || sim.replaying)
          throw Error('Release emergency stop or finish replay first');
        const config = {
          ...(p.radius !== undefined ? { radius: p.radius } : {}),
          ...(p.speed !== undefined ? { speed: p.speed } : {}),
          ...(p.direction !== undefined ? { direction: p.direction } : {}),
        };
        sim.configureCircle(config);
        sim.setCircle(p.enabled);
        refresh();
        return {
          active: sim.activeTask,
          radius: sim.circleRadius,
          speed: sim.circleEffectiveSpeed,
          objectCount: sim.objects.length,
        };
      },
    },
  ];
  const playTools = [
    {
      name: 'set_stewart_drawn_path',
      title: 'Configure drawn ball path',
      description:
        'Configure a smooth closed ball path in local metres. Does not spawn or teleport a ball.',
      inputSchema: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: ['eight', 'heart', 'circle', 'flower'],
          },
          points: {
            type: 'array',
            minItems: 4,
            maxItems: 1024,
            items: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' } },
              required: ['x', 'y'],
            },
          },
          speed: { type: 'number', minimum: 0.02, maximum: 0.16 },
          enabled: { type: 'boolean' },
        },
        required: ['enabled'],
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = input as {
          preset?: string;
          points?: Point2[];
          speed?: number;
          enabled: boolean;
        };
        if (typeof p?.enabled !== 'boolean' || play?.active)
          throw new Error('Finish the current challenge first');
        if (
          !sim.configurePath(
            p.points ?? presetPath(p.preset ?? 'eight'),
            p.speed ?? sim.pathSpeed,
          )
        )
          throw new Error(sim.message);
        sim.setPath(p.enabled);
        refresh();
        return { active: sim.activeTask, period: sim.drawnPath.period };
      },
    },
    {
      name: 'start_stewart_game',
      title: 'Start a fresh game',
      description:
        'Start a maze or manual challenge with a fresh platform and one prepared ball. This resets the current 2.0 scene.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['maze', 'challenge'] },
          id: { type: 'string' },
        },
        required: ['kind', 'id'],
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = input as { kind: string; id: string };
        if (!play) throw new Error('Play mode unavailable');
        if (p.kind === 'maze') {
          const i = MAZES.findIndex((m) => m.id === p.id);
          if (i < 0) throw new Error('Unknown maze');
          play.startMaze(i);
        } else if (
          p.kind === 'challenge' &&
          ['center', 'precision', 'sea'].includes(p.id)
        )
          play.startChallenge(p.id);
        else throw new Error('Unknown game');
        refresh();
        return play.run;
      },
    },
    {
      name: 'set_stewart_joystick',
      title: 'Control manual tilt',
      description:
        'Set the same normalized XY tilt input as the on-screen joystick, between -1 and 1. Zero returns the platform to level. Only active manual games accept input.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', minimum: -1, maximum: 1 },
          y: { type: 'number', minimum: -1, maximum: 1 },
        },
        required: ['x', 'y'],
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const p = input as Point2;
        if (!play?.active || ![p?.x, p?.y].every(Number.isFinite))
          throw new Error('Start a game and provide finite XY input');
        play.setJoystick(p.x, p.y);
        refresh();
        return play.joystick;
      },
    },
  ];
  for (const tool of [...tools, ...playTools]) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
