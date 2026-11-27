import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { anchors, DEFAULT_GEOMETRY, HOME } from "../kinematics";
import type { WorldFrame } from "./types";

const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
type Finish = "paint" | "metal" | "glass" | "dark";
const snow = "#e0e1d4",
  navy = "#153747",
  steel = "#99a3a0",
  amber = "#e99a33",
  dark = "#243238",
  red = "#b43c2a";

class Metalwork {
  parts = new Map<Finish, T.BufferGeometry[]>();
  add(g: T.BufferGeometry, color: string, f: Finish = "paint") {
    if (g.index) {
      const old = g;
      g = g.toNonIndexed();
      old.dispose();
    }
    for (const key of Object.keys(g.attributes))
      if (!["position", "normal"].includes(key)) g.deleteAttribute(key);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const n = g.getAttribute("position").count,
      c = new T.Color(color),
      colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[3 * i] = c.r;
      colors[3 * i + 1] = c.g;
      colors[3 * i + 2] = c.b;
    }
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    const pile = this.parts.get(f) ?? [];
    pile.push(g);
    this.parts.set(f, pile);
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    f: Finish = "paint",
    angle = 0,
  ) {
    this.add(new T.BoxGeometry(w, h, d).rotateZ(angle).translate(x, y, z), c, f);
  }
  rod(a: T.Vector3, b: T.Vector3, r: number, c: string, f: Finish = "metal", n = 7, rTop = r) {
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 0.000001) return;
    const q = new T.Quaternion().setFromUnitVectors(v(0, 1, 0), dir.clone().normalize());
    const middle = a.clone().lerp(b, 0.5);
    this.add(
      new T.CylinderGeometry(rTop, r, dir.length(), n)
        .applyQuaternion(q)
        .translate(middle.x, middle.y, middle.z),
      c,
      f,
    );
  }
  sphere(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: string,
    f: Finish = "paint",
  ) {
    this.add(new T.SphereGeometry(1, 20, 12).scale(sx, sy, sz).translate(x, y, z), c, f);
  }
  panel(
    a: T.Vector3,
    b: T.Vector3,
    c: T.Vector3,
    d: T.Vector3,
    tint: string,
    finish: Finish = "paint",
  ) {
    const geo = new T.BufferGeometry().setFromPoints([a, b, d, b, c, d]);
    geo.computeVertexNormals();
    this.add(geo, tint, finish);
  }
  finish() {
    const group = new T.Group();
    for (const [name, pile] of this.parts) {
      const g = mergeGeometries(pile)!;
      pile.forEach((a) => a.dispose());
      const mat = new T.MeshStandardMaterial({
        vertexColors: true,
        side: T.DoubleSide,
        metalness: name === "metal" ? 0.56 : name === "glass" ? 0.57 : 0.12,
        roughness: name === "metal" ? 0.34 : name === "glass" ? 0.13 : name === "dark" ? 0.8 : 0.52,
        envMapIntensity: name === "glass" ? 1.1 : 0.65,
      });
      if (name === "paint") {
        // Weathering follows welded plate coordinates, so it stays attached as the vessel rolls.
        mat.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 fitPos;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nfitPos=position;");
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `#include <common>
            varying vec3 fitPos;
            float saltRand(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
            float saltNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
              return mix(mix(saltRand(i),saltRand(i+vec2(1.,0.)),f.x),mix(saltRand(i+vec2(0.,1.)),saltRand(i+vec2(1.)),f.x),f.y);}`,
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            vec2 panelUv=vec2(fitPos.x+fitPos.z*.31,fitPos.y);
            float coarse=saltNoise(panelUv*vec2(.45,1.1));
            float streak=saltNoise(panelUv*vec2(6.9,.44))*.67+saltNoise(panelUv*vec2(14.1,.57))*.33;
            float plating=1.-smoothstep(.0005,.012,abs(fract(panelUv.x/3.84+floor(fitPos.y/.95)*.19)-.5));
            float hull=1.-smoothstep(2.9,3.8,fitPos.y);
            float damp=(1.-smoothstep(-.16,.87,fitPos.y))*(.6+.4*coarse);
            diffuseColor.rgb*=1.-.13*(1.-coarse)-.12*streak-.085*plating*hull-.18*damp;
            diffuseColor.rgb+=hull*vec3(.035,.010,.003)*smoothstep(.49,.85,streak)*smoothstep(-.2,.75,fitPos.y);
            float seamOcclusion=.0;
            if(abs(fitPos.x-3.2)<7.4&&abs(fitPos.z)>2.9){
              seamOcclusion=max(exp(-abs(fitPos.y-5.65)*3.1),exp(-abs(fitPos.y-7.45)*3.2));
            }
            diffuseColor.rgb*=1.-.20*seamOcclusion;
          `,
          );
        };
      }
      if (name === "glass") {
        // A cool band of skylight crosses the raked bridge glazing. The warm strip at
        // the bottom is the navigation console visible through the polarised glass.
        mat.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 panePosition;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\npanePosition=position;");
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 panePosition;")
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
            float bridge=smoothstep(8.12,8.28,panePosition.y);
            float horizon=smoothstep(8.32,9.42,panePosition.y+.10*sin(panePosition.x*1.62));
            vec3 glazing=mix(vec3(.010,.026,.035),vec3(.047,.083,.102),horizon);
            totalEmissiveRadiance+=bridge*glazing;
            totalEmissiveRadiance+=bridge*vec3(.045,.031,.015)*exp(-abs(panePosition.y-8.34)*22.);
          `,
            );
        };
      }
      const m = new T.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
}

// Hull offsets by station, stern to stem. Cross sections flare progressively towards the deck.
const stations = [
  [-22, 3.5],
  [-21, 4.25],
  [-18, 4.65],
  [-11, 4.9],
  [0, 4.92],
  [7, 4.81],
  [12, 4.35],
  [17, 3.1],
  [20, 1.82],
  [22, 0.84],
  [23, 0.17],
];
const sections = [
  [-3.35, 0.055],
  [-3.05, 0.55],
  [-2.5, 0.78],
  [-1.65, 0.9],
  [-0.36, 0.96],
  [-0.13, 0.97],
  [0.1, 0.977],
  [1.22, 0.985],
  [2.4, 1],
  [2.55, 1.006],
  [2.67, 1.009],
  [3.05, 1.013],
];
function widthAt(x: number) {
  for (let i = 1; i < stations.length; i++) {
    if (x <= stations[i][0]) {
      const [x0, z0] = stations[i - 1],
        [x1, z1] = stations[i],
        t = T.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1);
      return T.MathUtils.lerp(z0, z1, t);
    }
  }
  return 0.17;
}
const sheer = (x: number) => Math.max(0, x - 7) ** 1.62 * 0.019 + Math.max(-x - 14, 0) * 0.035;
function edge(x: number, y: number, widthRatio: number, side: number) {
  const fore = T.MathUtils.smoothstep(x, 12, 23),
    aft = 1 - T.MathUtils.smoothstep(x, -22, -15);
  const yc = (y + 3.35) / 6.4;
  return v(
    x + 0.98 * (yc - 0.5) * fore * 3.0 + aft * (1 - yc) * 1.1,
    y + sheer(x) * yc,
    widthAt(x) * widthRatio * side,
  );
}
function hull(b: Metalwork) {
  for (const sign of [-1, 1]) {
    // Smooth loft normals across station breaks while retaining each paint band's sharp edge.
    for (let j = 1; j < sections.length; j++) {
      const coords: number[] = [],
        idx: number[] = [];
      for (let i = 0; i < stations.length; i++) {
        const x = stations[i][0];
        for (const k of [j - 1, j])
          coords.push(...edge(x, sections[k][0], sections[k][1], sign).toArray());
        if (i) {
          const l = 2 * i;
          idx.push(l - 2, l, l - 1, l, l + 1, l - 1);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(coords, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      b.add(g, j <= 4 ? "#963c32" : j <= 6 ? "#303d40" : j === 10 ? "#d58237" : navy);
    }
  }
  for (let i = 1; i < stations.length; i++) {
    const x0 = stations[i - 1][0],
      x1 = stations[i][0];
    b.panel(
      edge(x0, 3.05, 1.013, -1),
      edge(x0, 3.05, 1.013, 1),
      edge(x1, 3.05, 1.013, 1),
      edge(x1, 3.05, 1.013, -1),
      "#6a756e",
    );
  }
  for (const x of [-22, 23])
    for (let i = 1; i < sections.length; i++) {
      const [y0, q0] = sections[i - 1],
        [y1, q1] = sections[i];
      b.panel(
        edge(x, y0, q0, -1),
        edge(x, y0, q0, 1),
        edge(x, y1, q1, 1),
        edge(x, y1, q1, -1),
        i <= 4 ? red : navy,
      );
    }
  // Working-deck non-slip surface and mooring fittings.
  b.box(-12.5, 3.095, 0, 14.4, 0.07, 7.55, "#565c55");
  for (let i = 0; i < 15; i++) b.box(-19.3 + i, 3.14, 0, 0.025, 0.018, 7.3, "#bec1ae");
  for (const s of [-1, 1]) {
    for (const x of [-18, -8, 1, 11, 16]) {
      const z = widthAt(x) * s * 0.83,
        y = 3.12 + sheer(x);
      b.box(x, y, z, 1.45, 0.14, 0.56, "#394245");
      for (const offset of [-0.45, 0.45])
        b.rod(v(x + offset, y, z), v(x + offset, y + 0.46, z), 0.14, steel);
    }
    // Welded stanchions follow the sheer, two intermediate wires and a cap rail.
    const railline = [
      -21.4, -20, -17.6, -15.2, -12.8, -10.4, -8, -5.6, -3.2, -0.8, 1.6, 4, 6.4, 8.8, 11.2, 13.6,
      16, 18.4, 20.5, 22.3, 23,
    ];
    const rail = (x: number, h: number) => {
      const p = edge(x, 3.05, 1.006, s);
      p.y += h;
      return p;
    };
    railline.forEach((x, i) => {
      b.rod(rail(x, 0), rail(x, 1.02), 0.047, snow);
      if (i)
        for (const h of [0.39, 0.71, 1.02])
          b.rod(rail(railline[i - 1], h), rail(x, h), h === 1.02 ? 0.045 : 0.026, snow);
    });
    for (let i = 0; i < 8; i++) {
      const x = -12 + i * 2.5,
        z = widthAt(x) * s * 0.99;
      b.rod(
        v(x, 1.95 + sheer(x) * 0.75, z),
        v(x, 1.95 + sheer(x) * 0.75, z + s * 0.08),
        0.25,
        steel,
      );
      b.rod(
        v(x, 1.95 + sheer(x) * 0.75, z + s * 0.09),
        v(x, 1.95 + sheer(x) * 0.75, z + s * 0.11),
        0.18,
        dark,
      );
    }
    // Anchor hawse pocket and anchor shank near the stem.
    const ax = 17.8,
      az = widthAt(ax) * s;
    b.sphere(ax, 2.1 + sheer(ax), az, 0.5, 0.37, 0.16, "#223238");
    b.rod(
      v(ax, 2.28 + sheer(ax), az + 0.05 * s),
      v(ax - 0.42, 1.38 + sheer(ax), az + 0.07 * s),
      0.1,
      steel,
    );
  }
}
function tier(b: Metalwork, x0: number, x1: number, w: number, y0: number, y1: number) {
  b.box((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, w, snow);
  b.box((x0 + x1) / 2, y1, 0, x1 - x0 + 0.55, 0.22, w + 0.55, "#d2d1bb");
  for (const s of [-1, 1]) {
    const z = s * (w / 2 + 0.033);
    for (let x = x0 + 1.45; x < x1 - 1.1; x += 2.0) {
      b.box(x, y1 - 0.96, z, 1.17, 0.77, 0.07, "#57635d");
      b.box(x, y1 - 0.92, z + s * 0.05, 0.97, 0.58, 0.054, "#41585b", "glass");
    }
  }
}
function wheelhouse(b: Metalwork) {
  tier(b, -3.8, 10.6, 7.4, 3.02, 5.82);
  tier(b, -2.8, 9.3, 6.7, 5.82, 7.6);
  // Raked bridge windows wrap around the faceted navigation deck.
  const outline = [
    [-1.95, -3.4],
    [5.95, -3.6],
    [8.0, -2.4],
    [8.5, 0],
    [8.0, 2.4],
    [5.95, 3.6],
    [-1.95, 3.4],
    [-2.5, 2.65],
    [-2.5, -2.65],
  ];
  const at = (p: number[], y: number, scale: number) =>
    v((p[0] - 2.9) * scale + 2.9, y, p[1] * scale);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      c = outline[(i + 1) % outline.length];
    b.panel(at(a, 7.64, 0.98), at(c, 7.64, 0.98), at(c, 8.21, 1), at(a, 8.21, 1), snow);
    b.panel(
      at(a, 8.21, 1),
      at(c, 8.21, 1),
      at(c, 9.45, 1.055),
      at(a, 9.45, 1.055),
      "#324a4d",
      "glass",
    );
    const div = Math.max(1, Math.round(Math.hypot(a[0] - c[0], a[1] - c[1]) / 1.72));
    for (let n = 0; n < div; n++) {
      const k = n / div,
        pt = [T.MathUtils.lerp(a[0], c[0], k), T.MathUtils.lerp(a[1], c[1], k)];
      b.rod(at(pt, 8.19, 1.006), at(pt, 9.47, 1.061), 0.066, snow);
    }
    b.panel(at(a, 9.45, 1.105), at(c, 9.45, 1.105), at(c, 9.68, 1.105), at(a, 9.68, 1.105), snow);
    b.panel(at(a, 9.68, 1.105), at(c, 9.68, 1.105), v(3, 9.69, 0), v(3, 9.69, 0), "#d1d3be");
  }
  // Starboard and port companionways, ladders, liferaft canisters and rings.
  for (const s of [-1, 1]) {
    for (const x of [-2.9, 8.9]) {
      b.box(x, 4.4, 3.76 * s, 0.78, 2.25, 0.12, "#838f89");
      b.box(x, 4.66, 3.85 * s, 0.45, 0.57, 0.04, "#40575c", "glass");
      b.box(x + 0.21, 4.18, 3.86 * s, 0.14, 0.06, 0.07, steel);
    }
    for (const x of [-1.9, 1.5]) {
      b.rod(v(x - 0.66, 6.25, 3.83 * s), v(x + 0.66, 6.25, 3.83 * s), 0.32, "#eae8d4");
      for (const dx of [-0.47, 0.47])
        b.rod(v(x + dx - 0.04, 6.25, 3.83 * s), v(x + dx + 0.04, 6.25, 3.83 * s), 0.335, "#5a625c");
    }
    const ring = new T.TorusGeometry(0.31, 0.103, 9, 30).translate(5, 4.75, s * 3.81);
    b.add(ring, "#e35432");
    for (const x of [-4.35, 9.8]) {
      const z = 3.5 * s;
      b.rod(v(x, 3.19, z), v(x + 0.78, 5.83, z), 0.055, steel);
      b.rod(v(x, 3.19, z + 0.65 * s), v(x + 0.78, 5.83, z + 0.65 * s), 0.055, steel);
      for (let i = 0; i < 9; i++) {
        const r = i / 8;
        b.rod(
          v(x + r * 0.78, 3.25 + r * 2.52, z),
          v(x + r * 0.78, 3.25 + r * 2.52, z + 0.65 * s),
          0.055,
          steel,
        );
      }
    }
  }
  // Finned exhaust stack with soot collar and steel pipes.
  b.box(-4.4, 7.56, 0, 2.0, 5, 2.35, "#bd6b36", "paint", 0.12);
  b.box(-4.72, 9.92, 0, 2.08, 0.77, 2.39, "#303839", "dark", 0.12);
  for (const s of [-1, 1])
    for (let i = 0; i < 7; i++)
      b.box(-4.44, 7.62 + i * 0.21, s * 1.18, 1.55, 0.09, 0.06, "#513c32");
  for (const z of [-0.55, 0.55]) b.rod(v(-4.8, 9.99, z), v(-5.04, 10.72, z), 0.31, "#3c4140");
  // Galvanised tripod signal mast, shrouds, lights and radar array.
  for (const z of [-1.23, 1.23]) {
    b.rod(v(0.25, 9.65, z), v(2.3, 14.52, 0), 0.14, snow);
    b.rod(v(4.4, 9.65, z), v(2.3, 14.52, 0), 0.115, snow);
    b.rod(v(-0.65, 9.69, z), v(2.28, 15.72, 0), 0.024, "#545d57");
  }
  b.rod(v(2.3, 10.08, 0), v(2.3, 16.64, 0), 0.17, snow, "paint", 12, 0.076);
  b.rod(v(2.3, 14.38, -2.05), v(2.3, 14.38, 2.05), 0.078, snow);
  b.rod(v(2.3, 13.2, 0), v(2.3, 14.38, 1.85), 0.046, snow);
  b.rod(v(2.3, 13.2, 0), v(2.3, 14.38, -1.85), 0.046, snow);
  b.rod(v(2.3, 16.64, 0), v(2.3, 18.12, 0), 0.033, "#69716b");
  b.rod(v(2.3, 15.36, 0), v(2.3, 15.36, -1.2), 0.064, snow);
  b.rod(v(2.3, 14.85, -1.15), v(2.3, 16.12, -1.15), 0.049, snow);
  b.rod(v(4.9, 9.63, -1.24), v(4.9, 10.26, -1.24), 0.52, snow);
  b.sphere(4.9, 10.69, -1.24, 0.76, 0.76, 0.76, "#f0eada");
  for (const [z, c] of [
    [-2.05, "#d53229"],
    [2.05, "#3b9768"],
  ] as const)
    b.sphere(2.3, 14.5, z, 0.14, 0.18, 0.14, c);
  b.sphere(0.52, 9.98, 1.95, 0.37, 0.37, 0.37, snow);
}
function workingDeck(b: Metalwork) {
  // Open A-frame for lowering oceanographic instruments over the stern.
  for (const s of [-1, 1]) {
    const z = s * 3.4;
    b.box(-16, 3.36, z, 2.75, 0.42, 0.91, "#4d5d5d");
    b.rod(v(-15.8, 3.43, z), v(-18.8, 8.66, z * 0.83), 0.42, amber, "paint", 12, 0.3);
    b.rod(v(-18.4, 3.43, z), v(-17.2, 6.18, z * 0.9), 0.246, "#d49546");
    b.rod(v(-17.22, 6.12, z * 0.9), v(-17.55, 6.79, z * 0.89), 0.145, steel);
    b.rod(v(-15.8, 3.7, z - 0.55), v(-15.8, 3.7, z + 0.55), 0.4, "#4d5d5a");
    b.rod(v(-18.55, 8.38, z * 0.83), v(-17.12, 8.38, z * 0.83), 0.086, "#d6b078");
  }
  b.rod(v(-18.8, 8.66, -2.87), v(-18.8, 8.66, 2.87), 0.37, amber, "paint", 12);
  b.rod(v(-18.74, 8.4, 0), v(-18.74, 5.55, 0), 0.037, "#594f40");
  b.sphere(-18.74, 5.43, 0, 0.17, 0.3, 0.17, steel);
  // Ocean sampling rosette and restrained sampling bottles on aft work deck.
  const rx = -11.5,
    rz = 1.22;
  b.rod(v(rx, 3.16, rz), v(rx, 3.29, rz), 0.98, steel);
  b.rod(v(rx, 5.2, rz), v(rx, 5.29, rz), 0.92, steel);
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6,
      xx = rx + 0.73 * Math.cos(angle),
      zz = rz + 0.73 * Math.sin(angle);
    b.rod(v(xx, 3.32, zz), v(xx, 5.15, zz), 0.15, i % 3 === 0 ? amber : "#6c8487");
    b.rod(v(xx, 5.08, zz), v(xx, 5.22, zz), 0.162, "#3c504f");
  }
  b.box(-11.1, 3.47, -2.16, 3.8, 0.5, 2.08, "#586568");
  b.rod(v(-11.1, 4.3, -2.88), v(-11.1, 4.3, -1.28), 0.82, "#49575a");
  for (let i = 0; i < 11; i++)
    b.rod(v(-11.1, 4.3, -2.86 + i * 0.15), v(-11.1, 4.3, -2.82 + i * 0.15), 0.832, "#87948f");
  // Folded knuckle boom crane and hydraulic ram.
  b.rod(v(-6.8, 3.15, -2.2), v(-6.8, 4.75, -2.2), 0.68, amber);
  b.rod(v(-6.8, 4.75, -2.2), v(-8.52, 6.68, -2.2), 0.31, amber, "paint", 8);
  b.rod(v(-8.52, 6.68, -2.2), v(-13.2, 5.75, -2.2), 0.26, amber, "paint", 8, 0.18);
  b.rod(v(-6.85, 4.36, -1.94), v(-8.02, 6.23, -1.94), 0.14, steel);
  for (const s of [-1, 1]) {
    // Two forward capstans and hatches.
    b.rod(v(14.8, 3.5, s * 1.9), v(14.8, 4.26, s * 1.9), 0.35, "#526362");
    b.rod(v(14.8, 4.23, s * 1.9), v(14.8, 4.35, s * 1.9), 0.47, steel);
  }
  b.box(17.8, 3.95, 0, 2.1, 0.3, 1.45, "#a2aaa0");
}
function safetyTender(b: Metalwork) {
  // A rigid-inflatable rescue boat in its davit cradle, with sectional sponsons and outboard.
  const x = -5.8,
    y = 4.4,
    z = 3.38;
  for (const d of [-1.42, 1.25]) {
    b.box(x + d, 3.39, z, 0.48, 0.53, 2.15, "#405357");
    b.rod(v(x + d, 3.56, z - 1.05), v(x + d, 6.5, z - 0.95), 0.16, snow);
    b.rod(v(x + d, 6.5, z - 0.95), v(x + d, 6.8, z + 0.29), 0.14, snow);
    for (const side of [-1, 1])
      b.rod(v(x + d, 6.77, z + 0.29), v(x + d, 4.68, z + 0.72 * side), 0.026, "#5a6563");
  }
  b.sphere(x, y - 0.1, z, 2.86, 0.48, 1.0, "#334344", "dark");
  for (const s of [-1, 1]) {
    b.sphere(x - 0.19, y + 0.17, z + s * 0.76, 2.57, 0.33, 0.34, "#d14d26");
    b.rod(
      v(x + 1.79, y + 0.2, z + s * 0.72),
      v(x + 2.84, y + 0.42, z + s * 0.13),
      0.3,
      "#cb4921",
      "paint",
      12,
      0.18,
    );
    for (const offset of [-1.65, -0.53, 0.65, 1.65]) {
      b.rod(
        v(x + offset, y + 0.36, z + s * 0.82),
        v(x + offset, y + 0.37, z + s * 0.96),
        0.11,
        "#523d32",
      );
    }
  }
  b.box(x + 0.15, y + 0.45, z, 1.04, 0.77, 0.65, "#e0dbbc");
  b.box(x + 0.52, y + 0.99, z, 0.11, 0.55, 0.67, "#3b6268", "glass", 0.13);
  b.box(x - 2.72, y + 0.14, z, 0.41, 0.88, 0.52, "#3c4746", "dark", 0.17);
}
function nameplate(ship: T.Group) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 104;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#edeee8";
  ctx.font = "bold 60px Arial";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("R/V  AURELIA", 256, 50);
  const tx = new T.CanvasTexture(c);
  tx.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshBasicMaterial({
    map: tx,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  for (const s of [-1, 1]) {
    const label = new T.Mesh(new T.PlaneGeometry(6.6, 1.32), material);
    label.rotation.y = s === 1 ? 0 : Math.PI;
    label.position.set(5.2, 1.45, s * 4.875);
    ship.add(label);
  }
}
function stabilizedObservatory() {
  // The installation is scaled up for a full-size vessel. Its joint pattern and
  // pose offsets use the same physical coordinate frame as the adjacent rig.
  const mechanism = new T.Group(),
    head = new Metalwork(),
    pedestal = new Metalwork();
  const local = (p: T.Vector3) => v(p.x, p.z, -p.y);
  const sockets = anchors(DEFAULT_GEOMETRY);
  const base = sockets.base.map(local),
    top = sockets.top.map(local);
  pedestal.rod(v(0, -0.045, 0), v(0, 0.008, 0), 0.475, "#41494a", "paint", 32);
  pedestal.rod(v(0, 0.008, 0), v(0, 0.042, 0), 0.455, "#9aa7a7", "metal", 32);
  for (const p of base) pedestal.sphere(p.x, p.y, p.z, 0.057, 0.053, 0.055, "#525c5d");
  head.rod(v(0, -0.025, 0), v(0, 0.028, 0), 0.335, "#d5d9d2", "paint", 32);
  head.rod(v(0, 0.03, 0), v(0, 0.084, 0), 0.161, "#424d50", "metal", 24);
  head.box(0, 0.165, 0, 0.215, 0.172, 0.216, "#687579");
  head.sphere(0.005, 0.239, 0.005, 0.162, 0.168, 0.149, "#e7e6db");
  head.rod(v(0.04, 0.23, 0.12), v(0.046, 0.23, 0.156), 0.094, "#424c4d", "dark", 24);
  head.rod(v(0.046, 0.23, 0.157), v(0.047, 0.23, 0.166), 0.064, "#24404a", "glass", 24);
  for (const p of top) head.sphere(p.x, -0.014, p.z, 0.042, 0.041, 0.041, "#5a6262");
  const upper = head.finish();
  mechanism.add(pedestal.finish(), upper);
  const machined = (radius: number, color: string, metalness: number) => {
    const m = new T.InstancedMesh(
      new T.CylinderGeometry(radius, radius, 1, 12),
      new T.MeshStandardMaterial({ color, metalness, roughness: 0.32 }),
      6,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    mechanism.add(m);
    return m;
  };
  const barrels = machined(0.032, "#676e6b", 0.48),
    pistons = machined(0.017, "#b6c6c7", 0.71),
    bands = machined(0.036, "#e38238", 0.23);
  const inverse = new T.Quaternion(),
    actual = new T.Euler(0, 0, 0, "ZXY"),
    matrix = new T.Matrix4();
  const axis = v(0, 1, 0),
    tip = new T.Vector3(),
    dir = new T.Vector3(),
    point = new T.Vector3(),
    rot = new T.Quaternion(),
    scale = new T.Vector3(1, 1, 1);
  function update(frame: WorldFrame, shipOrientation: T.Quaternion) {
    inverse.copy(shipOrientation).invert();
    upper.quaternion
      .setFromEuler(actual.set(frame.deckRoll, 0, -frame.deckPitch, "ZXY"))
      .premultiply(inverse);
    upper.position
      .set(frame.deckX, HOME[2] + frame.deckZ - frame.baseHeave, -frame.deckY)
      .applyQuaternion(inverse);
    for (let i = 0; i < 6; i++) {
      tip.copy(top[i]).applyQuaternion(upper.quaternion).add(upper.position);
      dir.subVectors(tip, base[i]);
      const length = dir.length(),
        barrel = Math.min(0.275, length * 0.72);
      dir.multiplyScalar(1 / Math.max(0.001, length));
      rot.setFromUnitVectors(axis, dir);
      const segment = (mesh: T.InstancedMesh, start: number, end: number) => {
        point.copy(base[i]).addScaledVector(dir, (start + end) * 0.5);
        scale.y = end - start;
        mesh.setMatrixAt(i, matrix.compose(point, rot, scale));
      };
      segment(barrels, 0, barrel);
      segment(bands, barrel - 0.033, barrel);
      segment(pistons, barrel, length);
    }
    for (const mesh of [barrels, pistons, bands]) mesh.instanceMatrix.needsUpdate = true;
  }
  mechanism.position.set(14.55, 3.75, 0.2);
  mechanism.scale.setScalar(3.55);
  return { mechanism, update };
}
export function createResearchVessel() {
  const b = new Metalwork();
  hull(b);
  wheelhouse(b);
  workingDeck(b);
  safetyTender(b);
  const ship = b.finish();
  nameplate(ship);
  const r = new Metalwork();
  r.box(0, 0, 0, 2.06, 0.16, 0.23, "#e1e4d9");
  r.rod(v(0, -0.3, 0), v(0, 0, 0), 0.13, snow);
  const radar = r.finish();
  radar.position.set(2.3, 15.65, 0);
  ship.add(radar);
  const observatory = stabilizedObservatory();
  ship.add(observatory.mechanism);
  return { ship, radar, updateSensor: observatory.update };
}
export function createWaveBuoy() {
  const b = new Metalwork();
  b.rod(v(0, -0.6, 0), v(0, 0.12, 0), 1.45, "#a37d31", "paint", 24, 1.65);
  b.rod(v(0, 0.12, 0), v(0, 0.45, 0), 1.65, amber, "paint", 24, 1.04);
  for (const p of [0, 2.094, 4.189]) {
    const x = 0.8 * Math.cos(p),
      z = 0.8 * Math.sin(p);
    b.rod(v(x, 0.4, z), v(x * 0.25, 3.25, z * 0.25), 0.085, amber);
    b.rod(
      v(x, 0.45, z),
      v(0.8 * Math.cos(p + 2.094) * 0.5, 2.0, 0.8 * Math.sin(p + 2.094) * 0.5),
      0.045,
      amber,
    );
  }
  b.rod(v(0, 3.2, 0), v(0, 3.42, 0), 0.31, "#c49539");
  b.rod(v(0, 3.41, 0), v(0, 3.78, 0), 0.18, "#d9e0ce");
  b.rod(v(0, 3.8, 0), v(0, 4.5, 0), 0.035, "#898d76");
  return b.finish();
}
