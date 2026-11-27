import { Matrix4, Quaternion, Vector3 } from "three";

const UP = new Vector3(0, 0, 1);
const LOCAL_AXIS = new Vector3(0, 1, 0);

/** Installation datum of the lower seat. Local +Y is the stroke and +Z faces the cable socket. */
export function actuatorMount(anchor: Vector3) {
  const azimuth = Math.atan2(anchor.y, anchor.x);
  const radial = new Vector3(Math.cos(azimuth), Math.sin(azimuth), 0);
  const tangent = new Vector3(radial.y, -radial.x, 0);
  const neutral = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(tangent, UP, radial.negate()),
  );
  const cableSocket = new Vector3(anchor.x, anchor.y, 0)
    .multiplyScalar(0.68)
    .applyAxisAngle(UP, 0.16)
    .setZ(0.076);
  return { neutral, cableSocket };
}

/** Swing the installed cylinder onto its measured axis without adding any twist at the seat. */
export function actuatorOrientation(mount: Quaternion, foundation: Quaternion, direction: Vector3) {
  const installed = foundation.clone().multiply(mount);
  const upright = LOCAL_AXIS.clone().applyQuaternion(installed);
  return new Quaternion().setFromUnitVectors(upright, direction).multiply(installed);
}
