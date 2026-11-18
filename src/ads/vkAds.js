import { Capacitor, registerPlugin } from '@capacitor/core';

const VkAds = registerPlugin('VkAds');
const FULLSCREEN_COOLDOWN = 90_000;
const REWARD_COOLDOWN = 30_000;

export class VkAdsManager {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.lastFullscreenAt = 0;
    this.lastRewardedAt = 0;
    this.requestId = 0;
    this.pending = null;
    if (this.hasNativeBridge) {
      this.listener = VkAds.addListener('adState', (event) => this._onAdState(event));
      this.listener.then(() => VkAds.preload()).catch(error => console.warn('VK Ads preload:', error));
    }
  }

  get hasNativeBridge() {
    return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('VkAds');
  }

  get rewardCooldownLeftSec() {
    return Math.max(0, Math.ceil((this.lastRewardedAt + REWARD_COOLDOWN - Date.now()) / 1000));
  }

  _onAdState({ id, phase, detail, earned }) {
    const ad = this.pending;
    if (!ad || ad.id !== id) return;
    if (phase === 'displayed') {
      if (ad.kind === 'fullscreen') this.lastFullscreenAt = Date.now();
      return;
    }
    if (phase !== 'failed' && phase !== 'dismissed') return;

    this.pending = null;
    if (ad.pausedGame && this.game.running && this.ui.menus?.current !== 'pause') {
      this.game.setPaused(false);
    }
    if (phase === 'failed') {
      console.warn('VK Ads:', ad.kind, detail);
      if (ad.kind === 'rewarded') this.ui.toast('VK-реклама сейчас недоступна. Попробуйте позже.', 'warn');
    } else if (ad.kind === 'rewarded') {
      if (!earned) {
        this.ui.toast('Награда выдаётся за полный просмотр видео.', 'info');
        return;
      }
      if (!ad.ignoreCooldown) this.lastRewardedAt = Date.now();
      ad.onReward?.();
    }
  }

  _request(kind, onReward, ignoreCooldown) {
    const ad = {
      id: ++this.requestId, kind, onReward, ignoreCooldown,
      pausedGame: this.game.running && !this.game.paused,
    };
    this.pending = ad;
    if (ad.pausedGame) this.game.setPaused(true);
    this.listener.then(() => VkAds.show({ kind, id: ad.id })).catch(error => {
      this._onAdState({ id: ad.id, phase: 'failed', detail: error.message });
    });
  }

  showFullscreen() {
    if (!this.hasNativeBridge || this.pending || this.game.net?.active ||
        Date.now() - this.lastFullscreenAt < FULLSCREEN_COOLDOWN) return false;
    this._request('fullscreen');
    return true;
  }

  showRewarded(onReward, { ignoreCooldown = false } = {}) {
    if (this.game.net?.active || !this.hasNativeBridge) {
      this.ui.toast(this.game.net?.active
        ? 'Видео с наградой доступно в одиночной игре.'
        : 'Видео с наградой доступно в актуальной Android-версии.', 'info');
      return;
    }
    if (this.pending) return;
    const cd = this.rewardCooldownLeftSec;
    if (!ignoreCooldown && cd > 0) {
      this.ui.toast(`Следующий бонус за видео будет доступен через ${cd} сек.`, 'info');
      return;
    }
    this.ui.toast('Загружаем видео VK…', 'info');
    this._request('rewarded', onReward, ignoreCooldown);
  }

  /**
   * Grant standard resource supply drop for watching a Rewarded Video (Slot 2104988)
   */
  claimSupplyDropBonus() {
    this.showRewarded(() => {
      const g = this.game;
      const st = g?.state;
      if (st) {
        const ageBonus = 1 + (st.age || 0);
        const gold = 100 * ageBonus;
        const crystal = 45 * ageBonus;
        const wood = 80 * ageBonus;
        const stone = 80 * ageBonus;
        const food = 60 * ageBonus;
        st.addAll({ gold, crystal, wood, stone, food });
        if (g.player && !g.player.dead) {
          g.player.hp = g.player.maxHp || 100;
          g.player.mana = g.player.maxMana || 100;
          g.player.stamina = g.player.maxStamina || 100;
        }
        g.audio?.play?.('level_up', { volume: 0.9 });
        this.ui.toast(`🎁 Награда получена: +${gold} золота, +${crystal} кристаллов, +${wood} дерева и камня, полное здоровье!`, 'good');
      } else {
        this.ui.toast('🎁 Бонус VK Рекламы активирован!', 'good');
      }
    });
  }

  /**
   * Free immediate respawn at the village Town Hall (no video needed)
   */
  respawnAtVillageFree() {
    const g = this.game;
    const p = g?.player;
    if (!p) return;
    p.deadT = 0;
    if (typeof p.respawn === 'function') {
      p.respawn();
    } else {
      if (typeof p.revive === 'function') p.revive();
      p.dead = false;
      p.hp = p.maxHp || 100;
      g?.bus?.emit?.('player:respawn', { amount: 0, source: null });
    }
    this.ui.menus?.hide?.();
    this.ui.root?.classList.remove('st-dead');
    if (g) g.setPaused(false);
    if (!g?.isTouch && g?.mode === 'explore') this.ui._lockPointer?.();
  }

  /**
   * Instant hero resurrection via Rewarded Video (Slot 2104988)
   * Revives the hero right where they died (or at village if atVillage=true) with full HP + 4s invulnerability + 100 Gold + 40 Crystals
   */
  claimInstantRevive({ atVillage = false } = {}) {
    this.showRewarded(() => {
      const g = this.game;
      const p = g?.player;
      if (p) {
        p.deadT = 0;
        if (atVillage && typeof p.respawn === 'function') {
          p.respawn();
        } else {
          if (typeof p.revive === 'function') p.revive();
          p.dead = false;
          p.hp = p.maxHp || 100;
          p.mana = p.maxMana || 100;
          p.stamina = p.maxStamina || 100;
          p.velocity?.set?.(0, 0, 0);
          g?.bus?.emit?.('player:respawn', { amount: 0, source: null });
        }
        p.invuln = 4.0;
      }
      g?.state?.addAll?.({ gold: 100, crystal: 40 });
      this.ui.menus?.hide?.();
      this.ui.root?.classList.remove('st-dead');
      if (g) g.setPaused(false);
      if (!g?.isTouch && g?.mode === 'explore') this.ui._lockPointer?.();
      g?.audio?.play?.('level_up', { volume: 1 });
      this.ui.toast('⚡ Вы воскресли с полным здоровьем, 4 сек неуязвимости + 100 золота и 40 кристаллов!', 'good');
    }, { ignoreCooldown: true });
  }

  /**
   * Restore fallen Town Hall & Village on Game Over via Rewarded Video (Slot 2104988)
   */
  claimVillageRevive() {
    this.showRewarded(() => {
      const g = this.game;
      if (!g) return;
      g.gameOver = false;
      const vil = g.village;
      const th = vil?.townHall;
      if (th) {
        th.state = 'complete';
        th.maxHp = th.computeMaxHp ? th.computeMaxHp() : (th.maxHp || 500);
        th.hp = th.maxHp;
        th.needsRepair = false;
        if (Array.isArray(th.blocks) && vil.bulkEdit) {
          vil.bulkEdit(th.blocks.map(b => [b.x, b.y, b.z, b.id]));
        }
        th.refreshBuilt?.();
        vil.recalcPop?.();
        vil.ghostsDirty = true;
      }
      // Push back / clear enemies right on top of Town Hall so it doesn't immediately die again
      const enemies = g.entities?.enemies || g.entities?.list || [];
      if (th && Array.isArray(enemies)) {
        for (const e of [...enemies]) {
          if (e && e !== g.player && e.isEnemy && th.distanceTo && th.distanceTo(e.position) < 16) {
            e.hp = 0;
            e.dead = true;
          }
        }
      }
      if (g.player) {
        g.player.deadT = 0;
        if (typeof g.player.respawn === 'function') g.player.respawn();
        else if (typeof g.player.revive === 'function') g.player.revive();
        g.player.invuln = 5.0;
      }
      g.state?.addAll?.({ gold: 150, crystal: 60, wood: 120, stone: 120 });
      this.ui.menus?.hide?.();
      this.ui.root?.classList.remove('st-dead');
      this.ui._setState?.('play');
      g.setPaused(false);
      g.save?.save?.({ toast: false });
      g.audio?.play?.('level_up', { volume: 1 });
      this.ui.toast('🏰 Ратуша восстановлена! +150 золота, +60 кристаллов и +120 ресурсов для обороны!', 'good');
    }, { ignoreCooldown: true });
  }

}
