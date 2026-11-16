// Match state machine: rounds, economy, the spike, and the score. It owns
// the player's health, money and loadout, and turns bot and player events
// into round wins, banners and the next buy phase.
import { WEAPONS, ARMOR_PRICE } from './weapons.js';

const FIRST_TO = 5;
const MAX_ROUNDS = 9;
const ROUND_TIME = 100;
const BUY_TIME = 12;
const BOMB_TIME = 40;
const PLANT_TIME = 4;
const WIN_MONEY = 3250;
const LOSS_MONEY = 1900;
const KILL_MONEY = 300;
const PLANT_MONEY = 300;

export function createMatch(deps) {
  const { bots, player, weapon, hud, audio, world } = deps;

  const match = {
    phase: 'menu',
    round: 1,
    scoreVan: 0,
    scoreEmb: 0,
    money: 800,
    earned: 0,
    stats: { kills: 0, deaths: 0, plants: 0 },
    playerHp: 100,
    playerArmor: 0,
    playerAlive: true,
    playerHasBomb: false,
    bombDropped: null,
    bomb: { planted: false, site: null, x: 0, z: 0, timer: 0 },
    loadout: { owned: ['pistol'], current: 'pistol', armor: 0 },
    roundTime: ROUND_TIME,
    buyTime: BUY_TIME,
    roundEndAt: 0,
    lastBeep: -1,
    spectate: null,
  };

  function syncHud() {
    hud.setMoney(match.money);
    hud.setScore(match.scoreVan, match.scoreEmb, bots.aliveCount('van') + (match.playerAlive ? 1 : 0), bots.aliveCount('emb'));
    hud.setBomb(match.bomb.planted ? match.bomb.timer : null);
  }

  function startMatch() {
    match.phase = 'buy';
    match.round = 1;
    match.scoreVan = 0;
    match.scoreEmb = 0;
    match.money = 800;
    match.earned = 0;
    match.stats = { kills: 0, deaths: 0, plants: 0 };
    match.loadout = { owned: ['pistol'], current: 'pistol', armor: 0 };
    startRound();
  }

  function startRound() {
    match.bomb = { planted: false, site: null, x: 0, z: 0, timer: 0 };
    match.bombDropped = null;
    match.playerHasBomb = true;
    match.playerAlive = true;
    match.playerHp = 100;
    match.playerArmor = match.loadout.armor;
    match.roundTime = ROUND_TIME;
    match.buyTime = BUY_TIME;
    match.phase = 'buy';
    match.lastBeep = -1;
    match.spectate = null;
    const spawn = world.spawns.van[0];
    player.reset(spawn[0], spawn[1], -Math.PI / 2);
    weapon.equip(WEAPONS[match.loadout.current]);
    const rng = mulberry(match.round * 7919 + 13);
    bots.resetRound(match.round, rng);
    hud.hideBanner();
    hud.prompt(null);
    hud.progress(null);
    hud.renderBuy(match.round, match.money, match.loadout.owned, match.loadout.current,
      (id) => buy(id), () => deploy(), match.loadout.armor);
    hud.showBuy(true);
    syncHud();
    hud.setTimer(match.roundTime);
    hud.setVitals(match.playerHp, match.playerArmor);
  }

  function mulberry(initial) {
    let a = initial;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buy(id) {
    if (id === 'armor') {
      if (match.money < ARMOR_PRICE || match.loadout.armor >= 100) return;
      match.money -= ARMOR_PRICE;
      match.loadout.armor = 100;
      audio.buy();
    } else {
      const def = WEAPONS[id];
      if (!def) return;
      if (match.loadout.owned.includes(id)) {
        match.loadout.current = id;
        weapon.equip(def);
        audio.click();
      } else {
        if (match.money < def.price) return;
        match.money -= def.price;
        match.loadout.owned.push(id);
        match.loadout.current = id;
        weapon.equip(def);
        audio.buy();
      }
    }
    hud.renderBuy(match.round, match.money, match.loadout.owned, match.loadout.current,
      (next) => buy(next), () => deploy(), match.loadout.armor);
    syncHud();
  }

  function deploy() {
    if (match.phase !== 'buy') return;
    hud.showBuy(false);
    match.phase = 'live';
    audio.round();
    hud.banner(`ROUND ${match.round}`, match.playerHasBomb ? 'Plant the spike at A or B' : 'Take the yard', '');
    setTimeout(() => { if (match.phase === 'live') hud.hideBanner(); }, 2200);
    syncHud();
  }

  function plant(site, byPlayer) {
    if (match.bomb.planted) return;
    const s = world.sites[site];
    match.bomb = { planted: true, site, x: s.x, z: s.z, timer: BOMB_TIME };
    match.playerHasBomb = false;
    match.lastBeep = -1;
    if (byPlayer) {
      match.stats.plants += 1;
      match.money += PLANT_MONEY;
      match.earned += PLANT_MONEY;
    }
    audio.plant();
    hud.setBomb(match.bomb.timer);
    hud.banner('SPIKE PLANTED', `Detonation in ${BOMB_TIME}s — hold the site`, '');
    setTimeout(() => { if (match.phase === 'live') hud.hideBanner(); }, 2000);
    syncHud();
  }

  function damagePlayer(dmg, fromBot, isHead) {
    if (!match.playerAlive || match.phase !== 'live') return;
    let rest = dmg;
    if (match.playerArmor > 0) {
      const absorbed = Math.min(match.playerArmor, rest * 0.5);
      match.playerArmor -= absorbed;
      rest -= absorbed;
    }
    match.playerHp -= rest;
    audio.hurt();
    hud.damageFlash();
    hud.setVitals(match.playerHp, match.playerArmor);
    if (match.playerHp <= 0) {
      match.playerHp = 0;
      match.playerAlive = false;
      match.stats.deaths += 1;
      if (match.playerHasBomb) {
        match.playerHasBomb = false;
        match.bombDropped = { x: player.state.position.x, z: player.state.position.z };
      }
      const alive = bots.bots.filter((b) => b.alive && b.team === 'van');
      match.spectate = alive.length ? alive[0] : null;
      hud.banner('YOU ARE DOWN', match.spectate ? `Spectating ${match.spectate.name} — your team fights on` : 'VANGUARD is gone', 'lose');
      audio.lose();
    }
  }

  function onPlayerKill(victim, isHead, killerName) {
    match.stats.kills += 1;
    match.money += KILL_MONEY;
    match.earned += KILL_MONEY;
    hud.feed('YOU', 'van', isHead ? 'HEADSHOT' : weapon.state.def.name, victim.name, 'emb');
    audio.kill();
    syncHud();
    checkElimination();
  }

  function onBotKill(killer, victim) {
    const kTeam = killer ? killer.team : 'van';
    const kName = killer ? killer.name : 'YOU';
    hud.feed(kName, kTeam, killer ? 'VK-47' : '', victim.name, victim.team);
    checkElimination();
  }

  function checkElimination() {
    if (match.phase !== 'live') return;
    const vanAlive = bots.aliveCount('van') + (match.playerAlive ? 1 : 0);
    const embAlive = bots.aliveCount('emb');
    if (match.bomb.planted) {
      if (vanAlive === 0 && embAlive > 0) {
        // Defenders will defuse; let the bomb clock decide unless nobody
        // is left to defuse, in which case it still blows.
      }
      return;
    }
    if (embAlive === 0 && vanAlive > 0) endRound('van', 'EMBER ELIMINATED');
    else if (vanAlive === 0 && embAlive > 0) endRound('emb', 'VANGUARD ELIMINATED');
    else if (vanAlive === 0 && embAlive === 0) endRound('van', 'MUTUAL ELIMINATION — VANGUARD TAKES IT');
  }

  function endRound(winner, reason) {
    if (match.phase !== 'live') return;
    match.phase = 'roundEnd';
    if (winner === 'van') match.scoreVan += 1;
    else match.scoreEmb += 1;
    const playerWon = winner === 'van';
    match.money += playerWon ? WIN_MONEY : LOSS_MONEY;
    match.earned += playerWon ? WIN_MONEY : LOSS_MONEY;
    match.bomb = { planted: false, site: null, x: 0, z: 0, timer: 0 };
    hud.setBomb(null);
    hud.banner(
      playerWon ? 'ROUND WON' : 'ROUND LOST',
      `${reason} · VANGUARD ${match.scoreVan} — ${match.scoreEmb} EMBER`,
      playerWon ? 'win' : 'lose',
    );
    if (playerWon) audio.win(); else audio.lose();
    match.roundEndAt = performance.now() / 1000 + 4.5;
    syncHud();
  }

  function endMatch() {
    match.phase = 'matchEnd';
    const won = match.scoreVan > match.scoreEmb;
    hud.setEnd(won, `Final score VANGUARD ${match.scoreVan} — ${match.scoreEmb} EMBER · ${match.round} rounds on YARD-7`, match.stats);
    hud.showEnd(true);
    if (won) audio.win(); else audio.lose();
  }

  function update(dt, now) {
    if (match.phase === 'buy') {
      match.buyTime -= dt;
      hud.setTimer(match.buyTime);
      if (match.buyTime <= 0) deploy();
      return;
    }
    if (match.phase === 'roundEnd') {
      if (now >= match.roundEndAt) {
        hud.hideBanner();
        if (match.scoreVan >= FIRST_TO || match.scoreEmb >= FIRST_TO || match.round >= MAX_ROUNDS) {
          endMatch();
        } else {
          match.round += 1;
          startRound();
        }
      }
      return;
    }
    if (match.phase !== 'live') return;

    // The spike changes hands if its carrier dawdles: a bot takes over.
    if (!match.bomb.planted && match.playerHasBomb && match.playerAlive) {
      const nearSite = Object.values(world.sites).some(
        (s) => Math.hypot(s.x - player.state.position.x, s.z - player.state.position.z) < 6,
      );
      if (match.roundTime < 55 && !nearSite) {
        const alive = bots.bots.filter((b) => b.alive && b.team === 'van');
        if (alive.length) {
          const carrier = alive[Math.floor(Math.random() * alive.length)];
          match.playerHasBomb = false;
          carrier.hasBomb = true;
          hud.hint(`${carrier.name} takes the spike — cover them`);
          setTimeout(() => hud.hint(null), 4000);
        }
      }
    }

    if (match.bomb.planted) {
      match.bomb.timer -= dt;
      hud.setBomb(match.bomb.timer);
      const sec = Math.ceil(match.bomb.timer);
      if (sec !== match.lastBeep) {
        match.lastBeep = sec;
        audio.beep(sec <= 5);
      }
      if (match.bomb.timer <= 0) {
        audio.explosion();
        endRound('van', 'SPIKE DETONATED');
        return;
      }
    } else {
      match.roundTime -= dt;
      hud.setTimer(match.roundTime);
      if (match.roundTime <= 0) {
        endRound('emb', 'TIME EXPIRED — EMBER HOLDS');
        return;
      }
    }
    hud.setTimer(match.bomb.planted ? match.bomb.timer : match.roundTime);
    syncHud();
  }

  return {
    match,
    startMatch,
    startRound,
    deploy,
    buy,
    plant,
    damagePlayer,
    onPlayerKill,
    onBotKill,
    checkElimination,
    endRound,
    update,
    get phase() { return match.phase; },
  };
}
