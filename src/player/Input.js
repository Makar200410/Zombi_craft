// STUB — to be implemented by the player agent (see ARCHITECTURE.md).
export class Input {
  constructor(game) { this.game = game; this.keys = new Set(); this._taps = [];
    addEventListener('keydown', e => this.keys.add(e.code)); addEventListener('keyup', e => this.keys.delete(e.code)); }
  onTap(fn, priority = 0) { this._taps.push({ fn, priority }); this._taps.sort((a, b) => b.priority - a.priority); return () => { this._taps = this._taps.filter(t => t.fn !== fn); }; }
  update() {}
}
