// Block selection visuals: crisp outline box, mining crack overlay (atlas destroy_0..5) and a translucent
// placement ghost of the selected build block (build hammer).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCKS } from '../core/blocks.js';

function outlineGeometry(t = 0.022, pad = 0.004) {
  const parts = [];
  const lo = -pad, hi = 1 + pad, L = hi - lo + t;
  const mid = (lo + hi) / 2;
  for (const a of [lo, hi]) for (const b of [lo, hi]) {
    const gx = new THREE.BoxGeometry(L, t, t); gx.translate(mid, a, b); parts.push(gx);
    const gy = new THREE.BoxGeometry(t, L, t); gy.translate(a, mid, b); parts.push(gy);
    const gz = new THREE.BoxGeometry(t, t, L); gz.translate(a, b, mid); parts.push(gz);
  }
  return mergeGeometries(parts);
}

/** Sets a BoxGeometry's per-face UVs to atlas tiles. tiles: {side, top, bottom}. BoxGeometry face order: +x,-x,+y,-y,+z,-z. */
function setBoxUV(geo, atlas, tiles) {
  const uv = geo.attributes.uv;
  const order = [tiles.side, tiles.side, tiles.top, tiles.bottom, tiles.side, tiles.side];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = atlas.uv(order[f]);
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, u0 + u * (u1 - u0), v0 + (1 - v) * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
}

export class BlockCursor {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.outline = new THREE.Mesh(outlineGeometry(), new THREE.MeshBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.62, depthWrite: false }));
    this.outline.renderOrder = 3; this.outline.visible = false;
    scene.add(this.outline);
    // subtle inner face tint so the target reads in dark caves too
    this.tint = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    this.tint.renderOrder = 3; this.tint.visible = false;
    scene.add(this.tint);

    const atlas = game.atlas;
    this.crackGeo = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    this.crack = new THREE.Mesh(this.crackGeo, new THREE.MeshBasicMaterial({ map: atlas?.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, alphaTest: 0.02 }));
    this.crack.renderOrder = 4; this.crack.visible = false;
    scene.add(this.crack);
    this.crackStage = -1;

    this.ghostGeo = new THREE.BoxGeometry(1, 1, 1);
    this.ghost = new THREE.Mesh(this.ghostGeo, new THREE.MeshBasicMaterial({ map: atlas?.texture, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.renderOrder = 3; this.ghost.visible = false;
    scene.add(this.ghost);
    this.ghostEdge = new THREE.Mesh(outlineGeometry(0.014, 0.003), new THREE.MeshBasicMaterial({ color: 0xbfffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ghostEdge.renderOrder = 3; this.ghost.add(this.ghostEdge); this.ghostEdge.position.set(-0.5, -0.5, -0.5);
    this.ghostBlock = -1;
    this.t = 0;
  }

  hide() { this.outline.visible = this.tint.visible = this.crack.visible = this.ghost.visible = false; }

  /** hit = world.raycast result or null; ghost = {x,y,z,id,ok} or null */
  update(dt, hit, ghost) {
    this.t += dt;
    const w = this.game.world;
    if (!hit) { this.outline.visible = this.tint.visible = this.crack.visible = false; }
    else {
      const b = BLOCKS[hit.id];
      const cross = b && b.shape === 'cross';
      this.outline.visible = this.tint.visible = true;
      this.outline.position.set(hit.x, hit.y, hit.z);
      if (cross) { this.outline.scale.set(0.7, 0.8, 0.7); this.outline.position.x += 0.15; this.outline.position.z += 0.15; }
      else this.outline.scale.set(1, 1, 1);
      this.tint.visible = !cross;
      this.tint.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.tint.material.opacity = 0.05 + 0.03 * Math.sin(this.t * 4);
      const dmg = w ? w.getBlockDamage(hit.x, hit.y, hit.z) : 0;
      if (dmg > 0.001 && !cross) {
        const stage = Math.min(5, Math.floor(dmg * 6));
        if (stage !== this.crackStage) {
          this.crackStage = stage;
          const t = 'destroy_' + stage;
          setBoxUV(this.crackGeo = this._resetBox(this.crackGeo, 1.006), this.game.atlas, { side: t, top: t, bottom: t });
          this.crack.geometry = this.crackGeo;
        }
        this.crack.visible = true;
        this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else { this.crack.visible = false; this.crackStage = -1; }
    }
    if (ghost && ghost.id && BLOCKS[ghost.id]) {
      if (ghost.id !== this.ghostBlock) {
        this.ghostBlock = ghost.id;
        const b = BLOCKS[ghost.id];
        this.ghostGeo = this._resetBox(this.ghostGeo, 1);
        setBoxUV(this.ghostGeo, this.game.atlas, b.tiles);
        this.ghost.geometry = this.ghostGeo;
      }
      this.ghost.visible = true;
      this.ghost.position.set(ghost.x + 0.5, ghost.y + 0.5, ghost.z + 0.5);
      const pulse = 0.34 + 0.1 * Math.sin(this.t * 5);
      this.ghost.material.opacity = ghost.ok ? pulse : pulse * 0.6;
      this.ghost.material.color.set(ghost.ok ? 0xffffff : 0xff6060);
      this.ghostEdge.material.color.set(ghost.ok ? 0xbfffff : 0xff5050);
    } else this.ghost.visible = false;
  }

  _resetBox(geo, s) { geo.dispose(); return new THREE.BoxGeometry(s, s, s); }
}
