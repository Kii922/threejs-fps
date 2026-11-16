// The one game-state object. Everything the sim, the HUD and the round flow read
// or write lives here; modules never keep their own copy of a number that matters.
import * as THREE from 'three';

export const TEAMS = { V: 'Vanguard', E: 'Ember' };
export const PHASES = { MENU: 'menu', BUY: 'buy', LIVE: 'live', ROUND_END: 'roundEnd', MATCH_END: 'matchEnd' };
export const ROUND_TARGET = 5;
export const ROUND_TIME = 100;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const DETONATE_TIME = 35;

export function createState() {
  return {
    phase: PHASES.MENU,
    round: 1,
    score: { V: 0, E: 0 },
    timer: ROUND_TIME,
    money: 800,
    kills: 0,
    deaths: 0,
    // Objective: { state: 'none' | 'planting' | 'planted' | 'defusing' | 'detonated' | 'defused',
    //   site: 'A' | 'B' | null, progress: 0..1, left: seconds }
    plant: { state: 'none', site: null, progress: 0, left: 0 },
    // Loud events bots can hear: { pos: Vector3, at: seconds, team: 'V' | 'E' | null }
    noise: null,
    // Kill feed lines, newest last: { text, at }
    feed: [],
    // Round-end banner: { title, copy } or null
    banner: null,
    // Buy phase countdown; 0 means waiting on the player to press Ready / B.
    buyLeft: 0,
    elapsed: 0,
    // Agents (player + bots) register here so combat and the HUD see one list.
    agents: [],
    // The site the attackers chose this round ('A' | 'B').
    attackSite: 'A',
    // True while a screenshot pose is running; the sim is frozen by main.js.
    shotMode: null,
    rngSeed: 1,
  };
}

// A deterministic PRNG so screenshot poses and bot behaviour are reproducible.
export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tmpVector() {
  return new THREE.Vector3();
}
