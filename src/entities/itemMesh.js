import * as THREE from 'three';
import { getItemSprite } from '../art/icons.js';

const cache = new Map();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * Extrudes a 32x32 item sprite into a 1-pixel-thick voxel mesh (1 unit = sprite width).
 * Origin at sprite bottom-left (the handle). Returns a new Mesh sharing cached geometry.
 */
export function makeItemMesh(itemIdOrCanvas) {
  const key = typeof itemIdOrCanvas === 'string' ? itemIdOrCanvas : itemIdOrCanvas;
  let geo = cache.get(key);
  if (!geo) {
    let canvas = null;
    try { canvas = typeof itemIdOrCanvas === 'string' ? getItemSprite(itemIdOrCanvas) : itemIdOrCanvas; } catch (e) { canvas = null; }
    if (!canvas) return null;
    geo = extrude(canvas);
    cache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function extrude(canvas) {
  const W = canvas.width, H = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const s = 1 / W, t = s * 1.2;   // thickness a little over a pixel
  const pos = [], nrm = [], col = [], idx = [];
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 127;
  const c = new THREE.Color();
  const quad = (p, n, shade) => {
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) { pos.push(p[i][0], p[i][1], p[i][2]); nrm.push(n[0], n[1], n[2]); col.push(c.r * shade, c.g * shade, c.b * shade); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!opaque(x, y)) continue;
    const i = (y * W + x) * 4;
    c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
    const x0 = x * s - 0.5 * 0, x1 = (x + 1) * s, y0 = (H - 1 - y) * s, y1 = (H - y) * s, z0 = -t / 2, z1 = t / 2;
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], 1);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], 0.8);
    if (!opaque(x - 1, y)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], 0.7);
    if (!opaque(x + 1, y)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], 0.7);
    if (!opaque(x, y - 1)) quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], 0.9);
    if (!opaque(x, y + 1)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
