// Weapons: hitscan raycast guns plus a thrown grenade. All numbers live in the
// defs; the view model, magazine, reload and spread bloom live in the state
// object. main.js owns the ray and the damage; bots use the defs directly.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', price: 300, damage: 34, headMult: 2, mag: 12, reserve: 36, gap: 0.22, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, falloff: 25 },
  smg: { id: 'smg', name: 'VK-9 SMG', price: 1200, damage: 22, headMult: 2, mag: 28, reserve: 84, gap: 0.08, auto: true, reload: 1.7, spreadStill: 0.006, spreadMove: 0.032, falloff: 20 },
  rifle: { id: 'rifle', name: 'AR-77 Rifle', price: 2500, damage: 38, headMult: 2, mag: 25, reserve: 75, gap: 0.1, auto: true, reload: 2.1, spreadStill: 0.002, spreadMove: 0.028, falloff: 30 },
};
export const ARMOUR_PRICE = 650;
export const GRENADE_PRICE = 400;
export const BUY_ITEMS = [
  { id: 'pistol', name: 'P9 Sidearm', price: 300, note: '34 dmg · 12 rounds' },
  { id: 'smg', name: 'VK-9 SMG', price: 1200, note: '22 dmg · 750 rpm' },
  { id: 'rifle', name: 'AR-77 Rifle', price: 2500, note: '38 dmg · 600 rpm' },
  { id: 'armour', name: 'Kevlar Armour', price: 650, note: 'absorbs 50% of damage' },
  { id: 'grenade', name: 'HE Grenade', price: 400, note: '70 dmg in 4 m · G to throw' },
];

// Damage falls off past the weapon's falloff range, down to 60% at twice the range.
export function damageAt(def, distance, headshot) {
  let dmg = def.damage;
  if (distance > def.falloff) dmg *= Math.max(0.6, 1 - 0.4 * ((distance - def.falloff) / def.falloff));
  if (headshot) dmg *= def.headMult;
  return Math.round(dmg);
}

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  const model = new THREE.Group();
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0, ads: 0,
  };

  function rebuildModel() {
    while (model.children.length) model.remove(model.children[0]);
    const long = state.def.id !== 'pistol';
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long ? 0.46 : 0.3), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, long ? 0.42 : 0.2), grip);
    barrel.position.set(0, 0.025, long ? -0.42 : -0.24);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, long ? 0.32 : 0.22);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.075, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.24, -0.2, -0.42);
    model.rotation.set(0, 0, 0);
  }
  rebuildModel();

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    state.ads += ((aiming ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    const adsX = 0.24 - 0.24 * state.ads;
    const adsY = -0.2 + 0.045 * state.ads;
    model.position.set(adsX, adsY, -0.42 + state.kick);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip(def) {
      state.def = def;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      rebuildModel();
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = state.def.id === 'rifle' ? 0.06 : state.def.id === 'smg' ? 0.04 : 0.05;
      state.bloom = Math.min(0.05, state.bloom + (state.def.id === 'rifle' ? 0.006 : 0.004));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return;
      state.reloadLeft = state.def.reload;
    },
    spread(speed, moving) {
      const move = Math.min(1, speed / 5.2);
      const base = state.def.spreadStill + move * state.def.spreadMove;
      return (base + state.bloom) * (1 - 0.55 * state.ads) * (moving ? 1 : 1);
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}

// Grenades: arcing throws with a 1.2 s fuse, a bounce, then a 4 m blast.
export function createGrenades(scene, colliders) {
  const live = [];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 }),
  );
  const probe = new THREE.Box3();

  function throwGrenade(origin, dir) {
    const g = mesh.clone();
    g.position.copy(origin);
    scene.add(g);
    live.push({ mesh: g, vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0)), fuse: 1.2, bounced: false });
  }

  function step(dt, onExplode) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
      probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
      probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
      let hit = false;
      for (const c of colliders) if (probe.intersectsBox(c)) { hit = true; break; }
      if (hit) {
        g.vel.multiplyScalar(0.45);
        g.vel.y = Math.abs(g.vel.y) * 0.4 + 1.5;
      } else {
        g.mesh.position.copy(next);
      }
      if (g.mesh.position.y < 0.09) { g.mesh.position.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        scene.remove(g.mesh);
        live.splice(i, 1);
        onExplode(pos);
      }
    }
  }

  return { throwGrenade, step, count: () => live.length };
}
