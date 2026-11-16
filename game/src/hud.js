// The DOM HUD: health, armour, ammo, money, round score, timer, kill feed, buy
// menu, round banner, crosshair that grows with spread, and the plant/defuse
// progress bar. It never touches the simulation; main.js pushes numbers in.
import { BUY_ITEMS } from './weapons.js';

const COPY = {
  start: {
    title: 'Solar Foundry',
    copy: 'A round-based tactical FPS. Plant the charge at A or B — or eliminate Ember. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Solar Foundry',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerCopy = $('banner-copy');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const buyTimer = $('buy-timer');
  const progress = $('objective-progress');
  const progressFill = $('objective-fill');
  const progressLabel = $('objective-label');
  const damage = $('damage-vignette');
  const feedEl = $('killfeed');

  let hitTimer = 0;
  let last = {};
  let buyHandler = null;

  // Build the buy menu once from the weapon defs.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('div');
    row.className = 'buy-item';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-note">${item.note}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
    buyList.appendChild(row);
  }

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armour) {
      setText($('health-value'), 'hp', String(Math.max(0, Math.ceil(hp))));
      setText($('armour-value'), 'armour', String(Math.max(0, Math.ceil(armour))));
      $('health-bar').style.width = `${Math.max(0, hp)}%`;
      $('armour-bar').style.width = `${Math.max(0, armour)}%`;
    },
    setAmmo(mag, reserve, grenades) {
      setText($('ammo-mag'), 'mag', String(mag));
      setText($('ammo-reserve'), 'reserve', `/ ${reserve}`);
      setText($('grenade-count'), 'grenades', grenades > 0 ? `G ×${grenades}` : '');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { setText($('weapon-name'), 'weapon', name); },
    setMoney(value) {
      setText($('money-value'), 'money', `$${value}`);
      setText(buyMoney, 'buyMoney', `$${value}`);
    },
    setScore(v, e, round) {
      setText($('score-value'), 'score', `${v} — ${e}`);
      setText($('round-value'), 'round', `Round ${round} / 9`);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText($('timer-value'), 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      $('timer').classList.toggle('urgent', s <= 15);
    },
    setBuyTimer(seconds) {
      setText(buyTimer, 'buyTimer', seconds > 0 ? `Round starts in ${Math.ceil(seconds)}s — press B when ready` : 'Press B when ready');
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${4 + spreadPx}px`);
    },
    hitMarker(killed, headshot, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('headshot', headshot);
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on', 'headshot');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 220);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feedEl.appendChild(line);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
      setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
    },
    showBanner(bannerData) {
      if (!bannerData) { banner.hidden = true; return; }
      bannerTitle.textContent = bannerData.title;
      bannerCopy.textContent = bannerData.copy;
      banner.hidden = false;
    },
    hideBanner() { banner.hidden = true; },
    showBuy(money) {
      buyMenu.hidden = false;
      this.setMoney(money);
    },
    hideBuy() { buyMenu.hidden = true; },
    markBought(itemId, owned) {
      const row = buyList.querySelector(`[data-item="${itemId}"]`);
      if (row) row.classList.toggle('owned', owned);
    },
    onBuy(handler) { buyHandler = handler; },
    showObjective(label, progressValue) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(progressValue * 100)}%`;
    },
    hideObjective() { progress.hidden = true; },
    showOverlay(mode) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
