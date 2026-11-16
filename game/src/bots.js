// Bot agents: waypoint navigation, perception, burst fire, planting and
// defusing. Bots see with 2D line of sight against the world's colliders,
// walk a BFS path over the waypoint graph, and fight with sampled aim error
// so a moving target at range is hard and a still one up close is easy.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_DEFS = [
  { name: 'DUST', team: 'van', skill: 0.55 },
  { name: 'ORBIT', team: 'van', skill: 0.62 },
  { name: 'HAVOC', team: 'van', skill: 0.5 },
  { name: 'MIRA', team: 'van', skill: 0.68 },
  { name: 'VOLT', team: 'emb', skill: 0.6 },
  { name: 'ASH', team: 'emb', skill: 0.52 },
  { name: 'REAPER', team: 'emb', skill: 0.66 },
  { name: 'GHOST', team: 'emb', skill: 0.58 },
  { name: 'NOVA', team: 'emb', skill: 0.63 },
];

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

function nameTexture(name, teamColor) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,0.55)';
  g.beginPath();
  g.roundRect(28, 10, 200, 44, 8);
  g.fill();
  g.fillStyle = teamColor;
  g.fillRect(28, 10, 8, 44);
  g.fillStyle = '#eef1f4';
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 132, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBots(scene, world, hooks) {
  const bots = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();

  // Health bars are children of the rotated bot group, so they billboard by
  // cancelling the group's world rotation against the camera's.
  function billboard(bot) {
    bot.group.getWorldQuaternion(tmpQ);
    tmpQ2.copy(hooks.camera.quaternion);
    bot.group.userData.bar.quaternion.copy(tmpQ.invert().multiply(tmpQ2));
  }

  function buildMesh(bot) {
    const teamColor = bot.team === 'van' ? PALETTE.teal : PALETTE.ember;
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8, metalness: 0.15 });
    const trim = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5, metalness: 0.3 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.95, 10), suit);
    body.position.y = 0.95;
    body.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.12), trim);
    chest.position.set(0, 1.15, 0.24);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05), trim);
    visor.position.set(0, 1.64, 0.19);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), suit);
    gun.position.set(0.24, 1.15, -0.2);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), suit);
    legL.position.set(-0.13, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    group.add(body, chest, head, visor, gun, legL, legR);
    group.userData = { bot, head, body };

    const nameTex = nameTexture(bot.name, bot.team === 'van' ? '#35c4b5' : '#ff5a3c');
    const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthWrite: false }));
    nameSprite.scale.set(1.9, 0.48, 1);
    nameSprite.position.y = 2.15;
    group.add(nameSprite);

    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x0c0f14, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    const barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.06),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    barFg.position.z = 0.001;
    const bar = new THREE.Group();
    bar.add(barBg, barFg);
    bar.position.y = 1.95;
    group.add(bar);
    group.userData.barFg = barFg;
    group.userData.bar = bar;
    scene.add(group);
    return group;
  }

  for (const def of BOT_DEFS) {
    const bot = {
      ...def,
      hp: 100,
      alive: true,
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      speed: 3.6 + def.skill * 1.2,
      state: 'advance',
      path: [],
      pathIndex: 0,
      target: null,
      targetIsPlayer: false,
      lastSeen: 0,
      reaction: 0,
      aimError: 0.035 + (1 - def.skill) * 0.05,
      fireCooldown: 0,
      burstLeft: 0,
      burstPause: 0,
      perceiveAt: 0,
      role: 'attack',
      site: 'A',
      hasBomb: false,
      plantProgress: 0,
      defuseProgress: 0,
      strafeDir: 1,
      strafeAt: 0,
      damageFlash: 0,
      deathAt: 0,
      lastX: 0,
      lastZ: 0,
      stuckAt: 0,
      group: null,
    };
    bot.group = buildMesh(bot);
    bots.push(bot);
  }

  function resetRound(round, rng) {
    const vanSpawns = world.spawns.van;
    const embSpawns = world.spawns.emb;
    let vi = 0;
    let ei = 0;
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.state = 'advance';
      bot.target = null;
      bot.targetIsPlayer = false;
      bot.path = [];
      bot.pathIndex = 0;
      bot.fireCooldown = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.damageFlash = 0;
      bot.stuckAt = 0;
      bot.lastX = 0;
      bot.lastZ = 0;
      bot.hasBomb = false;
      bot.group.rotation.set(0, 0, 0);
      bot.group.visible = true;
      bot.group.position.y = 0;
      if (bot.team === 'van') {
        const s = vanSpawns[vi++];
        bot.pos.set(s[0], 0, s[1]);
        bot.yaw = -Math.PI / 2;
        bot.role = 'attack';
      } else {
        const s = embSpawns[ei++];
        bot.pos.set(s[0], 0, s[1]);
        bot.yaw = Math.PI / 2;
        bot.role = 'defend';
      }
      // Attackers split across the two sites; one defender roams mid.
      const pick = rng();
      if (bot.team === 'van') {
        bot.site = pick < 0.55 ? 'A' : 'B';
      } else {
        bot.site = pick < 0.4 ? 'A' : pick < 0.8 ? 'B' : 'MID';
      }
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
      bot.group.userData.barFg.scale.x = 1;
      bot.group.userData.barFg.position.x = 0;
    }
    // The spike starts on the player: VANGUARD's carrier is you. A bot only
    // takes it if you drop it or dawdle with it (see match.js).
  }

  function setPath(bot, destNode) {
    const from = world.nearestNode(bot.pos.x, bot.pos.z);
    bot.path = world.findPath(from, destNode);
    bot.pathIndex = 0;
  }

  function siteNode(site) {
    const s = world.sites[site];
    return world.nearestNode(s.x, s.z);
  }

  function collideCircle(bot, dt) {
    const r = 0.4;
    for (const b of world.colliders) {
      if (b.max.y < 0.4) continue;
      const cx = Math.max(b.min.x, Math.min(bot.pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(bot.pos.z, b.max.z));
      const dx = bot.pos.x - cx;
      const dz = bot.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          bot.pos.x = cx + (dx / d) * r;
          bot.pos.z = cz + (dz / d) * r;
        } else {
          bot.pos.x += r;
        }
      }
    }
    bot.pos.x = Math.max(-31.4, Math.min(31.4, bot.pos.x));
    bot.pos.z = Math.max(-21.4, Math.min(21.4, bot.pos.z));
  }

  function visible(from, to, eyeH = 1.5) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 48) return false;
    return world.losClear(from.x, from.z, to.x, to.z);
  }

  function perceive(bot, player, now, dt) {
    if (now < bot.perceiveAt) return;
    bot.perceiveAt = now + 0.15;
    // Nearest visible enemy: the player or a bot of the other team.
    let best = null;
    let bestD = Infinity;
    let bestIsPlayer = false;
    if (player.alive && player.team !== bot.team) {
      const d = Math.hypot(player.pos.x - bot.pos.x, player.pos.z - bot.pos.z);
      if (d < bestD && visible(bot.pos, player.pos)) {
        best = player;
        bestD = d;
        bestIsPlayer = true;
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
      if (d < bestD && visible(bot.pos, other.pos)) {
        best = other;
        bestD = d;
        bestIsPlayer = false;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.reaction = now + 0.45 + (1 - bot.skill) * 0.45 + Math.random() * 0.15;
      }
      bot.target = best;
      bot.targetIsPlayer = bestIsPlayer;
      bot.lastSeen = now;
      bot.state = 'engage';
    } else if (bot.target && now - bot.lastSeen > 1.6) {
      bot.target = null;
      bot.targetIsPlayer = false;
      bot.state = bot.role === 'defend' ? 'hold' : 'advance';
    }
  }

  function fireAt(bot, target, now, dt) {
    if (now < bot.reaction) return;
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 4 + Math.floor(Math.random() * 3);
      bot.burstPause = 0;
    }
    if (bot.fireCooldown > 0) return;
    bot.fireCooldown = 0.11;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = 0.5 + Math.random() * 0.5;

    // Aim: chest point plus sampled error that grows with range and motion.
    const targetPos = tmp.copy(target.pos);
    const dist = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    const moving = target.vel ? Math.hypot(target.vel.x, target.vel.z) : 0;
    const err = bot.aimError * (1 + dist / 30) * (1 + moving / 8) * (bot.moving ? 1.4 : 1);
    const aimX = targetPos.x + (Math.random() * 2 - 1) * err * dist;
    const aimZ = targetPos.z + (Math.random() * 2 - 1) * err * dist;
    const aimY = 1.25 + (Math.random() * 2 - 1) * err * dist * 0.7;
    const headY = 1.62;
    const isHead = Math.abs(aimY - headY) < 0.2 && Math.hypot(aimX - targetPos.x, aimZ - targetPos.z) < 0.24;
    const bodyHit = Math.hypot(aimX - targetPos.x, aimZ - targetPos.z) < 0.46 && aimY > 0.4 && aimY < 1.9;
    const muzzle = tmp2.set(bot.pos.x, 1.35, bot.pos.z);
    const end = new THREE.Vector3(aimX, aimY, aimZ);
    hooks.onShot(bot, muzzle.clone(), end, dist);
    if (bodyHit || isHead) {
      // Shots at the player are softened: the player should survive a burst
      // or two, while bot-on-bot fights stay lethal.
      let dmg = (isHead ? 56 : 28) * (dist > 30 ? 0.8 : 1);
      if (bot.targetIsPlayer) dmg *= 0.65;
      if (bot.targetIsPlayer) hooks.onDamagePlayer(dmg, bot, isHead);
      else hooks.onDamageBot(target, dmg, isHead, bot);
    }
  }

  // Walk the waypoint path toward dest. With keepYaw the bot translates
  // toward the node without turning, so it can keep its aim on a target
  // while pushing an objective.
  function followPath(bot, dest, dt, now, keepYaw = false) {
    if (dest === null) return;
    if (!bot.path.length || bot.path[bot.path.length - 1] !== dest) setPath(bot, dest);
    if (bot.pathIndex >= bot.path.length) return;
    const node = world.nodes[bot.path[bot.pathIndex]];
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      bot.pathIndex += 1;
      bot.stuckAt = now;
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
      return;
    }
    // Stuck detector: no progress toward the node for 1.5 s means the node
    // is unreachable from here, so skip it and move on.
    if (Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ) > 0.3) {
      bot.stuckAt = now;
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
    } else if (now - bot.stuckAt > 1.5) {
      bot.pathIndex += 1;
      bot.stuckAt = now;
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
      return;
    }
    if (keepYaw) {
      bot.pos.x += (dx / d) * bot.speed * 0.85 * dt;
      bot.pos.z += (dz / d) * bot.speed * 0.85 * dt;
    } else {
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += dyaw * Math.min(1, dt * 8);
      bot.pos.x += -Math.sin(bot.yaw) * bot.speed * dt;
      bot.pos.z += -Math.cos(bot.yaw) * bot.speed * dt;
    }
    bot.moving = true;
    collideCircle(bot, dt);
  }

  function update(dt, player, now, match) {
    // One VANGUARD bot goes for a dropped spike; the rest hold their jobs.
    let bombSeeker = null;
    if (match.bombDropped && !match.playerHasBomb && !bots.some((b) => b.hasBomb)) {
      let bd = Infinity;
      for (const b of bots) {
        if (!b.alive || b.team !== 'van') continue;
        const d = Math.hypot(match.bombDropped.x - b.pos.x, match.bombDropped.z - b.pos.z);
        if (d < bd) { bd = d; bombSeeker = b; }
      }
    }
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.damageFlash = Math.max(0, bot.damageFlash - dt);
      perceive(bot, player, now, dt);

      // A defender that reaches the planted spike starts defusing, target
      // or not: this check lives outside the movement branches on purpose.
      if (match.bomb && match.bomb.planted && bot.team === 'emb' && bot.defuseProgress === 0) {
        const d = Math.hypot(match.bomb.x - bot.pos.x, match.bomb.z - bot.pos.z);
        if (d < 2.2) {
          bot.defuseProgress = 0.001;
          hooks.onDefuseTick(bot, 0);
        }
      }

      // Planting / defusing channels pause movement and fire. Only taking
      // damage interrupts a channel: merely seeing an enemy must not, or
      // the spike would never get planted at a guarded site.
      if (bot.plantProgress > 0 && bot.plantProgress < 1) {
        const site = world.sites[bot.site];
        const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
        if (d < 4.5) {
          if (bot.damageFlash > 0) {
            bot.plantProgress = 0;
          } else {
            bot.plantProgress += dt / 4;
            hooks.onPlantTick(bot, bot.plantProgress);
            if (bot.plantProgress >= 1) hooks.onPlantDone(bot, bot.site);
          }
        } else {
          bot.plantProgress = 0;
        }
        continue;
      }
      if (bot.defuseProgress > 0 && bot.defuseProgress < 1) {
        const bomb = match.bomb;
        if (bomb && bomb.planted) {
          const d = Math.hypot(bomb.x - bot.pos.x, bomb.z - bot.pos.z);
          if (d < 2.2) {
            if (bot.damageFlash > 0) {
              bot.defuseProgress = Math.max(0, bot.defuseProgress - dt);
            } else {
              bot.defuseProgress += dt / 5;
              hooks.onDefuseTick(bot, bot.defuseProgress);
              if (bot.defuseProgress >= 1) hooks.onDefuseDone(bot);
            }
          } else {
            bot.defuseProgress = Math.max(0, bot.defuseProgress - dt / 5);
          }
        }
        continue;
      }

      // The carrier pushes for the plant: distant targets do not stop it.
      if (bot.hasBomb && bot.target) {
        const d = Math.hypot(bot.target.pos.x - bot.pos.x, bot.target.pos.z - bot.pos.z);
        if (d > 15) bot.target = null;
      }

      if (bot.target) {
        // Face the target, strafe a little, and fire in bursts.
        const tp = bot.target.pos;
        const wantYaw = Math.atan2(-(tp.x - bot.pos.x), -(tp.z - bot.pos.z));
        let dyaw = wantYaw - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.yaw += dyaw * Math.min(1, dt * 10);
        if (match.bomb && match.bomb.planted && bot.team === 'emb') {
          // After a plant the defence must close on the spike instead of
          // trading shots from range: walk the waypoint path at it, aim
          // staying on the target, and keep firing.
          followPath(bot, world.nearestNode(match.bomb.x, match.bomb.z), dt, now, true);
        } else {
          if (now > bot.strafeAt) {
            bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
            bot.strafeAt = now + 0.7 + Math.random() * 0.9;
          }
          const sx = Math.cos(bot.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.yaw) * bot.strafeDir;
          bot.pos.x += sx * 1.1 * dt;
          bot.pos.z += sz * 1.1 * dt;
          bot.moving = true;
          collideCircle(bot, dt);
        }
        fireAt(bot, bot.target, now, dt);
      } else {
        bot.moving = false;
        // Objective movement.
        let dest = null;
        if (bombSeeker === bot && match.bombDropped) {
          const d = Math.hypot(match.bombDropped.x - bot.pos.x, match.bombDropped.z - bot.pos.z);
          if (d < 1.2) {
            bot.hasBomb = true;
            match.bombDropped = null;
            hooks.onBombPickup(bot);
          } else {
            dest = world.nearestNode(match.bombDropped.x, match.bombDropped.z);
          }
        } else if (match.bomb && match.bomb.planted) {
          dest = world.nearestNode(match.bomb.x, match.bomb.z);
        } else if (bot.team === 'van') {
          if (bot.hasBomb) {
            const site = world.sites[bot.site];
            const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
            if (d < 4.5) {
              bot.plantProgress = 0.001;
              hooks.onPlantTick(bot, 0);
              continue;
            }
            dest = siteNode(bot.site);
          } else {
            dest = siteNode(bot.site);
          }
        } else if (bot.role === 'defend') {
          dest = bot.site === 'MID' ? world.nearestNode(0, 0) : siteNode(bot.site);
          // Late in the round the defence pushes out to hunt, so rounds do
          // not stall into timeouts with both teams holding ground.
          if (match.roundTime < 40 && bot.site !== 'MID') dest = world.nearestNode(0, 0);
        } else {
          dest = siteNode(bot.site);
        }
        if (dest !== null) followPath(bot, dest, dt, now);
      }

      // Sync the mesh.
      bot.group.position.set(bot.pos.x, 0, bot.pos.z);
      bot.group.rotation.y = bot.yaw;
      bot.group.userData.barFg.scale.x = Math.max(0.001, bot.hp / 100);
      bot.group.userData.barFg.position.x = -0.43 * (1 - bot.hp / 100);
      billboard(bot);
      const flash = bot.damageFlash > 0;
      bot.group.userData.body.material.emissive.setHex(flash ? 0x661111 : 0x000000);
    }
  }

  function damage(bot, dmg, isHead) {
    if (!bot.alive) return false;
    bot.hp -= dmg;
    bot.damageFlash = 0.12;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.deathAt = performance.now() / 1000;
      bot.group.rotation.z = Math.PI / 2;
      bot.group.position.y = -0.4;
      bot.group.userData.bar.visible = false;
      if (bot.hasBomb) {
        bot.hasBomb = false;
        hooks.onBombDropped(bot.pos.x, bot.pos.z);
      }
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  return {
    bots,
    resetRound,
    update,
    damage,
    aliveCount,
    syncPlates() {
      for (const bot of bots) if (bot.alive) billboard(bot);
    },
    carrier() {
      return bots.find((b) => b.hasBomb) || null;
    },
  };
}
