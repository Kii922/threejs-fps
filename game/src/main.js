// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=menu|play|end|site with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. window.__game exposes the live state for testing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, PHASES, mulberry32 } from './state.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, createGrenades, WEAPONS, damageAt } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
state.shotMode = shot;
state.rngSeed = seed;
const map = createMap(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(map.colliders, map.spawns.V[1]);
const weapon = createWeapon(camera);
const grenades = createGrenades(scene, map.colliders);
const bots = createBots(scene, map, state, random);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const losCaster = new THREE.Raycaster();
losCaster.far = 60;

// The player as an agent, so combat and the HUD see one list.
const playerAgent = {
  id: 'P', name: 'You', team: 'V', kind: 'player',
  body: player.state, hp: 100, armour: 0, alive: true,
  def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
  grenades: 0,
};
state.agents.unshift(playerAgent);

// Invisible hitbox the bots' rays can strike (opacity 0, still raycastable).
const playerHitbox = new THREE.Mesh(
  new THREE.BoxGeometry(0.68, 1.72, 0.68),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
playerHitbox.userData.agent = playerAgent;
playerHitbox.userData.part = 'torso';
scene.add(playerHitbox);

// The planted charge: a small glowing box that appears on the site.
const charge = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.5),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.8, roughness: 0.4 }),
);
charge.visible = false;
scene.add(charge);
const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);
scene.add(chargeLight);

const shootables = map.shootables.concat(bots.hitMeshes, playerHitbox);
const direction = new THREE.Vector3();
const tmp = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let roundEndAt = 0;
let plantActor = null;
let plantProgress = 0;
let defuseActor = null;
let defuseProgress = 0;
let prevFiring = false;
let spectateTarget = null;

const rounds = createRounds(state, {
  onRoundStart(site) {
    player.reset(map.spawns.V[1]);
    bots.reset(site);
    playerAgent.hp = 100;
    playerAgent.alive = true;
    playerAgent.body.position.copy(map.spawns.V[1]);
    weapon.refill();
    syncPlayerAgent();
    hud.hideBanner();
    hud.hideBuy();
    charge.visible = false;
    chargeLight.intensity = 0;
    plantActor = null;
    defuseActor = null;
    plantProgress = 0;
    defuseProgress = 0;
  },
  onRoundEnd(winner, reason) {
    hud.showBanner(state.banner);
    if (winner === 'V') audio.roundWin();
    else audio.roundLose();
    roundEndAt = elapsed + 4;
  },
  onMatchEnd() {
    hud.showBanner(state.banner);
    hud.showOverlay('start');
  },
  onBuy() {
    hud.showBuy(state.money);
    hud.setBuyTimer(state.buyLeft);
  },
  onEquip(def) {
    weapon.equip(def);
    playerAgent.def = def;
    syncPlayerAgent();
    hud.setWeapon(def.name);
  },
});

function syncPlayerAgent() {
  playerAgent.def = weapon.state.def;
  playerAgent.mag = weapon.state.mag;
  playerAgent.reserve = weapon.state.reserve;
}

function syncCamera() {
  if (!playerAgent.alive && spectateTarget && spectateTarget.alive) {
    const b = spectateTarget.body;
    camera.position.set(b.position.x, b.position.y + b.eye, b.position.z);
    camera.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerHitbox.position.set(body.position.x, body.position.y + body.height / 2, body.position.z);
}

function aimCameraAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function los(from, to) {
  tmp.copy(to).sub(from);
  const dist = tmp.length();
  if (dist < 0.01) return true;
  losCaster.set(from, tmp.normalize());
  const hit = losCaster.intersectObjects(map.shootables, false)[0];
  return !hit || hit.distance >= dist - 0.6;
}

function damageAgent(target, amount, attacker, headshot) {
  if (!target.alive) return false;
  const absorbed = Math.min(target.armour, amount * 0.5);
  target.armour -= absorbed;
  target.hp -= (amount - absorbed);
  if (target.kind === 'player') {
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(target.hp, target.armour);
  }
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  if (target.kind === 'bot') target.fall = 0;
  if (target.kind === 'player') {
    spectateTarget = state.agents.find((a) => a.kind === 'bot' && a.team === 'V' && a.alive) ?? null;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  const killer = attacker ? attacker.name : 'the map';
  hud.killFeed(`${killer} ▸ ${target.name}${headshot ? ' (headshot)' : ''}`);
  if (attacker && attacker.kind === 'player') {
    rounds.awardKill();
    audio.kill();
    hud.setMoney(state.money);
  }
  return true;
}

// Central shot resolver: one ray, wall or agent, damage with falloff.
function resolveShot(shooter, origin, dir, def) {
  raycaster.set(origin, dir);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (!hit) return null;
  const agent = hit.object.userData.agent;
  if (!agent || agent === shooter || !agent.alive) return { hit, wall: true };
  const headshot = hit.object.userData.part === 'head';
  const amount = damageAt(def, hit.distance, headshot);
  const killed = damageAgent(agent, amount, shooter, headshot);
  if (shooter.kind === 'player') {
    hud.hitMarker(killed, headshot, shot ? 4000 : 90);
    audio.hit();
  }
  return { hit, agent, headshot, killed };
}

function playerShoot() {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed(), player.state.crouching);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  resolveShot(playerAgent, camera.position, direction, weapon.state.def);
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(weapon.state.def.id);
  state.noise = { pos: player.state.position.clone(), at: elapsed, team: 'V' };
  syncPlayerAgent();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, playerAgent.grenades);
}

function botShoot(bot, dir) {
  const origin = tmp.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
  resolveShot(bot, origin, dir, bot.def);
  audio.enemyShot();
  state.noise = { pos: bot.body.position.clone(), at: elapsed, team: bot.team };
}

function explodeGrenade(pos) {
  audio.explosion();
  state.noise = { pos: pos.clone(), at: elapsed, team: null };
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    const dist = agent.body.position.distanceTo(pos);
    if (dist > 4) continue;
    const amount = Math.round(70 * (1 - dist / 4) + 10);
    const killed = damageAgent(agent, amount, playerAgent, false);
    if (killed && agent.team === 'E') hud.killFeed(`You ▸ ${agent.name} (grenade)`);
  }
}

function updateObjective(dt) {
  const plant = state.plant;
  // Player planting / defusing with E held.
  const keys = input.state.keys;
  const body = player.state;
  const inSite = (site) => map.sites[site].box.containsPoint(body.position);
  if (state.phase === PHASES.LIVE && playerAgent.alive && keys.has('KeyE')) {
    if (plant.state === 'none' && (inSite('A') || inSite('B'))) {
      const site = inSite('A') ? 'A' : 'B';
      if (plantActor !== playerAgent) { plantActor = playerAgent; plantProgress = 0; }
      plantProgress += dt / 3;
      plant.state = 'planting';
      plant.site = site;
      plant.progress = plantProgress;
      hud.showObjective(`Planting charge at site ${site}`, plantProgress);
      if (Math.floor(plantProgress * 6) !== Math.floor((plantProgress - dt / 3) * 6)) audio.beep();
      if (plantProgress >= 1) {
        plant.state = 'planted';
        plant.left = 35;
        plant.progress = 1;
        rounds.awardPlant();
        audio.plant();
        hud.killFeed('You planted the charge');
        state.noise = { pos: body.position.clone(), at: elapsed, team: 'V' };
        charge.visible = true;
        charge.position.set(map.sites[site].center.x, 0.2, map.sites[site].center.z);
        chargeLight.position.set(map.sites[site].center.x, 1.5, map.sites[site].center.z);
        chargeLight.intensity = 6;
        plantActor = null;
        hud.hideObjective();
      }
      return;
    }
    if (plant.state === 'planted' && inSite(plant.site)) {
      if (defuseActor !== playerAgent) { defuseActor = playerAgent; defuseProgress = 0; }
      defuseProgress += dt / 5;
      plant.progress = defuseProgress;
      hud.showObjective('Defusing the charge', defuseProgress);
      if (defuseProgress >= 1) {
        plant.state = 'defused';
        rounds.endRound('V', 'defuse');
        defuseActor = null;
        hud.hideObjective();
      }
      return;
    }
  }
  if (plantActor === playerAgent) plantActor = null;
  if (defuseActor === playerAgent) defuseActor = null;
  if (plant.state === 'planting' && plantActor === null) {
    plant.state = 'none';
    plant.progress = 0;
    hud.hideObjective();
  }
  if (plant.state === 'planted' && defuseActor === null) hud.hideObjective();
}

const botCtx = {
  get time() { return elapsed; },
  get agents() { return state.agents; },
  get state() { return state; },
  get map() { return map; },
  get colliders() { return map.colliders; },
  los,
  fireShot: botShoot,
  tryPlant(bot, dt) {
    if (state.plant.state !== 'none') return;
    if (plantActor !== bot) { plantActor = bot; plantProgress = 0; }
    plantProgress += dt / 3;
    state.plant.state = 'planting';
    state.plant.site = state.attackSite;
    state.plant.progress = plantProgress;
    if (plantProgress >= 1) {
      state.plant.state = 'planted';
      state.plant.left = 35;
      state.plant.progress = 1;
      audio.plant();
      hud.killFeed(`${bot.name} planted the charge`);
      charge.visible = true;
      const c = map.sites[state.attackSite].center;
      charge.position.set(c.x, 0.2, c.z);
      chargeLight.position.set(c.x, 1.5, c.z);
      chargeLight.intensity = 6;
      plantActor = null;
    }
  },
  tryDefuse(bot, dt) {
    if (state.plant.state !== 'planted') return;
    if (defuseActor !== bot) { defuseActor = bot; defuseProgress = 0; }
    defuseProgress += dt / 5;
    state.plant.progress = defuseProgress;
    if (defuseProgress >= 1) {
      state.plant.state = 'defused';
      rounds.endRound('E', 'defuse');
      defuseActor = null;
    }
  },
};

function step(dt) {
  elapsed += dt;
  state.elapsed = elapsed;
  if (state.phase === PHASES.LIVE || state.phase === PHASES.BUY) {
    const pressed = input.takePressed();
    const look = input.takeLook();
    if (playerAgent.alive) player.look(look.x, look.y);
    if (state.phase === PHASES.LIVE && playerAgent.alive) {
      player.step(dt, input.state.keys, input.state.aiming);
      weapon.step(dt, input.state.aiming);
      const firing = input.state.firing;
      if (firing && weapon.ready() && (weapon.state.def.auto || !prevFiring)) playerShoot();
      prevFiring = firing;
      if (pressed.has('KeyR') && weapon.state.reloadLeft === 0) {
        weapon.reload();
        if (weapon.state.reloadLeft > 0) audio.reload();
      }
      if (pressed.has('KeyG') && playerAgent.grenades > 0) {
        playerAgent.grenades -= 1;
        camera.getWorldDirection(direction);
        grenades.throwGrenade(camera.position, direction);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve, playerAgent.grenades);
      }
      updateObjective(dt);
    } else if (state.phase === PHASES.BUY && playerAgent.alive) {
      player.step(dt, input.state.keys, false);
      weapon.step(dt, false);
    }
    if (pressed.has('KeyB') && state.phase === PHASES.BUY) {
      rounds.startRound();
    }
    for (let d = 1; d <= 5; d += 1) {
      if (pressed.has(`Digit${d}`)) {
        const items = ['pistol', 'smg', 'rifle', 'armour', 'grenade'];
        if (rounds.buy(items[d - 1])) {
          hud.markBought(items[d - 1], true);
          hud.setMoney(state.money);
          audio.beep();
        }
      }
    }
    // Combat only runs in a live round: nobody shoots during the buy phase.
    if (state.phase === PHASES.LIVE) {
      grenades.step(dt, explodeGrenade);
      bots.step(dt, botCtx);
    }
    rounds.step(dt);
  }
  if (state.phase === PHASES.ROUND_END && elapsed >= roundEndAt) rounds.nextRound();
  hud.setHealth(playerAgent.hp, playerAgent.armour);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, playerAgent.grenades);
  hud.setMoney(state.money);
  hud.setScore(state.score.V, state.score.E, state.round);
  hud.setTimer(state.phase === PHASES.LIVE ? state.timer : state.phase === PHASES.BUY ? state.buyLeft : state.timer);
  hud.setCrosshair(weapon.spread(player.groundSpeed(), player.state.crouching) * 900);
  if (state.phase === PHASES.BUY) hud.setBuyTimer(state.buyLeft);
  if (state.plant.state === 'planted') {
    chargeLight.intensity = 4 + Math.sin(elapsed * 8) * 3;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (state.phase !== PHASES.MATCH_END && !state.banner) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASES.MATCH_END) {
    state.score = { V: 0, E: 0 };
    state.round = 1;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    playerAgent.grenades = 0;
    playerAgent.armour = 0;
    rounds.startBuy();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (state.phase === PHASES.MENU) {
    rounds.startBuy();
    hud.hideOverlay();
  }
  input.requestLock();
});

hud.onBuy((itemId) => {
  if (rounds.buy(itemId)) {
    hud.markBought(itemId, true);
    hud.setMoney(state.money);
    audio.beep();
  }
});

document.getElementById('buy-ready').addEventListener('click', () => {
  if (state.phase === PHASES.BUY) rounds.startRound();
});

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  player.state.pitch = 0;
  player.state.yaw = 0;
  if (name === 'menu') {
    rounds.startBuy();
    player.state.position.set(2, 0, 13);
    player.state.yaw = 0.15;
    player.state.pitch = -0.02;
    settle(30);
    bots.bots[0].body.position.set(-3, 0, 10);
    bots.bots[1].body.position.set(5, 0, 11);
    bots.bots[0].group.position.copy(bots.bots[0].body.position);
    bots.bots[1].group.position.copy(bots.bots[1].body.position);
    syncCamera();
    hud.showBuy(state.money);
    hud.setBuyTimer(20);
  } else if (name === 'play') {
    rounds.startRound();
    player.state.position.set(0, 0, 6);
    const enemy = bots.bots[2];
    enemy.body.position.set(1.5, 0, -8);
    enemy.group.position.copy(enemy.body.position);
    enemy.body.yaw = Math.PI;
    settle(20);
    aimCameraAt(new THREE.Vector3(1.5, 1.2, -8));
    weapon.equip(WEAPONS.rifle);
    weapon.state.mag = 18;
    weapon.state.reserve = 75;
    hud.setWeapon(WEAPONS.rifle.name);
    hud.setAmmo(18, 75, 0);
    hud.setHealth(100, 50);
  } else if (name === 'end') {
    state.score.V = 1;
    state.score.E = 0;
    state.phase = PHASES.ROUND_END;
    state.banner = { title: 'Vanguard wins the round', copy: 'Vanguard 1 — 0 Ember · Round 1 of 9' };
    hud.showBanner(state.banner);
    roundEndAt = elapsed + 3600; // frozen pose: never auto-advance to the buy phase
    player.state.position.set(-11, 0, -6);
    player.state.yaw = 0.5;
    settle(20);
    aimCameraAt(new THREE.Vector3(-15, 1.5, -11));
  } else if (name === 'site') {
    rounds.startRound();
    player.state.position.set(-10, 0, -7.5);
    const enemy = bots.bots[3];
    enemy.body.position.set(-13.5, 0, -13.5);
    enemy.group.position.copy(enemy.body.position);
    settle(20);
    // Set the objective state after settling: updateObjective would otherwise
    // clear a planting state with no actor holding E.
    state.plant.state = 'planting';
    state.plant.site = 'A';
    state.plant.progress = 0.6;
    charge.visible = true;
    charge.position.set(-15, 0.2, -11);
    aimCameraAt(new THREE.Vector3(-15, 1.0, -11));
    hud.showObjective('Planting charge at site A', 0.6);
  }
  hud.setScore(state.score.V, state.score.E, state.round);
  hud.setMoney(state.money);
  hud.setTimer(state.timer);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = { state, player: playerAgent, bots: bots.bots, weapon, rounds,
  // Test hook for the headless play-test: fire one round like a click would.
  shoot() { if (state.phase === PHASES.LIVE && playerAgent.alive && weapon.ready()) playerShoot(); },
};

syncCamera();
hud.setAmmo(weapon.state.mag, weapon.state.reserve, 0);
hud.setScore(0, 0, 1);
hud.setMoney(state.money);
hud.setWeapon(WEAPONS.pistol.name);
hud.setHealth(100, 0);
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
