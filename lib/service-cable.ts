import * as T from "three";

/** Visually deforms the electrical lead between two strain reliefs, without adding a load to the actuator. */
export class ServiceCable extends T.Mesh<T.BufferGeometry, T.MeshStandardMaterial> {
  private sections = 18;
  private sides = 7;
  private p = new T.Vector3();
  private tangent = new T.Vector3();
  private n = new T.Vector3();
  private b = new T.Vector3();
  private basisUp = new T.Vector3(0, 0, 1);
  private bend = new T.CubicBezierCurve3();
  private first = new T.Vector3(NaN, NaN, NaN);
  private last = new T.Vector3(NaN, NaN, NaN);
  constructor() {
    const geometry = new T.BufferGeometry();
    const material = new T.MeshStandardMaterial({
      color: "#ee5b18",
      metalness: 0.2,
      roughness: 0.49,
    });
    super(geometry, material);
    const vertices = (this.sections + 1) * this.sides;
    geometry.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(T.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "normal",
      new T.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(T.DynamicDrawUsage),
    );
    const indices = [];
    for (let i = 0; i < this.sections; i++)
      for (let j = 0; j < this.sides; j++) {
        const a = i * this.sides + j,
          b = i * this.sides + ((j + 1) % this.sides);
        indices.push(a, b, a + this.sides, b, b + this.sides, a + this.sides);
      }
    geometry.setIndex(indices);
    this.frustumCulled = false;
    this.castShadow = true;
  }
  updateAnchors(start: T.Vector3, end: T.Vector3) {
    if (this.first.distanceToSquared(start) < 1e-10 && this.last.distanceToSquared(end) < 1e-10)
      return;
    this.first.copy(start);
    this.last.copy(end);
    const curve = this.bend;
    curve.v0.copy(start);
    curve.v3.copy(end);
    curve.v1.copy(start).multiplyScalar(1.16);
    curve.v1.z = start.z - 0.049;
    curve.v2.copy(end).multiplyScalar(1.17);
    curve.v2.z = end.z + 0.042;
    const pos = this.geometry.getAttribute("position"),
      norm = this.geometry.getAttribute("normal");
    for (let i = 0; i <= this.sections; i++) {
      const t = i / this.sections;
      curve.getPoint(t, this.p);
      curve.getTangent(t, this.tangent);
      this.n.crossVectors(this.tangent, this.basisUp);
      if (this.n.lengthSq() < 0.00001) this.n.set(1, 0, 0);
      this.n.normalize();
      this.b.crossVectors(this.tangent, this.n).normalize();
      for (let j = 0; j < this.sides; j++) {
        const a = (j * 2 * Math.PI) / this.sides,
          c = Math.cos(a),
          s = Math.sin(a);
        const x = this.n.x * c + this.b.x * s,
          y = this.n.y * c + this.b.y * s,
          z = this.n.z * c + this.b.z * s;
        const k = i * this.sides + j,
          r = 0.0054;
        pos.setXYZ(k, this.p.x + r * x, this.p.y + r * y, this.p.z + r * z);
        norm.setXYZ(k, x, y, z);
      }
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
  }
}
