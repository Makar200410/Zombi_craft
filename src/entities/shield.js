import * as THREE from 'three';

// Pixel-art heater shields for guards: 'wood' (planks, iron rim, village emblem) or 'iron' (after smithing).
const cache = new Map();

function drawShield(kind) {
  const W = 20, H = 24;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const inside = (x, y) => {
    // heater shape: straight top, sides narrowing to a point at the bottom
    const cx = (W - 1) / 2, t = y / (H - 1);
    const half = t < 0.55 ? W / 2 : (W / 2) * Math.cos((t - 0.55) / 0.45 * Math.PI / 2);
    return Math.abs(x - cx) <= half - 0.2;
  };
  const rim = kind === 'iron' ? ['#3c4048', '#8a909a'] : ['#3a3f46', '#9aa0a8'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    let col;
    if (edge) col = (x + y) % 3 ? rim[1] : rim[0];
    else if (kind === 'iron') { const v = 150 + ((x * 7 + y * 13) % 5) * 8 - (y > H * 0.6 ? 20 : 0); col = `rgb(${v - 12},${v - 6},${v})`; }
    else { const plank = Math.floor(x / 5); const base = [132, 92, 52]; const d = (plank % 2 ? -14 : 0) + ((y * 5 + x) % 7 === 0 ? -18 : 0) + (x % 5 === 0 ? -26 : 0);
      col = `rgb(${base[0] + d},${base[1] + d},${base[2] + d})`; }
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  // emblem: red field with a golden tower
  const em = kind === 'iron' ? '#2f5aa8' : '#a8302a';
  g.fillStyle = em; g.fillRect(6, 5, 8, 9); g.fillRect(7, 14, 6, 2); g.fillRect(8, 16, 4, 1);
  g.fillStyle = '#f0c850'; g.fillRect(9, 7, 2, 6); g.fillRect(8, 7, 1, 1); g.fillRect(11, 7, 1, 1); g.fillRect(8, 12, 4, 1);
  // boss rivets
  g.fillStyle = '#d8dce2'; for (const [x, y] of [[3, 3], [16, 3], [3, 11], [16, 11]]) g.fillRect(x, y, 1, 1);
  return c;
}

/** Returns a new Mesh (shared geometry/material per kind). Front face points +Z. `px` = model pixel size. */
export function makeShieldMesh(kind = 'wood', px = 1 / 16) {
  const key = kind + ':' + px.toFixed(4);
  let e = cache.get(key);
  if (!e) {
    const tex = new THREE.CanvasTexture(drawShield(kind));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(10 * px, 12 * px);
    const back = new THREE.MeshLambertMaterial({ color: kind === 'iron' ? 0x6a7078 : 0x5a3a1e });
    const backGeo = new THREE.BoxGeometry(3 * px, 8 * px, 0.8 * px);   // grip plank behind the face
    e = { geo, front, back, backGeo };
    cache.set(key, e);
  }
  const g = new THREE.Group();
  const face = new THREE.Mesh(e.geo, e.front); face.castShadow = true; face.position.z = 0.7 * px;
  const grip = new THREE.Mesh(e.backGeo, e.back); grip.castShadow = true;
  g.add(face, grip);
  return g;
}
