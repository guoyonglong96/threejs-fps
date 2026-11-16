// NEON BREACH — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. Owns shooting, tracers, the spike mesh, the
// player's plant channel, spectating, and the deterministic ?shot captures.
//
// ?shot=start|play|buy|end with &seed=N stages a frame, renders it twice,
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponView, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createMatch } from './match.js';

window.addEventListener('error', (e) => {
  document.title = `ERR: ${e.message}`;
});

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && match.phase === 'live' && !shot) hud.hint('Click the game to lock the mouse');
  else hud.hint(null);
});
const player = createPlayer(world.colliders);
const weaponView = createWeaponView(camera);

// Tracer pool: additive lines that fade in 90 ms.
const tracers = [];
for (let i = 0; i < 24; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function spawnTracer(from, to) {
  const t = tracers.find((x) => x.life <= 0) || tracers[0];
  const p = t.line.geometry.attributes.position;
  p.setXYZ(0, from.x, from.y, from.z);
  p.setXYZ(1, to.x, to.y, to.z);
  p.needsUpdate = true;
  t.life = 0.09;
  t.line.material.opacity = 0.9;
}

// Impact spark pool: small additive planes that face the camera.
const sparks = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.visible = false;
  scene.add(m);
  sparks.push({ mesh: m, life: 0 });
}
function spawnSpark(at) {
  const s = sparks.find((x) => x.life <= 0) || sparks[0];
  s.mesh.position.copy(at);
  s.mesh.visible = true;
  s.mesh.material.opacity = 0.9;
  s.life = 0.12;
}

// The spike: a dark case with a blinking core, planted or dropped.
const spike = new THREE.Group();
const spikeCase = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.22, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x1c2129, roughness: 0.4, metalness: 0.6 }),
);
spikeCase.position.y = 0.11;
const spikeCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 10, 8),
  new THREE.MeshBasicMaterial({ color: PALETTE.ember }),
);
spikeCore.position.y = 0.26;
const spikeLight = new THREE.PointLight(PALETTE.ember, 0, 8, 1.8);
spikeLight.position.y = 0.4;
spike.add(spikeCase, spikeCore, spikeLight);
spike.visible = false;
scene.add(spike);

// Explosion glow for the end capture.
const blastLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.4);
blastLight.position.set(-20, 3, -16);
scene.add(blastLight);

const raycaster = new THREE.Raycaster();
raycaster.far = 130;
const shootDir = new THREE.Vector3();
const muzzleWorld = new THREE.Vector3();

let plantProgress = 0;
let plantSite = null;
let semiArmed = true;

const bots = createBots(scene, world, {
  camera,
  onShot(bot, from, to, dist) {
    spawnTracer(from, to);
    audio.shot('rifle', Math.min(0.85, dist / 48));
  },
  onDamagePlayer(dmg, bot, isHead) {
    match.damagePlayer(dmg, bot, isHead);
  },
  onDamageBot(target, dmg, isHead, fromBot) {
    const died = bots.damage(target, dmg, isHead);
    if (died) match.onBotKill(fromBot, target);
  },
  onPlantTick(bot, progress) {
    if (progress >= 0 && bot.hasBomb) hud.progress('PLANTING SPIKE', Math.min(1, progress));
  },
  onPlantDone(bot, site) {
    bot.hasBomb = false;
    hud.progress(null);
    match.plant(site, false);
  },
  onDefuseTick(bot, progress) {
    if (progress > 0) hud.progress(`${bot.name} IS DEFUSING`, Math.min(1, progress));
  },
  onDefuseDone(bot) {
    hud.progress(null);
    match.endRound('emb', 'SPIKE DEFUSED');
  },
  onBombDropped(x, z) {
    hud.hint('Spike dropped — pick it up');
    setTimeout(() => hud.hint(null), 4000);
  },
  onBombPickup(bot) {
    hud.hint(`${bot.name} has the spike`);
    setTimeout(() => hud.hint(null), 4000);
  },
});

const match = createMatch({
  bots, player, weapon: weaponView, hud, audio, world,
});

// Debug handle for play-testing (used by the CDP driver): the match, the
// bots, the player, and the fixed-step simulation itself.
window.__game = { match, bots, player, weapon: weaponView, input, world, step: stepSim, render, shoot };

const playerAdapter = {
  get pos() { return player.state.position; },
  get vel() { return player.state.velocity; },
  get alive() { return match.match.playerAlive; },
  team: 'van',
};

function botHitMeshes() {
  const list = [];
  for (const b of bots.bots) {
    if (!b.alive) continue;
    list.push(b.group.userData.head, b.group.userData.body);
  }
  return list;
}

function shoot() {
  const def = weaponView.state.def;
  if (!weaponView.takeRound()) {
    audio.dry();
    return;
  }
  weaponView.pullTrigger();
  const spread = weaponView.spread(player.groundSpeed(), player.state.crouching);
  shootDir.set(
    (Math.random() * 2 - 1) * spread,
    (Math.random() * 2 - 1) * spread,
    -1,
  ).normalize().applyQuaternion(camera.quaternion);
  raycaster.set(camera.position, shootDir);
  raycaster.far = def.range;
  const targets = world.shootables.concat(botHitMeshes());
  const hits = raycaster.intersectObjects(targets, false);
  camera.localToWorld(muzzleWorld.set(0.26, -0.2, -1.0));
  const end = hits.length ? hits[0].point : camera.position.clone().addScaledVector(shootDir, def.range);
  spawnTracer(muzzleWorld.clone(), end);
  audio.shot(def.kind, 0);
  if (hits.length) {
    const hit = hits[0];
    const obj = hit.object;
    const owner = obj.parent && obj.parent.userData ? obj.parent.userData.bot : null;
    if (owner) {
      if (owner.team === 'van') {
        spawnSpark(hit.point);
      } else {
        const isHead = obj === owner.group.userData.head;
        const dmg = def.damage * (isHead ? def.headMult : 1);
        const died = bots.damage(owner, dmg, isHead);
        spawnSpark(hit.point);
        hud.hitmarker(died);
        if (!died) audio.hit();
        if (died) match.onPlayerKill(owner, isHead);
      }
    } else {
      spawnSpark(hit.point);
    }
  }
  const pitchKick = def.kick * (0.8 + Math.random() * 0.4);
  player.recoil(pitchKick, (Math.random() * 2 - 1) * def.kick * 0.4);
}

function updateSpikeMesh(now) {
  const m = match.match;
  if (m.bomb.planted) {
    spike.visible = true;
    spike.position.set(m.bomb.x, 0, m.bomb.z);
    const blink = Math.sin(now * (m.bomb.timer < 10 ? 14 : 6)) > 0;
    spikeCore.material.color.setHex(blink ? 0xff2a1a : 0x881111);
    spikeLight.intensity = blink ? 6 : 0.5;
  } else if (m.bombDropped) {
    spike.visible = true;
    spike.position.set(m.bombDropped.x, 0, m.bombDropped.z);
    spikeCore.material.color.setHex(0xff9a3c);
    spikeLight.intensity = 1.5;
  } else {
    spike.visible = false;
  }
}

function updatePlayerChannel(dt) {
  const m = match.match;
  if (m.phase !== 'live' || !m.playerAlive || m.bomb.planted || !m.playerHasBomb) {
    if (plantProgress > 0) {
      plantProgress = 0;
      plantSite = null;
      hud.progress(null);
    }
    return;
  }
  let near = null;
  for (const [key, s] of Object.entries(world.sites)) {
    if (Math.hypot(s.x - player.state.position.x, s.z - player.state.position.z) < 4.5) near = key;
  }
  if (near) {
    hud.prompt('Hold <b>E</b> to plant the spike at site ' + near);
  } else if (m.playerHasBomb) {
    hud.prompt('Carry the spike to site <b>A</b> or <b>B</b>');
  }
  if (near && input.keys.has('KeyE')) {
    if (plantSite !== near) {
      plantSite = near;
      plantProgress = 0;
    }
    plantProgress += dt / 4;
    hud.progress('PLANTING SPIKE', Math.min(1, plantProgress));
    if (plantProgress >= 1) {
      plantProgress = 0;
      plantSite = null;
      hud.progress(null);
      hud.prompt(null);
      match.plant(near, true);
    }
  } else {
    if (plantProgress > 0) {
      plantProgress = 0;
      plantSite = null;
      hud.progress(null);
    }
  }
}

function updateBombPickup() {
  const m = match.match;
  if (m.bombDropped && m.playerAlive && m.phase === 'live') {
    const d = Math.hypot(m.bombDropped.x - player.state.position.x, m.bombDropped.z - player.state.position.z);
    if (d < 1.5) {
      m.bombDropped = null;
      m.playerHasBomb = true;
      hud.hint('Spike secured — plant it at A or B');
      setTimeout(() => hud.hint(null), 3500);
      audio.buy();
    }
  }
}

function stepSim(dt, now) {
  const m = match.match;
  match.update(dt, now);

  if (m.phase === 'live' || m.phase === 'roundEnd') {
    if (m.playerAlive) {
      const look = input.consumeLook();
      player.look(look.dx, look.dy);
      player.step(dt, input.keys);
    }
    bots.update(dt, playerAdapter, now, m);

    // Firing.
    if (m.playerAlive && m.phase === 'live') {
      if (input.firing && weaponView.state.def.auto && weaponView.ready()) shoot();
      if (input.firing && !weaponView.state.def.auto && semiArmed && weaponView.ready()) {
        shoot();
        semiArmed = false;
      }
      if (!input.firing) semiArmed = true;
      if (input.pressed('KeyR') && weaponView.reload()) audio.reload();
      weaponView.setScope(input.scoping);
    }
    updatePlayerChannel(dt);
    updateBombPickup();
  }

  // Buy keys.
  if (input.pressed('KeyB') && m.phase === 'buy') match.deploy();
  if (m.phase === 'buy') {
    const buyKeys = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper', Digit5: 'armor' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (input.pressed(code)) match.buy(id);
    }
  }
  if (m.phase === 'live') {
    const slots = match.match.loadout.owned;
    for (let i = 0; i < slots.length; i++) {
      if (input.pressed('Digit' + (i + 1)) && slots[i] !== weaponView.state.def.id) {
        weaponView.equip(WEAPONS[slots[i]]);
        match.match.loadout.current = slots[i];
        audio.click();
      }
    }
  }

  weaponView.step(dt);
  hud.tick(dt);
  updateSpikeMesh(now);
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    }
  }
  for (const s of sparks) {
    if (s.life > 0) {
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.12);
      s.mesh.quaternion.copy(camera.quaternion);
      if (s.life <= 0) s.mesh.visible = false;
    }
  }
}

function render(now) {
  const m = match.match;
  // The camera always follows the player, in every phase, so the buy phase
  // and the captures look out of the player's eyes too.
  if (m.playerAlive) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  } else if (m.spectate) {
    const b = m.spectate;
    camera.position.set(b.pos.x, 1.6, b.pos.z);
    camera.rotation.set(0, b.yaw, 0);
  }
  const targetFov = weaponView.state.scoping ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  hud.setCrosshair(weaponView.spread(player.groundSpeed(), player.state.crouching));
  hud.setMoney(m.money);
  hud.setAmmo(weaponView.state.def, weaponView.state.mag, weaponView.state.reserve,
    weaponView.state.reloadLeft > 0,
    match.match.loadout.owned.map((id) => WEAPONS[id].name),
    weaponView.state.def.id);
  hud.setVitals(m.playerHp, m.playerArmor);
  renderer.render(scene, camera);
}

let last = performance.now() / 1000;
let acc = 0;
let frozen = false;

function frame() {
  if (frozen) return;
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  let dt = now - last;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const m = match.match;
  const paused = !shot && m.phase === 'live' && !input.locked && m.playerAlive;
  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= FIXED_STEP && n < 5) {
      stepSim(FIXED_STEP, now);
      acc -= FIXED_STEP;
      n += 1;
    }
  }
  render(now);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('deployBtn').addEventListener('click', () => {
  audio.unlock();
  input.requestLock();
  hud.showStart(false);
  match.startMatch();
});
document.getElementById('againBtn').addEventListener('click', () => {
  window.location.reload();
});

// Deterministic captures: stage a frame, render it twice, freeze.
function runShot(kind) {
  hud.showStart(false);
  hud.showEnd(false);
  match.startMatch();
  const m = match.match;
  if (kind === 'start') {
    // Buy phase at the VANGUARD spawn, team walking ahead into the yard.
    player.reset(-29, 0, -Math.PI / 2);
    const van = bots.bots.filter((b) => b.team === 'van');
    van[0].pos.set(-22, 0, -3);
    van[0].yaw = -Math.PI / 2;
    van[1].pos.set(-22, 0, 3);
    van[1].yaw = -Math.PI / 2;
    van[2].pos.set(-18, 0, 0);
    van[2].yaw = -Math.PI / 2;
    hud.showBuy(false);
    hud.setTimer(12);
  } else if (kind === 'buy') {
    m.money = 5200;
    match.buy('smg');
    match.buy('rifle');
    match.buy('armor');
    hud.renderBuy(1, m.money, m.loadout.owned, m.loadout.current, () => {}, () => {}, m.loadout.armor);
    hud.showBuy(true);
    player.reset(-29, 0, -Math.PI / 2);
  } else if (kind === 'play') {
    match.deploy();
    hud.hideBanner();
    m.roundTime = 72;
    m.scoreVan = 1;
    m.scoreEmb = 0;
    m.playerHp = 78;
    m.money = 3400;
    m.loadout.owned = ['pistol', 'rifle'];
    m.loadout.current = 'rifle';
    weaponView.equip(WEAPONS.rifle);
    weaponView.state.mag = 24;
    weaponView.state.reserve = 90;
    weaponView.pullTrigger();
    player.reset(-6, 0, 0.72);
    player.state.pitch = 0.02;
    const emb = bots.bots.filter((b) => b.team === 'emb');
    // VOLT and ASH are already down (see the killfeed); REAPER holds A.
    for (const dead of [emb[0], emb[1]]) {
      dead.alive = false;
      dead.hp = 0;
      dead.group.rotation.z = Math.PI / 2;
      dead.group.position.y = -0.4;
      dead.group.userData.bar.visible = false;
    }
    emb[0].pos.set(-14, 0, -12);
    emb[1].pos.set(-18, 0, -16);
    emb[2].pos.set(4, 0, -6);
    emb[2].yaw = Math.PI / 2 + 0.6;
    const van = bots.bots.filter((b) => b.team === 'van');
    van[0].pos.set(-9, 0, 3);
    van[0].yaw = 0.6;
    spawnTracer(new THREE.Vector3(-14, 1.35, -12), new THREE.Vector3(-6.5, 1.3, -0.5));
    spawnTracer(new THREE.Vector3(-6, 1.3, 0), new THREE.Vector3(-13.5, 1.3, -11.5));
    hud.feed('MIRA', 'van', 'VK-47', 'ASH', 'emb');
    hud.feed('YOU', 'van', 'VK-47', 'VOLT', 'emb');
    hud.setTimer(72);
    hud.setScore(1, 0, 5, 3);
  } else if (kind === 'end') {
    m.round = 4;
    m.scoreVan = 3;
    m.scoreEmb = 1;
    m.playerHp = 42;
    m.money = 4050;
    // Go live without deploy(): its banner timer would hide our end banner
    // under virtual time.
    m.phase = 'live';
    hud.showBuy(false);
    weaponView.equip(WEAPONS.rifle);
    weaponView.state.mag = 11;
    weaponView.state.reserve = 60;
    player.reset(-12, -8, 0.785);
    player.state.pitch = 0.05;
    const emb = bots.bots.filter((b) => b.team === 'emb');
    emb[0].alive = false;
    emb[0].group.rotation.z = Math.PI / 2;
    emb[0].group.position.y = -0.4;
    emb[0].group.userData.bar.visible = false;
    emb[0].pos.set(-16, 0, -12);
    emb[1].pos.set(-24, 0, -12);
    emb[1].yaw = -Math.PI / 2;
    blastLight.position.set(-20, 3, -16);
    blastLight.intensity = 90;
    hud.banner('ROUND WON', 'SPIKE DETONATED · VANGUARD 3 — 1 EMBER', 'win');
    hud.setScore(3, 1, 4, 2);
    hud.setTimer(0);
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    bot.group.position.set(bot.pos.x, 0, bot.pos.z);
    bot.group.rotation.y = bot.yaw;
  }
  bots.syncPlates();
  updateSpikeMesh(performance.now() / 1000);
  // Render on animation frames, like the kit starter: draws made outside a
  // frame are never presented to the compositor, so a synchronous render
  // here would screenshot as the clear colour only.
  let painted = 0;
  function paint() {
    if (frozen) return;
    render(performance.now() / 1000);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

if (shot) {
  runShot(shot);
} else {
  requestAnimationFrame(frame);
}
