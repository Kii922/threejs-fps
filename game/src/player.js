// Movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a
// body. The same mover drives the player and the bots.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const AIM_SPEED = 3.0;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

const probe = new THREE.Box3();

// Shared AABB mover: moves `body` (position/velocity/yaw/height/eye/onGround) by a
// wish direction in world space. Returns nothing; the body is mutated in place.
export function moveBody(body, colliders, dt, wishX, wishZ, speed, jumping) {
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  const wishLen = Math.hypot(wishX, wishZ);
  const wx = wishLen > 0 ? wishX / wishLen : 0;
  const wz = wishLen > 0 ? wishZ / wishLen : 0;
  const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
  body.velocity.x += (wx * speed - body.velocity.x) * blend;
  body.velocity.z += (wz * speed - body.velocity.z) * blend;
  if (body.onGround && wishLen === 0) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }

  if (jumping && body.onGround) {
    body.velocity.y = JUMP_SPEED;
    body.onGround = false;
  }
  body.velocity.y -= GRAVITY * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
  return overlaps;
}

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: 0, // facing north (-z), towards the sites
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, aiming) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const wishX = -sin * forward + cos * strafe;
    const wishZ = -cos * forward - sin * strafe;
    const speed = player.crouching ? CROUCH_SPEED : aiming ? AIM_SPEED : WALK_SPEED;
    moveBody(player, colliders, dt, wishX, wishZ, speed, keys.has('Space'));
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    reset(spawnPos) {
      player.position.copy(spawnPos);
      player.velocity.set(0, 0, 0);
      player.yaw = 0;
      player.pitch = 0;
      player.crouching = false;
      player.height = STAND_HEIGHT;
    },
  };
}
