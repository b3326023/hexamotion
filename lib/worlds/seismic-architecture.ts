import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake repeated, textured facade modules into a handful of material batches per storey. */
export function installFacade(
  storeys: T.Group[],
  levelHeight: number,
  disposed: () => boolean,
  neighborhood: T.Group,
  manager?: T.LoadingManager,
) {
  if (typeof window === "undefined") return;
  const loader = new GLTFLoader(manager);
  loader.load("/worlds/seismic/architecture.glb", ({ scene: kit }) => {
    const originalGeometry = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    kit.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        originalGeometry.add(obj.geometry);
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          materials.add(m);
          for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
        }
      }
    });
    if (disposed()) {
      originalGeometry.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      return;
    }
    kit.updateMatrixWorld(true);
    const transform = new T.Matrix4(),
      origin = new T.Vector3(),
      size = new T.Vector3(),
      q = new T.Quaternion(),
      up = new T.Vector3(0, 1, 0);
    const shells: T.Group[] = [];
    for (let k = 0; k < storeys.length; k++) {
      const story = storeys[k],
        short = k >= 6,
        columns = short ? 5 : 6,
        rows = short ? 4 : 5,
        w = columns * 3,
        d = rows * 3,
        cx = short ? -1.5 : 0,
        cz = short ? -0.9 : 0;
      const byMaterial = new Map<T.Material, T.BufferGeometry[]>();
      function stamp(
        name: string,
        x: number,
        z: number,
        angle: number,
        y = 0,
        sy = levelHeight / 3,
      ) {
        const tile = kit.getObjectByName(name);
        if (!tile) return;
        transform.compose(origin.set(x, y, z), q.setFromAxisAngle(up, angle), size.set(1, sy, 1));
        tile.traverse((obj) => {
          if (!(obj instanceof T.Mesh)) return;
          const m = obj.material as T.Material;
          if (m.name.endsWith("_glass") && m instanceof T.MeshStandardMaterial) {
            m.color.setHex(0x627976);
            m.roughness = 0.17;
            m.metalness = 0.67;
            m.transparent = false;
            m.opacity = 1;
          }
          let batch = byMaterial.get(m);
          if (!batch) {
            batch = [];
            byMaterial.set(m, batch);
          }
          const geom = obj.geometry.clone().applyMatrix4(obj.matrixWorld).applyMatrix4(transform);
          batch.push(geom);
        });
      }
      const sides = [
        [cx - w / 2, cz + d / 2, columns, 0],
        [cx + w / 2, cz + d / 2, rows, Math.PI / 2],
        [cx + w / 2, cz - d / 2, columns, Math.PI],
        [cx - w / 2, cz - d / 2, rows, -Math.PI / 2],
      ];
      for (const [startX, startZ, count, angle] of sides)
        for (let j = 1; j <= count; j++) {
          const x = startX + Math.cos(angle) * 3 * j,
            z = startZ - Math.sin(angle) * 3 * j;
          const doorway = k === 0 && angle === 0 && (j === 3 || j === 4),
            index = ((k + j) % 3) + 1;
          const face = doorway ? "door_centered_large_01" : "window_centered_large_0" + index;
          stamp("wall_" + face, x, z, angle);
          stamp(face, x, z, angle);
          stamp("cornice_standard_standard_01", x, z, angle, levelHeight - 0.14, 0.7);
          if (k === 0 && !doorway) stamp("base_standard_01", x, z, angle, 0, 0.55);
          if (k === 5 || k === storeys.length - 1)
            stamp("crown_standard_standard_01", x, z, angle, levelHeight - 0.14, 0.72);
        }
      const shell = new T.Group();
      shell.position.y = -levelHeight;
      story.add(shell);
      shells.push(shell);
      for (const [m, parts] of byMaterial) {
        const geom = mergeGeometries(parts)!;
        parts.forEach((g) => g.dispose());
        const mesh = new T.Mesh(geom, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        shell.add(mesh);
      }
      const fallback = story.getObjectByName("preload-facade");
      if (fallback) fallback.visible = false;
    }
    // Mid-rise blocks on the next streets share the facade kit and define the scale of the main building.
    const roofMaterial = new T.MeshStandardMaterial({ color: 0x999482, roughness: 0.91 });
    const roofGeo = new T.BoxGeometry(18.5, 0.4, 15.5);
    for (const [x, z, count, sx, sz] of [
      [-47, -18, 4, 1.3, 1.1],
      [15, -51, 3, 1.45, 1],
      [-16, -63, 5, 1.22, 1],
      [-48, 9, 3, 1.3, 1.1],
    ]) {
      const block = new T.Group();
      block.position.set(x, 0, z);
      block.scale.set(sx, 1, sz);
      for (let k = 0; k < count; k++) {
        const shell = shells[k].clone();
        shell.position.y = k * levelHeight;
        block.add(shell);
      }
      const roof = new T.Mesh(roofGeo, roofMaterial);
      roof.position.y = count * levelHeight;
      roof.receiveShadow = true;
      block.add(roof);
      neighborhood.add(block);
    }
    originalGeometry.forEach((g) => g.dispose());
  });
}
