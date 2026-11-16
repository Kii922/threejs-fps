// Bot AI: five bots, two Vanguard teammates and three Ember defenders, all using
// the same weapons, collision and damage as the player. States: route along the
// waypoint graph, hold an angle, engage a visible enemy, react to sound, and
// plant or defuse on a site. No new objects per frame in the hot loops.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { moveBody } from './player.js';

const BOT_SPEED = 4.1;
const LOS_CHECK = 0.15;
const REACT_MIN = 0.35;
const REACT_MAX = 0.6;
const HEAR_RANGE = 26;

const NAMES = {
  V: ['Rook', 'Ivy'],
  E: ['Ash', 'Cinder', 'Flare'],
};

function makeBodyMesh(team) {
  const group = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'V' ? PALETTE.accent : PALETTE.ember), roughness: 0.6, metalness: 0.05,
  });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.24), legMat);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), teamMat);
  torso.position.y = 1.11;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), headMat);
  head.position.y = 1.56;
  head.userData.part = 'head';
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), legMat);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(legs, torso, head, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group, torso, head };
}

export function createBots(scene, map, state, rng) {
  const bots = [];
  const hitMeshes = [];

  function spawnBot(team, index, spawnPos, def) {
    const { group, torso, head } = makeBodyMesh(team);
    group.position.copy(spawnPos);
    scene.add(group);
    const bot = {
      id: `${team}${index}`,
      name: NAMES[team][index],
      team,
      kind: 'bot',
      body: {
        position: spawnPos.clone(), velocity: new THREE.Vector3(),
        yaw: team === 'V' ? 0 : Math.PI, pitch: 0, eye: 1.6,
        onGround: true, crouching: false, height: 1.72,
      },
      hp: 100, armour: 0, alive: true,
      def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0,
      group, torso, head, fall: 0,
      ai: {
        mode: 'route', path: [], pathIdx: 0, holdUntil: 0, losAt: 0,
        target: null, reaction: 0, burstLeft: 0, burstAt: 0,
        site: team === 'V' ? state.attackSite : (index === 0 ? 'A' : 'B'),
        holdNode: team === 'E' ? (index === 0 ? 19 : 20) : 0,
        plantProgress: 0, defuseProgress: 0, investigateAt: 0,
      },
    };
    torso.userData.agent = bot;
    head.userData.agent = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    state.agents.push(bot);
    return bot;
  }

  // Vanguard teammates take the outer spawns; the player takes the middle one.
  spawnBot('V', 0, map.spawns.V[0], WEAPONS.rifle);
  spawnBot('V', 1, map.spawns.V[2], WEAPONS.smg);
  spawnBot('E', 0, map.spawns.E[0], WEAPONS.rifle);
  spawnBot('E', 1, map.spawns.E[1], WEAPONS.smg);
  spawnBot('E', 2, map.spawns.E[2], WEAPONS.rifle);

  const eyePos = new THREE.Vector3();
  const chestPos = new THREE.Vector3();

  function visibleEnemy(bot, ctx) {
    // Throttled line-of-sight scan: nearest living enemy with a clear ray.
    if (ctx.time - bot.ai.losAt < LOS_CHECK && bot.ai.target && bot.ai.target.alive) return bot.ai.target;
    bot.ai.losAt = ctx.time;
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    let best = null;
    let bestDist = Infinity;
    for (const other of ctx.agents) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      chestPos.set(other.body.position.x, other.body.position.y + 1.2, other.body.position.z);
      const dist = eyePos.distanceTo(chestPos);
      if (dist > 55 || dist >= bestDist) continue;
      if (ctx.los(eyePos, chestPos)) { best = other; bestDist = dist; }
    }
    bot.ai.target = best;
    return best;
  }

  function aimAt(bot, target, spread) {
    chestPos.set(target.body.position.x, target.body.position.y + 1.15, target.body.position.z);
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    const dx = chestPos.x - eyePos.x;
    const dy = chestPos.y - eyePos.y;
    const dz = chestPos.z - eyePos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    bot.body.yaw = Math.atan2(-dx, -dz);
    bot.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    const dist = len;
    const err = spread * (0.9 + dist / 30);
    dir.x += (rng() * 2 - 1) * err;
    dir.y += (rng() * 2 - 1) * err;
    dir.z += (rng() * 2 - 1) * err;
    return dir.normalize();
  }

  function routeTo(bot, ctx, dest) {
    bot.ai.path = ctx.map.route(bot.body.position, dest);
    bot.ai.pathIdx = 0;
    bot.ai.mode = 'route';
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const need = bot.def.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }

    const enemy = visibleEnemy(bot, ctx);
    const plant = ctx.state.plant;

    // Defenders rotate to a planted charge; attackers converge on their site.
    if (bot.team === 'E' && plant.state === 'planted' && bot.ai.mode !== 'defuse' && bot.ai.mode !== 'engage') {
      routeTo(bot, ctx, ctx.map.sites[plant.site].center);
      bot.ai.mode = 'rotate';
    }
    if (bot.team === 'V' && plant.state === 'planted' && bot.ai.mode !== 'engage') {
      // Planted: fall back and guard the site instead of pushing on.
      if (bot.ai.mode !== 'hold') { routeTo(bot, ctx, ctx.map.sites[plant.site].center); bot.ai.mode = 'hold'; }
    }

    if (enemy) {
      bot.ai.mode = 'engage';
      const dir = aimAt(bot, enemy, bot.def.spreadStill + bot.def.spreadMove * 0.5);
      if (bot.ai.reaction <= 0) bot.ai.reaction = REACT_MIN + rng() * (REACT_MAX - REACT_MIN);
      bot.ai.reaction -= dt;
      if (bot.ai.reaction <= 0 && bot.cooldown === 0 && bot.reloadLeft === 0 && ctx.time >= (bot.ai.nextBurstAt || 0)) {
        if (bot.ai.burstLeft <= 0) bot.ai.burstLeft = 3 + Math.floor(rng() * 3);
        if (bot.mag > 0) {
          bot.mag -= 1;
          bot.cooldown = bot.def.gap;
          bot.ai.burstLeft -= 1;
          ctx.fireShot(bot, dir);
          // A pause between bursts: bots are dangerous, not laser-accurate.
          if (bot.ai.burstLeft <= 0) bot.ai.nextBurstAt = ctx.time + 0.6 + rng() * 0.8;
          if (bot.mag === 0) bot.reloadLeft = bot.def.reload;
        } else {
          bot.reloadLeft = bot.def.reload;
        }
      }
      // Strafe a little while engaging so bots are not statues.
      const strafe = Math.sin(ctx.time * 1.3 + bot.id.charCodeAt(1)) > 0 ? 1 : -1;
      const sin = Math.sin(bot.body.yaw);
      const cos = Math.cos(bot.body.yaw);
      moveBody(bot.body, ctx.colliders, dt, cos * strafe * 0.4, -sin * strafe * 0.4, BOT_SPEED * 0.4, false);
    } else {
      bot.ai.reaction = 0;
      bot.ai.burstLeft = 0;
      // Hearing: a recent loud noise pulls the nearest bot to investigate.
      const noise = ctx.state.noise;
      if (noise && ctx.time - noise.at < 2 && bot.body.position.distanceTo(noise.pos) < HEAR_RANGE
        && bot.ai.mode !== 'route' && bot.ai.mode !== 'plant' && bot.ai.mode !== 'defuse') {
        routeTo(bot, ctx, noise.pos);
        bot.ai.investigateAt = ctx.time;
      }

      if (bot.ai.mode === 'route' || bot.ai.mode === 'rotate') {
        const target = bot.ai.path[bot.ai.pathIdx];
        if (!target) {
          bot.ai.mode = 'hold';
          bot.ai.holdUntil = ctx.time + 2 + rng() * 2;
        } else {
          const dx = target.x - bot.body.position.x;
          const dz = target.z - bot.body.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.9) {
            bot.ai.pathIdx += 1;
          } else {
            bot.body.yaw = Math.atan2(-dx, -dz);
            moveBody(bot.body, ctx.colliders, dt, dx / dist, dz / dist, BOT_SPEED, false);
          }
        }
      } else if (bot.ai.mode === 'hold') {
        // Scan slowly, then pick a nearby waypoint to reposition to.
        bot.body.yaw += dt * 0.5;
        if (ctx.time > bot.ai.holdUntil) {
          if (bot.team === 'E') {
            const node = bot.ai.holdNode;
            routeTo(bot, ctx, ctx.map.waypoints[node]);
            bot.ai.mode = 'route';
          } else {
            routeTo(bot, ctx, ctx.map.sites[state.attackSite].center);
            bot.ai.mode = 'route';
          }
        }
      }

      // Objective work, only when no enemy is in sight.
      if (bot.team === 'V' && plant.state === 'none') {
        const site = ctx.map.sites[state.attackSite];
        if (site.box.containsPoint(bot.body.position) && bot.body.position.distanceTo(site.center) < 5) {
          bot.ai.mode = 'plant';
          ctx.tryPlant(bot, dt);
        }
      }
      if (bot.team === 'E' && plant.state === 'planted') {
        const site = ctx.map.sites[plant.site];
        if (site.box.containsPoint(bot.body.position)) {
          bot.ai.mode = 'defuse';
          ctx.tryDefuse(bot, dt);
        }
      }
    }

    bot.group.position.copy(bot.body.position);
    bot.group.rotation.set(0, bot.body.yaw, 0);
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  function reset(roundSite) {
    for (const bot of bots) {
      const spawnList = bot.team === 'V' ? map.spawns.V : map.spawns.E;
      const idx = bot.team === 'V' ? (bot.id === 'V0' ? 0 : 2) : Number(bot.id[1]);
      bot.body.position.copy(spawnList[idx]);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = bot.team === 'V' ? 0 : Math.PI;
      bot.body.pitch = 0;
      bot.hp = 100;
      bot.armour = 0;
      bot.alive = true;
      bot.fall = 0;
      bot.mag = bot.def.mag;
      bot.reserve = bot.def.reserve;
      bot.cooldown = 0;
      bot.reloadLeft = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.copy(bot.body.position);
      bot.ai.mode = 'route';
      bot.ai.path = [];
      bot.ai.pathIdx = 0;
      bot.ai.target = null;
      bot.ai.reaction = 0;
      bot.ai.burstLeft = 0;
      bot.ai.site = bot.team === 'V' ? roundSite : bot.ai.site;
      bot.ai.plantProgress = 0;
      bot.ai.defuseProgress = 0;
      bot.ai.holdUntil = 0;
    }
  }

  return { bots, hitMeshes, step, reset };
}
