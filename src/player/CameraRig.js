// STUB — to be implemented by the player agent.
export class CameraRig {
  constructor(game) { this.game = game; }
  update() {
    const g = this.game, p = g.player;
    g.camera.position.set(p.position.x - 18, p.position.y + 16, p.position.z - 18);
    g.camera.lookAt(p.position.x, p.position.y, p.position.z);
    g.renderer.shadowFocus.copy(p.position);
  }
}
