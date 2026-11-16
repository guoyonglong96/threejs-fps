// All DOM: health and ammo readouts, timer and score, killfeed, banners,
// prompts, the buy menu and the start / end screens. The game calls setters;
// this module never touches the simulation.
import { WEAPONS, ARMOR_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    hpnum: $('hpnum'),
    hpbar: $('hpbar'),
    armorbar: $('armorbar'),
    armorval: $('armorval'),
    weaponname: $('weaponname'),
    ammo: $('ammo'),
    money: $('money'),
    slots: $('slots'),
    timer: $('timer'),
    scoreVan: $('scoreVan'),
    scoreEmb: $('scoreEmb'),
    pipsVan: $('pipsVan'),
    pipsEmb: $('pipsEmb'),
    bombline: $('bombline'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    prompt: $('prompt'),
    progress: $('progress'),
    hint: $('hint'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    dmg: $('dmg'),
    lowhp: $('lowhp'),
    startScreen: $('startScreen'),
    buyScreen: $('buyScreen'),
    endScreen: $('endScreen'),
    buyGrid: $('buyGrid'),
    buyCash: $('buyCash'),
    buyTag: $('buyTag'),
  };
  let hitTimer = 0;
  let dmgTimer = 0;

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function show(el, on) {
    el.classList.toggle('hidden', !on);
  }

  return {
    setVitals(hp, armor) {
      els.hpnum.textContent = Math.max(0, Math.ceil(hp));
      els.hpnum.classList.toggle('low', hp <= 30);
      els.hpbar.style.width = `${Math.max(0, hp)}%`;
      els.armorbar.firstElementChild.style.width = `${Math.max(0, armor)}%`;
      els.armorval.textContent = armor > 0 ? `ARMOUR ${Math.ceil(armor)}` : '';
      els.lowhp.style.opacity = hp > 0 && hp <= 30 ? 0.55 + 0.35 * Math.sin(performance.now() / 300) : 0;
    },
    setAmmo(def, mag, reserve, reloading, slots, current) {
      els.weaponname.textContent = def.name;
      els.ammo.innerHTML = `${mag} <span class="res">/ ${reserve}</span>`;
      els.ammo.classList.toggle('reloading', reloading);
      els.slots.innerHTML = slots.map((s, i) => `<b>${i + 1}</b> ${s}`).join(' &nbsp; ');
    },
    setMoney(m) {
      els.money.textContent = `$${m}`;
    },
    setTimer(t) {
      els.timer.textContent = fmtTime(t);
      els.timer.classList.toggle('low', t <= 15);
    },
    setScore(van, emb, vanAlive, embAlive) {
      els.scoreVan.textContent = van;
      els.scoreEmb.textContent = emb;
      els.pipsVan.textContent = '●'.repeat(vanAlive) + '○'.repeat(Math.max(0, 5 - vanAlive));
      els.pipsEmb.textContent = '●'.repeat(embAlive) + '○'.repeat(Math.max(0, 5 - embAlive));
    },
    setBomb(timer) {
      if (timer === null) {
        show(els.bombline, false);
      } else {
        show(els.bombline, true);
        els.bombline.textContent = `SPIKE PLANTED — ${fmtTime(timer)}`;
      }
    },
    feed(killer, killerTeam, weapon, victim, victimTeam) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="${killerTeam}">${killer}</span><span class="w">${weapon}</span><span class="${victimTeam}">${victim}</span>`;
      els.killfeed.prepend(div);
      while (els.killfeed.children.length > 4) els.killfeed.lastChild.remove();
      setTimeout(() => { div.style.opacity = '0.25'; }, 5000);
    },
    hitmarker(kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
      hitTimer = 0.12;
    },
    damageFlash() {
      els.dmg.style.opacity = 0.9;
      dmgTimer = 0.25;
    },
    tick(dt) {
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) els.hitmarker.classList.remove('on');
      }
      if (dmgTimer > 0) {
        dmgTimer -= dt;
        els.dmg.style.opacity = Math.max(0, dmgTimer / 0.25) * 0.9;
      }
    },
    banner(big, sub, kind) {
      els.banner.querySelector('.big').textContent = big;
      els.banner.querySelector('.sub').textContent = sub || '';
      els.banner.className = kind || '';
      show(els.banner, true);
    },
    hideBanner() {
      show(els.banner, false);
    },
    prompt(html) {
      if (!html) {
        show(els.prompt, false);
        return;
      }
      els.prompt.innerHTML = html;
      show(els.prompt, true);
    },
    progress(label, frac) {
      if (label === null) {
        show(els.progress, false);
        return;
      }
      els.progress.querySelector('.label').textContent = label;
      els.progress.querySelector('.bar > i').style.width = `${Math.round(frac * 100)}%`;
      show(els.progress, true);
    },
    hint(text) {
      if (!text) {
        show(els.hint, false);
        return;
      }
      els.hint.textContent = text;
      show(els.hint, true);
    },
    setCrosshair(spread) {
      const gap = 2 + spread * 900;
      const lines = els.crosshair.querySelectorAll('i');
      lines[0].style.transform = `translateY(${-gap}px)`;
      lines[1].style.transform = `translateY(${gap}px)`;
      lines[2].style.transform = `translateX(${-gap}px)`;
      lines[3].style.transform = `translateX(${gap}px)`;
    },
    showStart(on) { show(els.startScreen, on); },
    showEnd(on) { show(els.endScreen, on); },
    showBuy(on) { show(els.buyScreen, on); },
    setEnd(victory, sub, stats) {
      $('endTitle').textContent = victory ? 'VICTORY' : 'DEFEAT';
      $('endTitle').style.color = victory ? 'var(--teal)' : 'var(--ember)';
      $('endSub').textContent = sub;
      $('stKills').textContent = stats.kills;
      $('stDeaths').textContent = stats.deaths;
      $('stPlants').textContent = stats.plants;
      $('stMoney').textContent = `$${stats.earned}`;
    },
    renderBuy(round, money, owned, current, onBuy, onClose, armor = 0) {
      els.buyTag.textContent = `BUY PHASE · ROUND ${round}`;
      els.buyCash.textContent = `$${money}`;
      els.buyGrid.innerHTML = '';
      const items = [
        ...Object.values(WEAPONS).map((w) => ({
          key: w.id === 'pistol' ? '1' : w.id === 'smg' ? '2' : w.id === 'rifle' ? '3' : '4',
          name: w.name,
          kind: w.kind.toUpperCase(),
          stats: `DMG ${w.damage} · MAG ${w.mag} · ${w.auto ? 'AUTO' : 'SEMI'}`,
          blurb: w.blurb,
          price: w.price,
          owned: owned.includes(w.id),
          id: w.id,
        })),
        {
          key: '5', name: 'KEVLAR ARMOUR', kind: 'ARMOUR', stats: 'Soaks half of every hit',
          blurb: '100 armour. One purchase per round.', price: ARMOR_PRICE,
          owned: armor >= 100, id: 'armor',
        },
      ];
      for (const it of items) {
        const div = document.createElement('div');
        const cant = !it.owned && money < it.price;
        div.className = 'buyitem' + (it.owned ? ' owned' : '') + (cant ? ' cant' : '');
        div.innerHTML = `<span class="key">${it.key}</span><div class="nm">${it.name}</div>` +
          `<div class="kind">${it.kind}</div><div class="st">${it.stats}<br>${it.blurb}</div>` +
          `<div class="price">${it.owned ? 'OWNED — click to equip' : '$' + it.price}</div>`;
        div.onclick = () => { if (!cant) onBuy(it.id); };
        els.buyGrid.appendChild(div);
      }
      $('buyGoBtn').onclick = onClose;
      $('buyCloseBtn').onclick = onClose;
    },
  };
}
