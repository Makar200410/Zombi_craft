import * as THREE from 'three';
import { getItemSprite } from '../art/icons.js';
import { BLOCKS } from '../core/blocks.js';

const cache = new Map();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
let atlas = null;
/** Blocks carried as items ('blk_<id>') are drawn as small textured cubes from the block atlas. */
export function setItemAtlas(a) { atlas = a; }
const blockGeo = new Map();
let blockMat = null;
/** Unit cube (centered) textured with the block's faces. */
export function blockItemGeometry(blockId) {
  if (!atlas) return null;
  let g = blockGeo.get(blockId);
  if (g) return g;
  const def = BLOCKS[blockId]; if (!def) return null;
  g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv, col = [];
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each); faces shaded like the world mesher
  const shade = [0.8, 0.8, 1, 0.5, 0.9, 0.9];
  for (let f = 0; f < 6; f++) {
    const tile = f === 2 ? def.tiles.top : f === 3 ? def.tiles.bottom : def.tiles.side;
    const [u0, v0, u1, v1] = atlas.uv(tile);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v1 + (v0 - v1) * uv.getY(i));
      col.push(shade[f], shade[f], shade[f]);
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  blockGeo.set(blockId, g);
  return g;
}
export function blockItemMaterial() {
  if (!blockMat && atlas) blockMat = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, vertexColors: true });
  return blockMat;
}

/**
 * Extrudes a 32x32 item sprite into a 1-pixel-thick voxel mesh (1 unit = sprite width).
 * Origin at sprite bottom-left (the handle). Returns a new Mesh sharing cached geometry.
 */
export function makeItemMesh(itemIdOrCanvas, { thick = 1.2 } = {}) {
  if (typeof itemIdOrCanvas === 'string' && itemIdOrCanvas.startsWith('blk_')) {
    // a block in the hand: a cube a little under half the sprite size, sitting where a sprite's middle would be
    const g = blockItemGeometry(+itemIdOrCanvas.slice(4)); if (!g) return null;
    const m = new THREE.Mesh(g, blockItemMaterial());
    m.scale.setScalar(0.45); m.position.set(0.5, 0.5, 0);
    const grp = new THREE.Group(); grp.add(m); grp.userData.block = true;
    return grp;
  }
  const key = (typeof itemIdOrCanvas === 'string' ? itemIdOrCanvas : itemIdOrCanvas) + ':' + thick;
  let geo = cache.get(key);
  if (!geo) {
    let canvas = null;
    try { canvas = typeof itemIdOrCanvas === 'string' ? getItemSprite(itemIdOrCanvas) : itemIdOrCanvas; } catch (e) { canvas = null; }
    if (!canvas) return null;
    geo = extrude(canvas, thick);
    cache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function extrude(canvas, thick = 1.2) {
  const W = canvas.width, H = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const s = 1 / W, t = s * thick;   // thickness in sprite pixels
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
