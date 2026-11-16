// Solar Foundry: an original industrial yard at dusk. Two bomb sites (A = reactor
// hall west, B = storage yard east), a mid lane, flanks, crates, containers and a
// low catwalk. All geometry is boxes and cylinders; every box is a collider for
// movement and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: nodes at lane junctions, site entrances and cover spots. Bots
// route over it with a breadth-first search.
const NODES = [
  [0, 16], [-6, 15], [6, 15], // 0-2 Vanguard spawn
  [0, 8], [0, 0], [0, -6], // 3-5 mid
  [-10, 4], [-12, -4], [-15, -11], // 6-8 site A approach
  [10, 4], [12, -4], [15, -11], // 9-11 site B approach
  [-18, 6], [-18, -6], // 12-13 west flank
  [18, 6], [18, -6], // 14-15 east flank
  [0, -15], [-6, -14], [6, -14], // 16-18 Ember spawn
  [-11, -8], [11, -8], // 19-20 defender holds
];
const LINKS = {
  0: [1, 2, 3], 1: [0, 3, 6, 12], 2: [0, 3, 9, 14],
  3: [0, 1, 2, 4, 6, 9], 4: [3, 5, 6, 9, 12, 14], 5: [4, 7, 10, 19, 20],
  6: [1, 3, 4, 7, 12], 7: [5, 6, 8, 19], 8: [7, 13, 19],
  9: [2, 3, 4, 10, 14], 10: [5, 9, 11, 20], 11: [10, 15, 20],
  12: [1, 4, 6, 13], 13: [8, 12, 16, 19], 14: [2, 4, 9, 15],
  15: [11, 14, 16, 20], 16: [13, 15, 17, 18], 17: [16, 19], 18: [16, 20],
  19: [5, 7, 8, 13, 17], 20: [5, 10, 11, 15, 18],
};

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Approximate the cylinder with a square box collider of the same footprint.
    const box3 = new THREE.Box3(
      new THREE.Vector3(x - rBottom, y - h / 2, z - rBottom),
      new THREE.Vector3(x + rBottom, y + h / 2, z + rBottom),
    );
    colliders.push(box3);
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the yard walls (44 x 36 m, 5 m high, open sky).
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Site markers: glowing floor strips outlining each 7 x 7 m site.
  for (const cx of [-15, 15]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 0.5), siteMat);
    strip.position.set(cx, 0.03, -14.5);
    group.add(strip);
    const strip2 = strip.clone();
    strip2.position.z = -7.5;
    group.add(strip2);
    const strip3 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 7), siteMat);
    strip3.position.set(cx - 3.5, 0.03, -11);
    group.add(strip3);
    const strip4 = strip3.clone();
    strip4.position.x = cx + 3.5;
    group.add(strip4);
  }

  // Site A — reactor hall: a reactor cylinder and control blocks.
  cylinder(2.2, 2.2, 4.2, -16.5, 2.1, -13.5, 'hairline');
  box(2.4, 1.2, 1.2, -12.4, 0.6, -13.8, 'hairline');
  box(1.2, 1.2, 2.4, -12.6, 0.6, -8.6, 'hairline');
  // Site B — storage yard: tanks and stacked containers.
  cylinder(1.8, 1.8, 3.4, 17.2, 1.7, -13.2, 'hairline');
  box(4.4, 2.4, 2.2, 12.8, 1.2, -13.6, 'surface');
  box(2.2, 2.4, 2.2, 12.8, 3.6, -13.6, 'surface');

  // Mid lane: a central pillar, crates, and the low catwalk platform.
  box(1.4, 3.4, 1.4, 0, 1.7, 0, 'hairline');
  box(1.2, 1.1, 1.2, -3.4, 0.55, 2.6, 'hairline');
  box(1.2, 1.1, 1.2, 3.4, 0.55, -2.6, 'hairline');
  box(6.4, 0.8, 3.2, -6, 0.4, -4.5, 'surface'); // catwalk, jumpable
  box(1.2, 0.7, 1.2, 6.8, 0.35, 5.2, 'hairline');
  box(1.2, 0.7, 1.2, -6.8, 0.35, 5.2, 'hairline');

  // Flank cover: containers and crates.
  box(4.2, 2.4, 2.2, -18.5, 1.2, 1.5, 'surface');
  box(4.2, 2.4, 2.2, 18.5, 1.2, 1.5, 'surface');
  box(2.2, 2.4, 2.2, -18.5, 1.2, -9.5, 'surface');
  box(2.2, 2.4, 2.2, 18.5, 1.2, -9.5, 'surface');
  box(1.2, 1.1, 1.2, -9, 0.55, 10.5, 'hairline');
  box(1.2, 1.1, 1.2, 9, 0.55, 10.5, 'hairline');
  box(1.2, 1.1, 1.2, -4.5, 0.55, -9.5, 'hairline');
  box(1.2, 1.1, 1.2, 4.5, 0.55, -9.5, 'hairline');

  // Spawn cover.
  box(2.4, 1.0, 1.2, -8, 0.5, 14.5, 'hairline');
  box(2.4, 1.0, 1.2, 8, 0.5, 14.5, 'hairline');
  box(2.4, 1.0, 1.2, -8, 0.5, -14.5, 'hairline');
  box(2.4, 1.0, 1.2, 8, 0.5, -14.5, 'hairline');

  // Dusk light: a warm low key from the west, a cool fill, and a dim sky.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.25);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.0);
  key.position.set(-14, 12, 6);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.65);
  fill.position.set(10, 9, 12);
  scene.add(fill);

  const sites = {
    A: { center: new THREE.Vector3(-15, 0, -11), box: new THREE.Box3(new THREE.Vector3(-18.5, 0, -14.5), new THREE.Vector3(-11.5, 3, -7.5)) },
    B: { center: new THREE.Vector3(15, 0, -11), box: new THREE.Box3(new THREE.Vector3(11.5, 0, -14.5), new THREE.Vector3(18.5, 3, -7.5)) },
  };
  const spawns = {
    V: [new THREE.Vector3(-6, 0, 15), new THREE.Vector3(0, 0, 16), new THREE.Vector3(6, 0, 15)],
    E: [new THREE.Vector3(-6, 0, -14), new THREE.Vector3(0, 0, -15), new THREE.Vector3(6, 0, -14)],
  };
  const waypoints = NODES.map(([x, z]) => new THREE.Vector3(x, 0, z));

  function nearestWaypoint(pos) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < waypoints.length; i += 1) {
      const d = waypoints[i].distanceToSquared(pos);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Breadth-first route between the waypoints nearest to two points.
  function route(fromPos, toPos) {
    const start = nearestWaypoint(fromPos);
    const goal = nearestWaypoint(toPos);
    const prev = new Map([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const node = queue.shift();
      if (node === goal) break;
      for (const next of LINKS[node] ?? []) {
        if (!prev.has(next)) { prev.set(next, node); queue.push(next); }
      }
    }
    if (!prev.has(goal)) return [waypoints[goal].clone()];
    const path = [];
    let node = goal;
    while (node !== -1) { path.unshift(waypoints[node].clone()); node = prev.get(node); }
    return path;
  }

  return { colliders, shootables, sites, spawns, waypoints, nearestWaypoint, route, group };
}
