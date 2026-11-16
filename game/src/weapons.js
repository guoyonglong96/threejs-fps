// Weapon catalogue and the first-person view model. Every gun is hitscan
// with its own damage, fire gap, spread curve, recoil kick and magazine; the
// view model, muzzle flash and reload dip are built from boxes and a light.
// Spread punishes moving and spraying: standing still and tapping stays tight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 SIDEKICK', kind: 'pistol', price: 0,
    damage: 22, headMult: 2, mag: 12, reserve: 60, gap: 0.16, auto: false,
    reload: 1.3, spreadStill: 0.004, spreadMove: 0.02, kick: 0.011, range: 60,
    blurb: 'Reliable sidearm. Free, forever.',
  },
  smg: {
    id: 'smg', name: 'MP-5 HORNET', kind: 'smg', price: 1500,
    damage: 18, headMult: 2, mag: 30, reserve: 120, gap: 0.075, auto: true,
    reload: 1.7, spreadStill: 0.007, spreadMove: 0.026, kick: 0.008, range: 55,
    blurb: 'Fast hose. Melts up close, fades at range.',
  },
  rifle: {
    id: 'rifle', name: 'VK-47', kind: 'rifle', price: 2700,
    damage: 30, headMult: 2, mag: 30, reserve: 90, gap: 0.1, auto: true,
    reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.014, range: 80,
    blurb: 'The workhorse. Tap it, don\'t hose it.',
  },
  sniper: {
    id: 'sniper', name: 'LONGSHOT', kind: 'sniper', price: 4750,
    damage: 95, headMult: 2, mag: 5, reserve: 20, gap: 1.15, auto: false,
    reload: 2.6, spreadStill: 0.0006, spreadMove: 0.05, kick: 0.05, range: 120,
    blurb: 'One shot, one gone. Right-click to scope.',
  },
};

export const ARMOR_PRICE = 650;

const VIEWMODEL_SHAPES = {
  pistol: { receiver: [0.07, 0.09, 0.24], barrel: [0.04, 0.04, 0.16], stock: null, sight: 0.05 },
  smg: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.3], stock: [0.06, 0.07, 0.18], sight: 0.05 },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22], sight: 0.07 },
  sniper: { receiver: [0.09, 0.11, 0.5], barrel: [0.035, 0.035, 0.62], stock: [0.07, 0.08, 0.26], sight: 0.12 },
};

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(model);
  camera.add(flash);
  camera.add(flashLight);

  let shape = null;
  function build(kind) {
    while (model.children.length) model.remove(model.children[0]);
    const s = VIEWMODEL_SHAPES[kind];
    shape = s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...s.receiver), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...s.barrel), grip);
    barrel.position.set(0, 0.025, -s.receiver[2] / 2 - s.barrel[2] / 2 + 0.06);
    model.add(receiver, barrel);
    if (s.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...s.stock), grip);
      stock.position.set(0, -0.02, s.receiver[2] / 2 + s.stock[2] / 2 - 0.04);
      model.add(stock);
    }
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, s.sight * 0.6, 0.04), accent);
    sight.position.set(0, s.receiver[1] / 2 + s.sight * 0.3, -0.05);
    model.add(sight);
    model.scale.setScalar(0.8);
    model.position.set(0.26, -0.23, -0.45);
    flash.position.set(0.26, -0.2, -0.45 - s.receiver[2] / 2 - s.barrel[2] + 0.1);
    flashLight.position.set(0.26, -0.18, -0.62);
  }

  const state = {
    def: WEAPONS.rifle, mag: 30, reserve: 90,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
    scoping: false,
  };

  function equip(def) {
    state.def = def;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.bloom = 0;
    build(def.kind);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.45 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.scoping && state.def.kind === 'sniper') {
      model.position.set(0, -0.15, -0.32);
      model.rotation.x = 0;
    } else {
      model.position.x = 0.26;
      model.position.y = -0.23;
    }
    flash.visible = state.flash > 0;
    if (flash.visible) flash.rotation.z = Math.random() * Math.PI;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const t = 1 - state.reloadLeft / state.def.reload;
      model.rotation.x = -0.55 * Math.sin(t * Math.PI);
      model.position.y = -0.23 - 0.09 * Math.sin(t * Math.PI);
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
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = state.def.kind === 'sniper' ? 0.09 : 0.055;
      state.bloom = Math.min(1, state.bloom + (state.def.kind === 'smg' ? 0.09 : 0.16));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reload;
      return true;
    },
    spread(speed, moving) {
      const still = state.def.spreadStill;
      const move = state.def.spreadMove;
      const speedPart = Math.min(1, speed / 5.2) * move;
      const crouchBonus = moving ? 0 : 0;
      return still + speedPart + state.bloom * 0.02 + crouchBonus;
    },
    setScope(on) {
      state.scoping = on && state.def.kind === 'sniper';
    },
  };
}
