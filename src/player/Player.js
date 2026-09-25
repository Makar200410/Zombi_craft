// STUB — to be implemented by the player agent.
import { Entity } from '../entities/Entity.js';
export class Player extends Entity {
  constructor(game) { super(game, { kind: 'player', faction: 'village', maxHp: 100 }); this.mana = 100; this.maxMana = 100; this.hotbar = []; this.selected = 0; }
  init() {}
  onNewGame() { const w = this.game.world, c = w.size / 2 + 6; this.position.set(c, w.surfaceY(c, c) + 1, c); if (!this.object3d.parent) this.game.entities.add(this); }
}
