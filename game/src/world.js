// YARD-7: a container terminal at dusk. Two spike sites (A north-west,
// B south-east), a mid lane, and container stacks for cover. The world owns
// the colliders (AABBs), the shootable meshes, the waypoint graph bots walk,
// and the site markers.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';

const HALF_X = 32;
const HALF_Z = 22;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D segment vs AABB test, for line of sight and waypoint edges.
export function segmentHitsBox(x1, z1, x2, z2, b) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  for (const [p, d, mn, mx] of [[x1, dx, b.min.x, b.max.x], [z1, dz, b.min.z, b.max.z]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return false;
    } else {
      let t1 = (mn - p) / d;
      let t2 = (mx - p) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function createWorld(scene) {
  const tex = makeTextures();
  const colliders = [];
  const shootables = [];
  const random = mulberry32(20261116);

  // Dusk sky dome + fog + low sun.
  const skyGeo = new THREE.SphereGeometry(180, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 26, 120);

  const sun = new THREE.DirectionalLight(0xffb070, 2.4);
  sun.position.set(-40, 26, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x4a5a78, 0x1a1410, 1.05));
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc06a, fog: false, transparent: true, opacity: 0.95 }),
  );
  sunSprite.position.set(-120, 34, -90);
  sunSprite.lookAt(0, 10, 0);
  scene.add(sunSprite);

  // Distant skyline silhouettes outside the walls.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x1a2030, fog: false });
  for (let i = 0; i < 26; i++) {
    const w = 6 + random() * 10;
    const h = 8 + random() * 26;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skylineMat);
    const ang = (i / 26) * Math.PI * 2;
    const r = 95 + random() * 30;
    m.position.set(Math.cos(ang) * r, h / 2 - 1, Math.sin(ang) * r);
    scene.add(m);
  }

  // Floor.
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.95, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2 + 8, HALF_Z * 2 + 8), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  shootables.push(floor);

  function addBox(x, z, w, h, d, mat, y = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
    const box = new THREE.Box3(
      new THREE.Vector3(x - w / 2, y, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    );
    colliders.push(box);
    return mesh;
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9, metalness: 0.1 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8 });
  // Perimeter walls with a hazard stripe cap.
  addBox(0, -HALF_Z - 0.5, HALF_X * 2 + 4, 4.2, 1, wallMat);
  addBox(0, HALF_Z + 0.5, HALF_X * 2 + 4, 4.2, 1, wallMat);
  addBox(-HALF_X - 0.5, 0, 1, 4.2, HALF_Z * 2 + 4, wallMat);
  addBox(HALF_X + 0.5, 0, 1, 4.2, HALF_Z * 2 + 4, wallMat);
  addBox(0, -HALF_Z - 0.5, HALF_X * 2 + 4, 0.35, 1.05, hazardMat, 4.2);
  addBox(0, HALF_Z + 0.5, HALF_X * 2 + 4, 0.35, 1.05, hazardMat, 4.2);

  // Containers: [x, z, colour, stacked?]. Long axis along X.
  const contMats = {
    orange: new THREE.MeshStandardMaterial({ map: tex.containerOrange, roughness: 0.75, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ map: tex.containerTeal, roughness: 0.75, metalness: 0.25 }),
    olive: new THREE.MeshStandardMaterial({ map: tex.containerOlive, roughness: 0.75, metalness: 0.25 }),
    grey: new THREE.MeshStandardMaterial({ map: tex.containerGrey, roughness: 0.75, metalness: 0.25 }),
    rust: new THREE.MeshStandardMaterial({ map: tex.containerRust, roughness: 0.8, metalness: 0.2 }),
  };
  const contDefs = [
    [-24, -14, 'orange', true], [-24, -8, 'teal', false],
    [-14, -17, 'grey', false], [-8, -10, 'rust', true],
    [-2, -16, 'olive', false], [6, -14, 'orange', false],
    [14, -17, 'teal', true], [22, -12, 'grey', false],
    [-16, 2, 'teal', true], [-6, 4, 'orange', false],
    [4, -2, 'grey', true], [12, 6, 'rust', false],
    [-20, 12, 'olive', false], [-10, 16, 'orange', true],
    [0, 12, 'teal', false], [10, 16, 'grey', false],
    [20, 8, 'orange', true], [26, 16, 'rust', false],
    [-26, 6, 'grey', false], [26, -4, 'olive', false],
  ];
  for (const [x, z, colour, stacked] of contDefs) {
    addBox(x, z, 6.1, 2.6, 2.6, contMats[colour]);
    if (stacked) addBox(x + 0.4, z, 6.1, 2.6, 2.6, contMats[colour === 'orange' ? 'rust' : 'orange'], 2.6);
  }

  // Crates: [x, z, size].
  const crateMat = new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9 });
  const crateDefs = [
    [-18, -18, 1.2], [-16.5, -18, 1.2], [-18, -16.5, 1.2],
    [16, 18, 1.2], [17.5, 18, 1.2], [16, 16.5, 1.2],
    [-4, -6, 1.2], [-2.6, -6, 1.2], [8, 2, 1.2],
    [-12, 8, 1.2], [2, 8, 1.2], [18, -8, 1.2],
    [-28, -2, 1.2], [28, 2, 1.2], [0, -20, 1.2], [0, 20, 1.2],
  ];
  for (const [x, z, s] of crateDefs) addBox(x, z, s, s, s, crateMat);

  // Site markers: painted ground letters + floating billboards + light poles.
  const sites = {
    A: { x: -20, z: -16, color: PALETTE.teal },
    B: { x: 20, z: 16, color: PALETTE.accent },
  };
  for (const [key, s] of Object.entries(sites)) {
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: key === 'A' ? tex.siteA : tex.siteB, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.rotation.z = key === 'A' ? 0.3 : -0.4;
    letter.position.set(s.x, 0.02, s.z);
    scene.add(letter);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 5.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.5 }),
    );
    pole.position.set(s.x + 4.5, 2.7, s.z - 4.5);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.PointLight(s.color, 14, 16, 1.6);
    lamp.position.set(s.x + 4.5, 5.2, s.z - 4.5);
    scene.add(lamp);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: s.color }),
    );
    bulb.position.set(s.x + 4.5, 5.2, s.z - 4.5);
    scene.add(bulb);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(s.x + 4.4, 0, s.z - 4.6),
      new THREE.Vector3(s.x + 4.6, 5.4, s.z - 4.4),
    ));
  }

  // Floodlight poles along mid for warm pools of light.
  for (const [x, z] of [[-8, 0], [8, 0]]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 6.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.5 }),
    );
    pole.position.set(x, 3.2, z);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.PointLight(0xffc06a, 18, 20, 1.6);
    lamp.position.set(x, 6.2, z);
    scene.add(lamp);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.12, 0, z - 0.12), new THREE.Vector3(x + 0.12, 6.4, z + 0.12)));
  }

  // Waypoint graph: hand-placed nodes in open lanes (never inside a
  // container's footprint); edges auto-link nodes within 13 m whose straight
  // segment clears every collider with 0.35 m of clearance, so a corner
  // graze does not cut the graph.
  const nodeDefs = [
    [-29, 0], [-24, -4], [-24, 8], [-18, -10], [-18, 4], [-12, -13],
    [-12, -2], [-12, 10], [-6, -13.5], [-6, 0], [-6, 12], [0, -8],
    [0, 0], [0, 8], [6, -11], [9, -2], [6, 12], [12, -8],
    [12, 4], [18, -14], [18, 0], [18, 12], [24, -6], [24, 11],
    [29, 0], [-20, -16], [20, 16],
  ];
  const nodes = nodeDefs.map(([x, z], i) => ({ id: i, x, z, edges: [] }));
  function blocked(x1, z1, x2, z2) {
    for (const b of colliders) {
      if (b.max.y < 0.5) continue;
      // Shrink the box by the clearance so grazing a corner still links.
      const inset = { min: { x: b.min.x + 0.35, z: b.min.z + 0.35 }, max: { x: b.max.x - 0.35, z: b.max.z - 0.35 } };
      if (inset.min.x >= inset.max.x || inset.min.z >= inset.max.z) continue;
      if (segmentHitsBox(x1, z1, x2, z2, inset)) return true;
    }
    return false;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 13 && !blocked(a.x, a.z, b.x, b.z)) {
        a.edges.push(j);
        b.edges.push(i);
      }
    }
  }

  function nearestNode(x, z) {
    let best = 0;
    let bd = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  // BFS path between nodes.
  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of nodes[cur].edges) {
        if (prev.has(nb)) continue;
        prev.set(nb, cur);
        if (nb === to) {
          const path = [to];
          let c = to;
          while (prev.get(c) !== -1) { c = prev.get(c); path.unshift(c); }
          return path;
        }
        queue.push(nb);
      }
    }
    return [to];
  }

  function losClear(x1, z1, x2, z2) {
    for (const b of colliders) {
      if (b.max.y < 1.2) continue;
      if (segmentHitsBox(x1, z1, x2, z2, b)) return false;
    }
    return true;
  }

  return {
    colliders,
    shootables,
    nodes,
    sites,
    nearestNode,
    findPath,
    losClear,
    spawns: {
      van: [[-29, -3], [-29, 0], [-29, 3], [-27, -5], [-27, 5]],
      emb: [[29, -3], [29, 0], [29, 3], [27, -5], [27, 5]],
    },
  };
}
