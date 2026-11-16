// Round flow and economy: first to 5 (max 9 rounds), 100 s rounds, win by
// elimination or by the objective, money that persists across rounds.
import { PHASES, ROUND_TARGET, ROUND_TIME, PLANT_TIME, DEFUSE_TIME, DETONATE_TIME } from './state.js';
import { WEAPONS, ARMOUR_PRICE, GRENADE_PRICE } from './weapons.js';

const WIN_BONUS = 300;
const LOSS_BONUS = 150;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;
const BUY_SECONDS = 20;

export function createRounds(state, hooks) {
  // hooks: { onRoundStart(site), onRoundEnd(winner, reason), onMatchEnd(winner), onBuy() }
  function aliveCount(team) {
    return state.agents.filter((a) => a.team === team && a.alive).length;
  }

  function startBuy() {
    state.phase = PHASES.BUY;
    state.buyLeft = BUY_SECONDS;
    state.plant = { state: 'none', site: null, progress: 0, left: 0 };
    state.attackSite = Math.random() < 0.5 ? 'A' : 'B';
    state.banner = null;
    hooks.onBuy();
  }

  function startRound() {
    state.phase = PHASES.LIVE;
    state.timer = ROUND_TIME;
    state.banner = null;
    hooks.onRoundStart(state.attackSite);
  }

  function endRound(winner, reason) {
    if (state.phase !== PHASES.LIVE) return;
    state.phase = PHASES.ROUND_END;
    state.score[winner] += 1;
    state.money += winner === 'V' ? WIN_BONUS : LOSS_BONUS;
    const titles = {
      elimination: winner === 'V' ? 'Vanguard wins the round' : 'Ember wins the round',
      detonation: 'Charge detonated — Vanguard wins the round',
      defuse: 'Charge defused — Ember wins the round',
      time: 'Time expired — Ember wins the round',
    };
    state.banner = { title: titles[reason] || titles.elimination, copy: `Vanguard ${state.score.V} — ${state.score.E} Ember · Round ${state.round} of 9` };
    hooks.onRoundEnd(winner, reason);
  }

  function endMatch() {
    state.phase = PHASES.MATCH_END;
    const winner = state.score.V > state.score.E ? 'V' : 'E';
    state.banner = {
      title: winner === 'V' ? 'Vanguard takes the match' : 'Ember takes the match',
      copy: `Final score Vanguard ${state.score.V} — ${state.score.E} Ember. Click to play again.`,
    };
    hooks.onMatchEnd(winner);
  }

  function nextRound() {
    if (state.score.V >= ROUND_TARGET || state.score.E >= ROUND_TARGET || state.round >= 9) {
      endMatch();
      return;
    }
    state.round += 1;
    startBuy();
  }

  function awardKill() {
    state.money += KILL_BONUS;
    state.kills += 1;
  }

  function awardPlant() {
    state.money += PLANT_BONUS;
  }

  function buy(itemId) {
    if (state.phase !== PHASES.BUY) return false;
    const player = state.agents.find((a) => a.kind === 'player');
    if (itemId === 'armour') {
      if (state.money < ARMOUR_PRICE || player.armour >= 100) return false;
      state.money -= ARMOUR_PRICE;
      player.armour = 100;
      return true;
    }
    if (itemId === 'grenade') {
      if (state.money < GRENADE_PRICE || player.grenades >= 1) return false;
      state.money -= GRENADE_PRICE;
      player.grenades += 1;
      return true;
    }
    const def = WEAPONS[itemId];
    if (!def || state.money < def.price) return false;
    if (player.def.id === itemId) return false;
    state.money -= def.price;
    hooks.onEquip(def);
    return true;
  }

  function step(dt) {
    if (state.phase === PHASES.BUY) {
      state.buyLeft -= dt;
      if (state.buyLeft <= 0) startRound();
      return;
    }
    if (state.phase !== PHASES.LIVE) return;
    state.timer -= dt;
    if (state.plant.state === 'planted') {
      state.plant.left -= dt;
      if (state.plant.left <= 0) {
        state.plant.state = 'detonated';
        endRound('V', 'detonation');
        return;
      }
    }
    if (state.timer <= 0 && state.plant.state !== 'planted') {
      endRound('E', 'time');
      return;
    }
    if (aliveCount('V') === 0) { endRound('E', 'elimination'); return; }
    if (aliveCount('E') === 0) { endRound('V', 'elimination'); }
  }

  return {
    startBuy, startRound, endRound, nextRound, awardKill, awardPlant, buy, step,
    aliveCount,
    plantTime: PLANT_TIME, defuseTime: DEFUSE_TIME, detonateTime: DETONATE_TIME,
  };
}
