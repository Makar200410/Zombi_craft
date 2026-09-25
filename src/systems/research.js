// STUB — to be implemented by the UI/research agent.
export class Research { constructor(game) { this.game = game; this.current = null; this.progress = 0; } isDone(id) { return this.game.state.researchDone.has(id); } update() {} }
