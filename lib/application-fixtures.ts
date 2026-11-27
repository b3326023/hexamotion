import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { fixtureCollisionParts } from "./machined-model";

// Configured mass of each scaled bench fixture, in kg. These values describe
// the simulated articles, independent of the adjustable eccentric ballast.
export const FIXTURE_MASS = {
  manual: 0,
  flight: 3.2,
  driving: 3.8,
  rail: 3.4,
  cinema: 2.8,
  marine: 2.6,
  camera: 1.4,
  optics: 1.6,
  docking: 3.6,
  balance: 2.0,
  machining: 5.2,
  photonics: 1.5,
  seismic: 2.4,
  vibration: 2.2,
} as const;
export type FixtureId = keyof typeof FIXTURE_MASS;
export const isFixtureId = (id: unknown): id is FixtureId =>
  typeof id === "string" && Object.hasOwn(FIXTURE_MASS, id);

const layouts = new Map<string, Float32Array[]>();
const center = { x: 0, y: 0, z: 0 };
const axisX = { x: 1, y: 0, z: 0 };

export class Specimen {
  readonly joint: RAPIER.PrismaticImpulseJoint;
  dampingRatio = -1;
  constructor(
    readonly world: RAPIER.World,
    readonly deck: RAPIER.RigidBody,
    readonly body: RAPIER.RigidBody,
    readonly frequency: number,
    damping: number,
  ) {
    this.joint = world.createImpulseJoint(
      RAPIER.JointData.prismatic(center, center, axisX),
      deck,
      body,
      true,
    ) as RAPIER.PrismaticImpulseJoint;
    this.joint.setContactsEnabled(false);
    this.joint.setLimits(-0.04, 0.04);
    this.joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    this.joint.setMotorMaxForce(100);
    this.setDamping(damping);
  }
  setDamping(ratio: number) {
    if (!Number.isFinite(ratio)) return;
    const effective = Math.max(0.02, Math.min(1, ratio));
    if (Math.abs(effective - this.dampingRatio) < 1e-5) return;
    this.dampingRatio = effective;
    const omega = 2 * Math.PI * this.frequency;
    const m = this.body.mass();
    this.joint.configureMotorPosition(0, m * omega * omega, 2 * effective * m * omega);
  }
  private axis() {
    return new Vector3(1, 0, 0).applyQuaternion(this.deck.rotation());
  }
  get displacement() {
    return new Vector3()
      .copy(this.body.translation())
      .sub(this.deck.translation())
      .dot(this.axis());
  }
  get velocity() {
    const p = this.body.translation();
    return new Vector3()
      .copy(this.body.velocityAtPoint(p))
      .sub(this.deck.velocityAtPoint(p))
      .dot(this.axis());
  }
  get displacementWorldX() {
    return this.body.translation().x;
  }
}

function attachParts(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  id: FixtureId,
  part: "all" | "fixed" | "moving",
  referenceMass: number,
) {
  const key = id + "-" + part;
  let parts = layouts.get(key);
  if (!parts) {
    parts = fixtureCollisionParts(id, part);
    layouts.set(key, parts);
  }
  const colliders: RAPIER.Collider[] = [];
  for (const vertices of parts) {
    const hull = RAPIER.ColliderDesc.convexHull(vertices);
    if (hull)
      colliders.push(world.createCollider(hull.setFriction(0.58).setRestitution(0.18), body));
  }
  const volume = colliders.reduce((sum, c) => sum + c.volume(), 0);
  if (!volume) throw new Error("應用治具缺少有效碰撞體");
  // A common effective density preserves the distribution of volume about
  // the mounting face and normalizes each assembly to its reference mass.
  for (const collider of colliders) collider.setDensity(referenceMass / volume);
  body.recomputeMassPropertiesFromColliders();
  return colliders;
}

export function attachFixture(
  world: RAPIER.World,
  deck: RAPIER.RigidBody,
  id: FixtureId,
): { colliders: RAPIER.Collider[]; specimen: Specimen | null } {
  if (id === "manual") return { colliders: [], specimen: null };
  if (id !== "seismic" && id !== "vibration")
    return { colliders: attachParts(world, deck, id, "all", FIXTURE_MASS[id]), specimen: null };
  const seismic = id === "seismic";
  const movingMass = seismic ? 1.6 : 1.4;
  const fixed = attachParts(world, deck, id, "fixed", FIXTURE_MASS[id] - movingMass);
  const p = deck.translation(),
    v = deck.velocityAtPoint(p),
    w = deck.angvel();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation(deck.rotation())
      .setLinvel(v.x, v.y, v.z)
      .setAngvel(w)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  const moving = attachParts(world, body, id, "moving", movingMass);
  return {
    colliders: [...fixed, ...moving],
    specimen: new Specimen(world, deck, body, seismic ? 0.65 : 1.02, seismic ? 0.09 : 0.12),
  };
}
