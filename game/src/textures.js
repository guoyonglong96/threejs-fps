// Procedural canvas textures: no image files, no network. Each texture is
// drawn once at boot and reused across the map.
import * as THREE from 'three';

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

let seed = 1234567;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

export function makeTextures() {
  // Concrete floor: slabs, stains, expansion joints, faint tyre arcs.
  const floor = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3f45';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 60, 12 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,154,60,0.20)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(w * 0.5, h * 0.5, 150, 0.4, 2.2); g.stroke();
  }, 8, 6);

  // Corrugated container side, tinted per container colour.
  function container(base) {
    return canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(x, 0, 5, h);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(x + 9, 0, 3, h);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rnd() > 0.6 ? 'rgba(60,30,10,0.25)' : 'rgba(255,255,255,0.04)';
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 8, 1 + rnd() * 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 0, w, 6);
      g.fillRect(0, h - 6, w, 6);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = 'bold 20px monospace';
      g.fillText('Y7-' + (100 + Math.floor(rnd() * 800)), 14, 30);
      g.font = '11px monospace';
      g.fillText('NEON BREACH TERMINAL', 14, h - 14);
    });
  }

  // Hazard chevrons for site gates and crate edges.
  const hazard = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8b93a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#15181d';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath();
      g.moveTo(x, h); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h);
      g.closePath(); g.fill();
    }
  }, 2, 1);

  // Crate wood with stencil.
  const crate = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#7a6a4f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.moveTo(w - 4, 4); g.lineTo(4, h - 4); g.stroke();
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(rnd() * w, rnd() * h, 2, 1 + rnd() * 5);
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = 'bold 15px monospace';
    g.fillText('YARD-7', 34, 68);
  });

  // Big site letter painted on the ground.
  function siteLetter(letter, color) {
    return canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      g.globalAlpha = 0.85;
      g.font = 'bold 190px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, w / 2, h / 2 + 8);
      g.globalAlpha = 1;
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.strokeRect(14, 14, w - 28, h - 28);
    });
  }

  // Dusk sky gradient for the backdrop dome.
  const sky = canvasTexture(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#141c2c');
    grad.addColorStop(0.45, '#2b3049');
    grad.addColorStop(0.72, '#6b4450');
    grad.addColorStop(0.88, '#c96a35');
    grad.addColorStop(1, '#e8964a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

  return {
    floor,
    hazard,
    crate,
    sky,
    siteA: siteLetter('A', '#35c4b5'),
    siteB: siteLetter('B', '#ff9a3c'),
    containerOrange: container('#c96a2e'),
    containerTeal: container('#2e7f7a'),
    containerOlive: container('#6b7040'),
    containerGrey: container('#5a636e'),
    containerRust: container('#8a4a30'),
    shade,
  };
}
