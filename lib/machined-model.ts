import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { anchors, actuatorDimensions, type Geometry } from "./kinematics";
import { plate } from "./base-casting";
import { actuatorMount, actuatorOrientation } from "./actuator-mount";

const TAU = Math.PI * 2;
const polar = (r: number, a: number, z = 0) => new T.Vector3(r * Math.cos(a), r * Math.sin(a), z);
const vec = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const alloy = "#acb5b9",
  bright = "#d9dede",
  graphite = "#333b41",
  iron = "#555e64";
const seal = "#181c20",
  orange = "#ed591c",
  inset = "#272c30",
  ceramic = "#d6d4c9";
type Finish = "machined" | "polished" | "coated" | "rubber";
const finishSettings: Record<Finish, [number, number]> = {
  machined: [0.85, 0.33],
  polished: [0.96, 0.17],
  coated: [0.42, 0.39],
  rubber: [0.05, 0.64],
};

// Keep each rigid subassembly to one draw call per surface finish. Geometry stays
// in metres, in the local frame of the corresponding physical component.
class Batch {
  bins = new Map<Finish, T.BufferGeometry[]>();
  constructor(private readonly collisionParts?: Float32Array[]) {}
  add(
    geo: T.BufferGeometry,
    color: string,
    finish: Finish = "machined",
    p = vec(),
    rot = new T.Euler(),
  ) {
    geo.rotateX(rot.x).rotateY(rot.y).rotateZ(rot.z).translate(p.x, p.y, p.z);
    if (this.collisionParts) {
      collectHullParts(geo, this.collisionParts);
      geo.dispose();
      return;
    }
    if (geo.index) {
      const raw = geo;
      geo = raw.toNonIndexed();
      raw.dispose();
    }
    geo.deleteAttribute("uv");
    const c = new T.Color(color);
    const colors = new Float32Array(geo.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    const bin = this.bins.get(finish) ?? [];
    bin.push(geo);
    this.bins.set(finish, bin);
  }
  cylinder(
    r: number,
    h: number,
    p: T.Vector3,
    color: string,
    finish: Finish = "machined",
    segments = 32,
    rTop = r,
  ) {
    this.add(new T.CylinderGeometry(rTop, r, h, segments).rotateX(Math.PI / 2), color, finish, p);
  }
  box(
    w: number,
    d: number,
    h: number,
    p: T.Vector3,
    color: string,
    finish: Finish = "machined",
    az = 0,
  ) {
    this.add(new T.BoxGeometry(w, d, h), color, finish, p, new T.Euler(0, 0, az));
  }
  rod(
    a: T.Vector3,
    b: T.Vector3,
    r: number,
    color: string,
    finish: Finish = "machined",
    sides = 18,
  ) {
    const d = b.clone().sub(a),
      q = new T.Quaternion().setFromUnitVectors(vec(0, 1, 0), d.clone().normalize());
    this.add(
      new T.CylinderGeometry(r, r, d.length(), sides).applyQuaternion(q),
      color,
      finish,
      a.clone().lerp(b, 0.5),
    );
  }
  hose(points: T.Vector3[], radius: number, color: string, finish: Finish = "rubber") {
    this.add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points, false, "centripetal"),
        32,
        radius,
        8,
        false,
      ),
      color,
      finish,
    );
  }
  torus(
    r: number,
    t: number,
    p: T.Vector3,
    color: string,
    finish: Finish = "machined",
    segments = 64,
  ) {
    this.add(new T.TorusGeometry(r, t, 6, segments), color, finish, p);
  }
  bolt(p: T.Vector3, r = 0.007) {
    this.cylinder(r * 1.24, r * 0.22, p, iron, "machined", 18);
    this.cylinder(r, r * 0.58, p.clone().add(vec(0, 0, r * 0.26)), bright, "polished", 20);
    this.cylinder(r * 0.5, r * 0.04, p.clone().add(vec(0, 0, r * 0.57)), inset, "rubber", 6);
  }
  finish(name: string) {
    const group = new T.Group();
    group.name = name;
    for (const [finish, bucket] of this.bins) {
      const [metalness, roughness] = finishSettings[finish];
      const geo = mergeGeometries(bucket)!;
      bucket.forEach((g) => g.dispose());
      const m = new T.Mesh(
        geo,
        new T.MeshStandardMaterial({ vertexColors: true, metalness, roughness }),
      );
      m.name = finish;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
}

/** Partition non-convex rings and the dish into closed angular sectors, preserving the centre openings. */
function collectHullParts(geometry: T.BufferGeometry, parts: Float32Array[]) {
  const pos = geometry.getAttribute("position");
  const sectorPoints = (
    start: number,
    end: number,
    indices: number[],
    vertex: (i: number, j: number) => number,
  ) => {
    const points = [];
    for (let i = start; i <= end; i++)
      for (const j of indices) {
        const p = vertex(i, j);
        points.push(pos.getX(p), pos.getY(p), pos.getZ(p));
      }
    parts.push(new Float32Array(points));
  };
  if (geometry instanceof T.TorusGeometry) {
    const { tubularSegments: s, radialSegments: n } = geometry.parameters;
    const row = Array.from({ length: n + 1 }, (_, i) => i);
    for (let k = 0; k < 16; k++)
      sectorPoints(
        Math.floor((k * s) / 16),
        Math.floor(((k + 1) * s) / 16),
        row,
        (i, j) => j * (s + 1) + i,
      );
  } else if (geometry instanceof T.LatheGeometry) {
    const { segments: s, points } = geometry.parameters,
      n = points.length;
    for (let k = 0; k < 16; k++)
      for (let j = 0; j < n / 2 - 1; j++) {
        sectorPoints(
          Math.floor((k * s) / 16),
          Math.floor(((k + 1) * s) / 16),
          [j, j + 1, n - 2 - j, n - 1 - j],
          (i, j) => i * n + j,
        );
      }
  } else {
    const points = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) points.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    parts.push(points);
  }
}
function makeLabel(text: string, w: number, h: number, inverse = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = inverse ? "#d4d6cd" : "#25292c";
  ctx.fillRect(0, 0, 768, 160);
  ctx.fillStyle = "#f56828";
  ctx.fillRect(15, 15, 14, 130);
  ctx.fillStyle = inverse ? "#202326" : "#eae9de";
  ctx.font = "bold 78px Arial";
  ctx.fillText(text, 54, 91);
  ctx.font = "24px monospace";
  ctx.fillText("HEXAMOTION   /   SIX AXIS", 56, 132);
  for (let i = 0; i < 27; i++) {
    const bw = i % 4 === 0 ? 3 : 6;
    ctx.fillRect(615 + i * 4.3, 29, bw, 68);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const plane = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshStandardMaterial({
      map,
      roughness: 0.5,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  plane.name = "identification plate";
  return plane;
}
function rotaryFace(radius: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!,
    c = 512;
  ctx.fillStyle = "#333a3f";
  ctx.fillRect(0, 0, 1024, 1024);
  // Deterministic lathe marks, bolt pattern, and engraved angle scale.
  let seed = 261;
  for (let i = 1; i < c; i++) {
    seed = (seed * 16807) % 2147483647;
    ctx.strokeStyle = "rgba(" + (seed % 3 ? "255,255,255" : "0,0,0") + "," + (seed % 8) / 115 + ")";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(c, c, i, 0, TAU);
    ctx.stroke();
  }
  for (const r of [0.32, 0.53, 0.74, 0.83, 0.965]) {
    ctx.lineWidth = r > 0.9 ? 3 : 1.4;
    ctx.strokeStyle = "#778084";
    ctx.beginPath();
    ctx.arc(c, c, c * r, 0, TAU);
    ctx.stroke();
  }
  for (let i = 0; i < 120; i++) {
    const a = (i * TAU) / 120,
      from = i % 10 === 0 ? 0.83 : i % 5 === 0 ? 0.875 : 0.91;
    ctx.strokeStyle = i % 30 === 0 ? "#ff7738" : "#b6b7ae";
    ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(c + c * from * Math.cos(a), c + c * from * Math.sin(a));
    ctx.lineTo(c + c * 0.937 * Math.cos(a), c + c * 0.937 * Math.sin(a));
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    ctx.fillStyle = "#c4c6c1";
    ctx.font = "20px monospace";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(c + c * 0.77 * Math.cos(a), c + c * 0.77 * Math.sin(a));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(String(i * 30).padStart(3, "0"), 0, 5);
    ctx.restore();
  }
  ctx.strokeStyle = "#c5c9c7";
  ctx.lineWidth = 2;
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.beginPath();
    ctx.moveTo(c + c * 0.12 * Math.cos(a), c + c * 0.12 * Math.sin(a));
    ctx.lineTo(c + c * 0.27 * Math.cos(a), c + c * 0.27 * Math.sin(a));
    ctx.stroke();
  }
  ctx.fillStyle = "#ec773c";
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#c7c9c3";
  ctx.textAlign = "center";
  ctx.font = "bold 32px Arial";
  ctx.fillText("HX–06", c, c * 1.41);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return new T.Mesh(
    new T.CircleGeometry(radius, 96),
    new T.MeshStandardMaterial({ map, roughness: 0.69, metalness: 0.13, envMapIntensity: 0.58 }),
  );
}
export function makePlates(g: Geometry) {
  const { base: baseAnchors, top: topAnchors } = anchors(g);
  const base = new Batch(),
    top = new Batch();
  const R = g.baseRadius + 0.072,
    r = g.topRadius + 0.043;
  base.add(plate(R - 0.007, -0.046, 0.015, 0, 0.002, true), graphite, "coated");
  base.add(plate(R, -0.031, 0.061, 0, 0.0035, true), graphite, "coated");
  base.add(plate(R - 0.002, 0.027, 0.008, 0, 0.001, true), "#717b7e", "machined");
  // Socket-head screws, adjustable feet, elastomer isolators, and clevis pin bearings.
  for (let i = 0; i < 6; i++) {
    const a = (TAU * i) / 6,
      p = polar(R * 0.83, a, -0.061);
    base.cylinder(0.042, 0.022, p, seal, "rubber");
    base.cylinder(0.035, 0.009, p.clone().add(vec(0, 0, 0.012)), alloy, "machined");
    base.cylinder(0.022, 0.013, p.clone().add(vec(0, 0, 0.021)), iron, "machined", 6);
    base.bolt(polar(R * 0.88, a, 0.035), 0.009);
    for (const offset of [-0.15, 0.15]) base.bolt(polar(R * 0.84, a + offset, 0.035), 0.0048);
    const b = baseAnchors[i],
      az = Math.atan2(b.y, b.x),
      t = vec(-Math.sin(az), Math.cos(az));
    base.cylinder(0.04, 0.009, vec(b.x, b.y, 0.038), graphite, "machined", 32);
    for (const sign of [-1, 1]) {
      const at = b.clone().addScaledVector(t, sign * 0.023);
      base.box(0.045, 0.012, 0.036, at.clone().setZ(0.058), graphite, "coated", az);
      base.rod(
        at.clone().addScaledVector(t, -0.007),
        at.clone().addScaledVector(t, 0.007),
        0.021,
        iron,
        "machined",
        32,
      );
    }
    base.rod(
      b.clone().addScaledVector(t, -0.035),
      b.clone().addScaledVector(t, 0.035),
      0.0128,
      bright,
      "polished",
    );
    base.rod(
      b.clone().addScaledVector(t, -0.04),
      b.clone().addScaledVector(t, -0.034),
      0.009,
      iron,
      "machined",
      6,
    );
    const box = actuatorMount(b).cableSocket.setZ(0.06);
    base.box(0.085, 0.038, 0.047, box, graphite, "coated", az + 0.1);
    for (let j = -2; j <= 2; j++) {
      const fin = box
        .clone()
        .addScaledVector(vec(Math.cos(az + 0.1), Math.sin(az + 0.1)), j * 0.012);
      fin.z += 0.023;
      base.box(0.005, 0.031, 0.008, fin, iron, "machined", az + 0.1);
    }
    const g0 = baseAnchors[i].clone().multiplyScalar(0.82).setZ(0.05);
    const g1 = polar(g.baseRadius * 0.88, az + 0.2, 0.05);
    base.hose(
      [g0, g0.clone().add(vec(0, 0, 0.035)), g1.clone().add(vec(0, 0, 0.016)), box],
      0.0045,
      seal,
    );
  }
  top.add(plate(r - 0.004, -0.016, 0.01, Math.PI / 6, 0.0018), graphite, "coated");
  top.add(plate(r, -0.006, 0.025, Math.PI / 6, 0.0021), alloy);
  top.add(plate(r - 0.003, 0.017, 0.005, Math.PI / 6, 0.0008), "#9a9d98", "coated");
  const disc = r * 0.65;
  for (const ratio of [1.06, 1.015]) top.torus(disc * ratio, 0.0008, vec(0, 0, 0.0221), iron);
  for (let i = 0; i < 6; i++) {
    const a = (TAU * i) / 6 + Math.PI / 6;
    const a0 = topAnchors[i];
    top.cylinder(0.03, 0.012, a0.clone().setZ(-0.016), iron, "machined", 32);
    const az = Math.atan2(a0.y, a0.x),
      tangent = vec(-Math.sin(az), Math.cos(az));
    for (const sign of [-1, 1]) {
      const seat = a0.clone().addScaledVector(tangent, 0.02 * sign);
      top.box(0.034, 0.008, 0.023, seat.clone().setZ(-0.014), graphite, "coated", az);
      top.rod(
        seat.clone().addScaledVector(tangent, -0.005),
        seat.clone().addScaledVector(tangent, 0.005),
        0.012,
        alloy,
        "machined",
        20,
      );
    }
    // The through-pin is clamped in the platen clevis; the spherical rod
    // bearing can swing around the pin without turning it with the piston.
    top.rod(
      a0.clone().addScaledVector(tangent, -0.027),
      a0.clone().addScaledVector(tangent, 0.027),
      0.0105, bright, "polished", 18,
    );
    for (const side of [-1, 1]) {
      const p = polar(r * 0.8, a + side * 0.11, 0.0219);
      top.bolt(p, 0.0058);
    }
    // Recessed threaded ports around the outer work face.
    const port = polar(r * 0.82, a, 0.0221);
    top.cylinder(0.009, 0.0006, port, iron, "machined", 24);
    top.cylinder(0.0068, 0.0007, port.clone().setZ(0.0225), inset, "rubber", 20);
    const smaller = polar(r * 0.76, a + Math.PI / 6, 0.0221);
    top.cylinder(0.006, 0.0006, smaller, graphite, "machined", 24);
  }
  const lower = base.finish("fixed base assembly"),
    upper = top.finish("moving platen assembly");
  const face = rotaryFace(disc);
  face.position.z = 0.0223;
  face.receiveShadow = true;
  upper.add(face);
  const basePlate = makeLabel("HX–06", 0.148, 0.028, true);
  const faceAngle = -Math.PI / 2;
  basePlate.position.copy(polar(R * Math.cos(Math.PI / 6) + 0.0041, faceAngle, -0.002));
  basePlate.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(vec(1, 0, 0), vec(0, 0, 1), vec(0, -1, 0)),
  );
  lower.add(basePlate);
  const warning = makeLabel("S6 · 240", 0.089, 0.016);
  warning.rotation.z = 0.05;
  warning.position.copy(polar(r * 0.772, -Math.PI / 2, 0.0225));
  upper.add(warning);
  return { lower, upper };
}

export function makeLeg(index: number, geometry: Geometry) {
  // The local actuator axis is +Y in the scene, +Z while machining its parts.
  const rigid = new Batch(),
    rodEnd = new Batch();
  rigid.add(new T.SphereGeometry(0.019, 24, 16), alloy, "polished");
  rigid.cylinder(0.018, 0.037, vec(0, 0, 0.028), bright, "polished");
  rigid.cylinder(0.032, 0.026, vec(0, 0, 0.054), graphite, "coated", 24);
  rigid.cylinder(0.031, 0.151, vec(0, 0, 0.143), "#b2b4a9", "coated", 32);
  rigid.cylinder(0.033, 0.013, vec(0, 0, 0.07), iron, "machined", 24);
  rigid.cylinder(0.033, 0.023, vec(0, 0, 0.226), graphite, "coated", 32);
  rigid.cylinder(0.031, 0.012, vec(0, 0, 0.243), orange, "coated", 36);
  rigid.cylinder(0.029, 0.014, vec(0, 0, 0.253), bright, "polished", 32, 0.024);
  rigid.cylinder(0.021, 0.004, vec(0, 0, 0.262), seal, "rubber");
  rigid.cylinder(0.019, 0.074, vec(0, 0, 0.299), alloy, "machined");
  rigid.cylinder(0.02, 0.011, vec(0, 0, 0.337), iron, "machined", 24);
  rigid.cylinder(0.016, 0.003, vec(0, 0, 0.344), seal, "rubber");
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI / 4;
    rigid.rod(polar(0.029, a, 0.073), polar(0.029, a, 0.225), 0.0032, bright, "polished", 10);
    rigid.cylinder(0.005, 0.006, polar(0.029, a, 0.234), alloy, "machined", 6);
  }
  const a = -Math.PI / 2,
    off = (r: number, h: number) => polar(r, a, h);
  rigid.box(0.022, 0.009, 0.081, off(0.03, 0.145), iron, "coated");
  // The encoder connector and its relief ribs travel with the fixed barrel.
  rigid.rod(off(0.029, 0.092), off(0.05, 0.092), 0.0085, iron, "machined", 6);
  rigid.rod(off(0.048, 0.092), off(0.055, 0.092), 0.007, seal, "rubber");
  rigid.hose(
    [off(0.055, 0.092), off(0.06, 0.088), off(0.06, 0.067), off(0.057, 0.038), off(0.052, 0.014)],
    0.0046,
    orange,
    "coated",
  );
  for (let i = 0; i < 6; i++)
    rigid.box(0.016, 0.0015, 0.0018, off(0.035, 0.12 + i * 0.007), ceramic, "coated");
  // Offset servo body, gearbox, and heat-sink fins are rigidly fastened to the sleeve.
  rigid.box(0.043, 0.067, 0.031, vec(0, 0.022, 0.06), iron, "machined");
  rigid.cylinder(0.019, 0.09, vec(0, 0.044, 0.117), graphite, "coated", 12);
  rigid.cylinder(0.022, 0.012, vec(0, 0.044, 0.165), iron, "machined", 16);
  for (let j = 0; j < 8; j++) {
    const a = (j * TAU) / 8;
    rigid.box(
      0.004,
      0.006,
      0.067,
      vec(0.019 * Math.cos(a), 0.044 + 0.019 * Math.sin(a), 0.119),
      inset,
      "coated",
      a,
    );
  }
  rigid.cylinder(0.023, 0.008, vec(0, 0.044, 0.07), orange, "coated", 20);
  const sleeve = rigid.finish("servo housing");
  const { barrel, rod } = actuatorDimensions(geometry.maxLength);
  sleeve.scale.z = barrel / 0.345;
  sleeve.rotation.x = -Math.PI / 2;
  rodEnd.cylinder(0.018, 0.027, vec(0, 0, -0.025), graphite, "coated", 20);
  rodEnd.cylinder(0.017, 0.007, vec(0, 0, -0.041), bright, "polished", 6);
  rodEnd.add(new T.SphereGeometry(0.02, 24, 16), graphite, "machined");
  const end = rodEnd.finish("rod bearing");
  end.rotation.x = -Math.PI / 2;
  const upper = new T.Group();
  upper.name = "upper";
  upper.add(end);
  const piston = new T.Mesh(
    new T.CylinderGeometry(0.013, 0.013, rod, 28),
    new T.MeshStandardMaterial({ color: "#dce2e3", metalness: 1, roughness: 0.14 }),
  );
  piston.name = "shaft";
  piston.castShadow = true;
  piston.receiveShadow = true;
  const leg = new T.Group();
  leg.name = "Actuator " + (index + 1);
  leg.userData.actuator = index;
  leg.add(sleeve, piston, upper);
  return Object.assign(leg, { sleeve, piston, upper });
}

/** Pose all moving parts from the two measured joint centers, including
 * legacy recordings that have no orientation or contain free sleeve roll. */
export function positionActuator(
  leg: ReturnType<typeof makeLeg>,
  base: T.Vector3,
  top: T.Vector3,
  neutralMount: T.Quaternion,
  foundation: T.Quaternion,
  rodLength: number,
) {
  const direction = top.clone().sub(base);
  const length = direction.length();
  direction.normalize();
  leg.position.copy(base);
  leg.quaternion.copy(actuatorOrientation(neutralMount, foundation, direction));
  leg.piston.position.y = length - rodLength / 2;
  leg.upper.position.y = length;
  return direction;
}

export function makeInstrumentFloor() {
  const plane = new T.PlaneGeometry(44, 44);
  const floor = new T.Mesh(
    plane,
    new T.ShaderMaterial({
      uniforms: { showGrid: { value: 1 } },
      vertexShader: `varying vec2 ground;void main(){ground=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 ground; uniform float showGrid;
      float grid(vec2 p){vec2 w=max(fwidth(p),vec2(.0001));vec2 d=abs(fract(p-.5)-.5)/w;return 1.-min(1.,min(d.x,d.y));}
      void main(){float r=length(ground);float fade=1.-smoothstep(.7,2.7,r);float shade=exp(-dot(ground*vec2(1.52,1.48),ground*vec2(1.52,1.48)));
      vec3 c=mix(vec3(.883,.895,.894),vec3(.810,.832,.829),shade*.46);
      c-=vec3(grid(ground*10.)*.048+grid(ground*2.)*.038)*fade*showGrid;
      float lw=max(fwidth(r),.0005);
      float ring=(1.-smoothstep(lw*.3,lw*1.2,abs(r-.57)))*.13;
      float angle=atan(ground.y,ground.x);
      float ticks=(1.-smoothstep(.12,.27,abs(fract(angle*60./6.2831853+.5)-.5)))*step(.565,r)*step(r,.58);
      c-=vec3((ring+ticks*.10)*fade*showGrid);
      gl_FragColor=vec4(c,1.);}`,
      toneMapped: false,
    }),
  );
  floor.position.z = -0.0731;
  return floor;
}

export function makeContactShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(30,38,40,.24)");
  grad.addColorStop(0.58, "rgba(30,38,40,.19)");
  grad.addColorStop(1, "rgba(30,38,40,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(
    new T.PlaneGeometry(1.28, 1.12),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  m.position.z = -0.0726;
  return m;
}

// Use the same dimensional model for visual geometry and fixture contact shapes.
function buildFixture(id: string, b: Batch) {
  const foot = vec(0, 0, 0.029);
  if (["flight", "driving", "rail", "cinema"].includes(id)) {
    b.cylinder(0.091, 0.014, foot, iron, "machined", 36);
    b.box(0.158, 0.15, 0.022, vec(0, -0.005, 0.06), graphite, "coated");
    b.box(0.128, 0.115, 0.022, vec(0, -0.001, 0.079), id === "cinema" ? "#aa4527" : seal, "rubber");
    b.add(
      new T.BoxGeometry(0.143, 0.023, 0.122),
      graphite,
      "coated",
      vec(0, 0.059, 0.128),
      new T.Euler(-0.16, 0, 0),
    );
    b.add(
      new T.BoxGeometry(0.115, 0.025, 0.101),
      ceramic,
      "rubber",
      vec(0, 0.048, 0.132),
      new T.Euler(-0.16, 0, 0),
    );
    b.box(0.065, 0.032, 0.035, vec(0, 0.069, 0.199), inset, "rubber");
    if (id === "flight") {
      b.rod(vec(0.058, -0.055, 0.07), vec(0.052, -0.058, 0.128), 0.006, iron);
      b.add(new T.SphereGeometry(0.01, 12, 10), seal, "rubber", vec(0.052, -0.058, 0.13));
    }
    if (id === "driving") {
      b.rod(vec(0, -0.069, 0.06), vec(0, -0.09, 0.136), 0.008, graphite);
      b.add(
        new T.TorusGeometry(0.035, 0.005, 8, 40),
        seal,
        "rubber",
        vec(0, -0.092, 0.145),
        new T.Euler(1.13, 0, 0),
      );
    } else if (id === "rail") {
      b.box(0.157, 0.05, 0.052, vec(0, -0.105, 0.062), graphite, "coated");
      b.add(
        new T.BoxGeometry(0.091, 0.03, 0.004),
        "#233b3b",
        "polished",
        vec(-0.015, -0.104, 0.09),
        new T.Euler(-0.12, 0, 0),
      );
      b.rod(vec(0.06, -0.104, 0.086), vec(0.055, -0.118, 0.115), 0.004, bright);
      b.box(0.02, 0.01, 0.01, vec(0.055, -0.118, 0.115), orange, "coated");
    }
  } else if (id === "marine") {
    b.cylinder(0.074, 0.021, foot, iron);
    for (const x of [-0.048, 0.048])
      b.box(0.011, 0.041, 0.079, vec(x, 0, 0.081), graphite, "coated");
    b.add(new T.SphereGeometry(0.047, 32, 24), ceramic, "coated", vec(0, 0, 0.1));
    b.rod(vec(0, -0.035, 0.1), vec(0, -0.069, 0.1), 0.026, graphite);
    b.rod(vec(0, -0.067, 0.1), vec(0, -0.071, 0.1), 0.018, "#193642", "polished");
  } else if (id === "camera") {
    b.box(0.124, 0.089, 0.014, foot, iron);
    b.box(0.104, 0.055, 0.067, vec(0, 0, 0.068), graphite, "coated");
    b.box(0.027, 0.067, 0.065, vec(0.054, 0, 0.067), inset, "rubber");
    b.box(0.029, 0.027, 0.014, vec(-0.018, 0, 0.109), iron);
    b.rod(vec(-0.017, -0.025, 0.069), vec(-0.017, -0.071, 0.069), 0.026, iron);
    b.rod(vec(-0.017, -0.059, 0.069), vec(-0.017, -0.076, 0.069), 0.029, seal, "rubber");
    b.rod(vec(-0.017, -0.076, 0.069), vec(-0.017, -0.077, 0.069), 0.022, "#153840", "polished");
  } else if (id === "optics") {
    b.cylinder(0.077, 0.019, foot, graphite);
    for (let i = 0; i < 3; i++)
      b.rod(polar(0.065, (i * TAU) / 3, 0.04), polar(0.095, (i * TAU) / 3, 0.1), 0.007, bright);
    const profile = [
      new T.Vector2(0, 0),
      new T.Vector2(0.045, 0.004),
      new T.Vector2(0.086, 0.017),
      new T.Vector2(0.12, 0.037),
      new T.Vector2(0.12, 0.043),
      new T.Vector2(0.085, 0.022),
      new T.Vector2(0.045, 0.01),
      new T.Vector2(0, 0.006),
    ];
    b.add(
      new T.LatheGeometry(profile, 80).rotateX(Math.PI / 2),
      bright,
      "polished",
      vec(0, 0, 0.077),
    );
  } else if (id === "docking") {
    b.cylinder(0.115, 0.017, foot, graphite);
    for (let i = 0; i < 6; i++) {
      const a = (TAU * i) / 6;
      b.rod(polar(0.095, a, 0.04), polar(0.093, a + 0.2, 0.106), 0.008, bright);
      b.box(0.02, 0.025, 0.036, polar(0.088, a, 0.117), orange, "coated", a);
    }
    b.torus(0.09, 0.012, vec(0, 0, 0.102), alloy);
  } else if (id === "balance") {
    b.box(0.23, 0.19, 0.009, foot, iron, "coated");
    for (const x of [-0.057, 0.057]) {
      b.add(
        new T.CapsuleGeometry(0.024, 0.068, 6, 16).scale(1, 1, 0.06),
        ceramic,
        "rubber",
        vec(x, 0, 0.035),
      );
    }
  } else if (id === "machining") {
    b.cylinder(0.092, 0.012, foot, iron, "machined", 6);
    b.cylinder(0.058, 0.047, vec(0, 0, 0.058), bright, "machined", 56);
    b.cylinder(0.033, 0.0008, vec(0, 0, 0.0817), graphite, "rubber", 32);
    for (let i = 0; i < 8; i++) b.bolt(polar(0.046, (i * TAU) / 8, 0.082), 0.0038);
  } else if (id === "photonics") {
    b.box(0.202, 0.137, 0.012, foot, graphite);
    for (let i = 0; i < 2; i++) {
      const x = (i - 0.5) * 0.106;
      b.box(0.052, 0.056, 0.048, vec(x, 0, 0.06), alloy);
      b.rod(vec(x * 0.98, 0, 0.078), vec(x * 0.22, 0, 0.078), 0.011, bright);
      b.cylinder(0.012, 0.011, vec(x, 0.017, 0.089), graphite);
    }
    b.rod(vec(-0.018, 0, 0.078), vec(0.018, 0, 0.078), 0.0012, orange, "coated");
  } else if (id === "seismic" || id === "vibration") {
    b.box(0.225, 0.142, 0.013, foot, graphite);
    for (const y of [-0.05, 0.05]) {
      b.rod(vec(-0.103, y, 0.042), vec(0.103, y, 0.042), 0.004, bright, "polished");
      for (const x of [-0.105, 0.105]) b.box(0.012, 0.018, 0.019, vec(x, y, 0.038), iron);
    }
  }
}

function buildMovingSpecimen(id: string, b: Batch) {
  if (id === "seismic" || id === "vibration") {
    for (const y of [-0.05, 0.05]) b.box(0.049, 0.014, 0.012, vec(0, y, 0.046), graphite, "coated");
  }
  if (id === "seismic") {
    for (let j = 0; j < 4; j++) {
      const z = 0.055 + j * 0.052;
      b.box(0.128, 0.11, 0.008, vec(0, 0, z), alloy);
      if (j < 3)
        for (const x of [-0.054, 0.054])
          for (const y of [-0.045, 0.045]) b.box(0.008, 0.009, 0.052, vec(x, y, z + 0.026), iron);
    }
  } else if (id === "vibration") {
    b.box(0.142, 0.118, 0.01, vec(0, 0, 0.056), iron);
    b.box(0.112, 0.073, 0.08, vec(0, 0, 0.101), ceramic, "coated");
    for (const x of [-0.048, 0.048])
      for (const y of [-0.031, 0.031]) b.bolt(vec(x, y, 0.141), 0.004);
    for (let i = 0; i < 6; i++)
      b.box(0.006, 0.056, 0.013, vec(-0.035 + i * 0.014, 0, 0.147), graphite);
  }
}

export function makeFixture(id: string) {
  const batch = new Batch();
  buildFixture(id, batch);
  const fixture = batch.finish("Application fixture · " + id);
  if (id === "seismic" || id === "vibration") {
    const moving = new Batch();
    buildMovingSpecimen(id, moving);
    fixture.add(moving.finish("moving-specimen"));
  }
  return fixture;
}

export function fixtureCollisionParts(
  id: string,
  part: "all" | "fixed" | "moving" = "all",
): Float32Array[] {
  const parts: Float32Array[] = [];
  if (part !== "moving") buildFixture(id, new Batch(parts));
  if (part !== "fixed") buildMovingSpecimen(id, new Batch(parts));
  return parts;
}
