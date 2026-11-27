import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { actuatorMount, actuatorOrientation } from "./actuator-mount";
import {
  actuatorDimensions,
  anchors,
  clamp,
  endpoints,
  solve,
  type Geometry,
  type Pose,
} from "./kinematics";
import type { Actuator } from "./simulation";
import { baseCastingMesh } from "./base-casting";

const AXIS = new Vector3(0, 1, 0);
const ZERO = { x: 0, y: 0, z: 0 };
const BARREL_MASS = 1.3;
const ROD_MASS = 0.48;
const vector = (v: { x: number; y: number; z: number }) => new Vector3(v.x, v.y, v.z);
export type LegFrame = { base: RAPIER.Vector; top: RAPIER.Vector; rotation: RAPIER.Rotation };

export function hexHull(radius: number, bottom: number, top: number, rotation: number) {
  const vertices: number[] = [];
  for (const z of [bottom, top]) {
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + rotation;
      vertices.push(radius * Math.cos(angle), radius * Math.sin(angle), z);
    }
  }
  return RAPIER.ColliderDesc.convexHull(new Float32Array(vertices))!;
}

export function createFoundation(world: RAPIER.World, baseRadius: number) {
  const base = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const { vertices, indices } = baseCastingMesh(baseRadius);
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.65), base);
  return base;
}

export class ActuatorAssembly {
  base: RAPIER.RigidBody;
  legs: { barrel: RAPIER.RigidBody; rod: RAPIER.RigidBody; slide: RAPIER.PrismaticImpulseJoint }[];
  readonly lengths: ReturnType<typeof actuatorDimensions>;
  readonly legFirstMoment: number;

  constructor(
    world: RAPIER.World,
    deck: RAPIER.RigidBody,
    base: RAPIER.RigidBody,
    g: Geometry,
    initial: Pose,
  ) {
    const mounts = anchors(g);
    const points = endpoints(initial, g);
    this.base = base;
    this.lengths = actuatorDimensions(g.maxLength);
    const mainLength = this.lengths.barrel * (0.265 / 0.345);
    const noseLength = this.lengths.barrel - mainLength;
    const mainMass = BARREL_MASS * 0.9,
      noseMass = BARREL_MASS - mainMass;
    this.legFirstMoment =
      (mainMass * mainLength) / 2 +
      noseMass * (mainLength + noseLength / 2) -
      (ROD_MASS * this.lengths.rod) / 2;
    this.legs = points.base.map((base, i) => {
      const top = points.top[i];
      const axis = top.clone().sub(base).normalize();
      const mount = actuatorMount(mounts.base[i]);
      const q = actuatorOrientation(mount.neutral, new Quaternion(), axis);
      const member = (
        position: Vector3,
        length: number,
        radius: number,
        mass: number,
        sign: number,
      ) => {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(q)
            .setCanSleep(false),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cylinder(length / 2, radius)
            .setTranslation(0, (sign * length) / 2, 0)
            .setMass(mass)
            .setFriction(0.55),
          body,
        );
        return body;
      };
      const barrel = member(base, mainLength, 0.03, mainMass, 1);
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(noseLength / 2, 0.0195)
          .setTranslation(0, mainLength + noseLength / 2, 0)
          .setMass(noseMass)
          .setFriction(0.55),
        barrel,
      );
      const rod = member(top, this.lengths.rod, 0.013, ROD_MASS, -1);
      // Origins are at the ball-joint centers. Thus slide travel is the
      // absolute distance between centers, including the retracted length.
      // Key the sleeve to its installed lower seat. It can swing on both axes,
      // but axial torque is reacted by the foundation instead of winding up the lead.
      const mask = RAPIER.JointAxesMask;
      const lower = world.createImpulseJoint(
        RAPIER.JointData.generic(mounts.base[i], ZERO, AXIS, mask.LinX | mask.LinY | mask.LinZ | mask.AngY),
        this.base,
        barrel,
        true,
      );
      lower.setFrameX1(mount.neutral);
      lower.setFrameX2(new Quaternion());
      const slide = world.createImpulseJoint(
        RAPIER.JointData.prismatic(ZERO, ZERO, AXIS),
        barrel,
        rod,
        true,
      ) as RAPIER.PrismaticImpulseJoint;
      const upper = world.createImpulseJoint(
        RAPIER.JointData.spherical(ZERO, mounts.top[i]),
        rod,
        deck,
        true,
      );
      slide.setLimits(g.minLength, g.maxLength);
      for (const joint of [lower, slide, upper]) joint.setContactsEnabled(false);
      return { barrel, rod, slide };
    });
  }

  frames(): LegFrame[] {
    return this.legs.map(({ barrel, rod }) => ({
      base: { ...barrel.translation() },
      top: { ...rod.translation() },
      rotation: { ...barrel.rotation() },
    }));
  }
  measuredLengths() {
    return this.legs.map(({ barrel, rod }) => {
      const a = barrel.translation(), b = rod.translation();
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    });
  }

  drive(
    deck: RAPIER.RigidBody,
    actuators: Actuator[],
    g: Geometry,
    gravity: number,
    specimen?: RAPIER.RigidBody,
  ) {
    const origin = vector(deck.translation());
    const weight = new Vector3(0, 0, gravity * deck.mass());
    const moment = vector(deck.worldCom()).sub(origin).cross(weight);
    if (specimen) {
      const specimenWeight = new Vector3(0, 0, gravity * specimen.mass());
      moment.add(vector(specimen.worldCom()).sub(origin).cross(specimenWeight));
      weight.add(specimenWeight);
    }
    const measurements = this.legs.map(({ barrel, rod }) => {
      const base = barrel.translation(),
        top = rod.translation();
      const delta = vector(top).sub(base);
      const length = delta.length();
      const direction = delta.divideScalar(Math.max(1e-8, length));
      const arm = vector(top).sub(origin);
      const torqueArm = arm.clone().cross(direction);
      // The sleeve mass pivots around its lower seat; the piston pivots
      // around the upper seat. Virtual work gives their gravity wrench.
      const legWeight = new Vector3(0, 0, 1)
        .addScaledVector(direction, -direction.z)
        .multiplyScalar((gravity * this.legFirstMoment) / length);
      legWeight.z += gravity * ROD_MASS;
      weight.add(legWeight);
      moment.add(arm.cross(legWeight));
      const speed = vector(rod.velocityAtPoint(top))
        .sub(barrel.velocityAtPoint(base))
        .dot(direction);
      return {
        base,
        top,
        length,
        direction,
        speed,
        jacobianRow: [...direction.toArray(), ...torqueArm.toArray()],
      };
    });
    const J = measurements.map((m) => m.jacobianRow);
    const feedForward = solve(
      J[0].map((_, c) => J.map((row) => row[c])),
      [...weight.toArray(), ...moment.toArray()],
    );
    const normal = (body: RAPIER.RigidBody) =>
      new Vector3(0, 0, 1).applyQuaternion(body.rotation());
    const lowerNormal = normal(this.base),
      upperNormal = normal(deck);
    this.legs.forEach(({ barrel, rod }, i) => {
      const a = actuators[i];
      const m = measurements[i];
      a.force = a.failed
        ? 0
        : clamp(
            20000 * (a.command - m.length) +
              566 * (a.commandVelocity - m.speed) +
              (feedForward?.[i] ?? 0),
            -g.maxForce,
            g.maxForce,
          );
      const force = m.direction.clone().multiplyScalar(a.force);
      // Internal thrust has zero net force and torque. Only the end joints
      // transmit thrust to the deck and foundation.
      rod.resetForces(true);
      barrel.resetForces(true);
      rod.resetTorques(true);
      barrel.resetTorques(true);
      rod.addForce(force, true);
      barrel.addForce(force.negate(), true);
      // Compliant angular stops model the ball studs contacting their sockets.
      // The native prismatic joint independently constrains the stroke.
      const stop = (axis: Vector3, member: RAPIER.RigidBody, seat: RAPIER.RigidBody) => {
        const cosine = clamp(m.direction.dot(axis), -1, 1);
        if (cosine >= Math.cos(g.jointLimit)) return;
        const righting = m.direction.clone().cross(axis).normalize();
        const speed = vector(member.angvel()).sub(seat.angvel()).dot(righting);
        const torque = righting.multiplyScalar(
          clamp(220 * (Math.acos(cosine) - g.jointLimit) - 4 * speed, 0, 90),
        );
        member.addTorque(torque, true);
        if (seat.isDynamic()) seat.addTorque(torque.negate(), true);
      };
      stop(lowerNormal, barrel, this.base);
      stop(upperNormal, rod, deck);
    });
  }
}
