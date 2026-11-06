// VK AdNetwork (myTarget SDK) integration for Android APK + Web/PC preview fallback
// Official Slot IDs configured by user:
// - Fullscreen (Interstitial): 2104985 (https://ads.vk.ru/help/articles/partner_android_fullscreen)
// - Rewarded Video:            2104988 (https://ads.vk.ru/help/articles/partner_android_rewarded)

export const VK_ADS_CONFIG = {
  appName: 'Zombi Crafter',
  vkAppId: 3579274,
  fullscreenSlotId: 2104985,
  rewardedSlotId: 2104988,
  fullscreenCooldownMs: 90_000, // minimum 90s between automatic fullscreen ads
  rewardCooldownMs: 30_000,     // 30s cooldown between bonus chests
};

export class VkAdsManager {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.lastFullscreenAt = 0;
    this.lastRewardedAt = 0;
    this.fullscreenLoaded = false;
    this.rewardedLoaded = false;
    this._pendingRewardCb = null;
    this._pendingRewardGranted = false;
    this._wasPausedBeforeAd = false;

    // Register global callback invoked by Android Java bridge (VkAdsBridge.java)
    window.onVkAdEvent = (event, detail = '') => this._handleNativeEvent(event, detail);

    // Preload ads on Android if native bridge is present
    setTimeout(() => {
      try {
        if (this.hasNativeBridge) {
          window.VkAdsBridge.preloadAds(VK_ADS_CONFIG.fullscreenSlotId, VK_ADS_CONFIG.rewardedSlotId);
        }
      } catch (e) { /* ignore */ }
    }, 1200);
  }

  get hasNativeBridge() {
    return typeof window !== 'undefined' && !!window.VkAdsBridge;
  }

  get rewardCooldownLeftSec() {
    const elapsed = Date.now() - this.lastRewardedAt;
    if (elapsed >= VK_ADS_CONFIG.rewardCooldownMs) return 0;
    return Math.ceil((VK_ADS_CONFIG.rewardCooldownMs - elapsed) / 1000);
  }

  _pauseGameForAd() {
    const g = this.game;
    this._wasPausedBeforeAd = !!g?.paused;
    if (g && g.running && !g.paused) {
      g.setPaused(true);
    }
  }

  _resumeGameAfterAd() {
    const g = this.game;
    if (g && g.running && !this._wasPausedBeforeAd && !this.ui.menus?.current) {
      g.setPaused(false);
    }
  }

  _handleNativeEvent(event, detail) {
    switch (event) {
      case 'fullscreen_loaded':
        this.fullscreenLoaded = true;
        break;
      case 'rewarded_loaded':
        this.rewardedLoaded = true;
        break;
      case 'ad_display':
        this._pauseGameForAd();
        break;
      case 'fullscreen_dismissed':
      case 'fullscreen_failed':
        this._resumeGameAfterAd();
        break;
      case 'rewarded_earned':
        this._pendingRewardGranted = true;
        break;
      case 'rewarded_dismissed': {
        this._resumeGameAfterAd();
        const cb = this._pendingRewardCb;
        const granted = this._pendingRewardGranted;
        this._pendingRewardCb = null;
        this._pendingRewardGranted = false;
        if (granted && typeof cb === 'function') {
          this.lastRewardedAt = Date.now();
          cb();
        }
        break;
      }
      case 'rewarded_failed': {
        this._resumeGameAfterAd();
        const cb = this._pendingRewardCb;
        this._pendingRewardCb = null;
        this._pendingRewardGranted = false;
        // Fallback to in-app preview ad if fill is still warming up on new VK AdNetwork slot
        this._showSimulatedAd('rewarded', cb, detail || 'Загрузка рекламного видео VK...');
        break;
      }
    }
  }

  /**
   * Show Fullscreen (Interstitial) ad (Slot ID: 2104985)
   */
  showFullscreen({ force = false, reason = '' } = {}) {
    const now = Date.now();
    if (!force && now - this.lastFullscreenAt < VK_ADS_CONFIG.fullscreenCooldownMs) {
      return false;
    }
    this.lastFullscreenAt = now;

    if (this.hasNativeBridge) {
      try {
        this._pauseGameForAd();
        window.VkAdsBridge.showFullscreenAd(VK_ADS_CONFIG.fullscreenSlotId);
        return true;
      } catch (e) { /* fall back */ }
    }

    if (force) {
      this._showSimulatedAd('fullscreen', null, reason || 'Полноэкранный блок #2104985');
      return true;
    }
    return false;
  }

  /**
   * Show Rewarded Video ad (Slot ID: 2104988) and grant reward on completion
   */
  showRewarded(onReward, rewardLabel = '+120 золота, +60 кристаллов и +80 дерева') {
    const cd = this.rewardCooldownLeftSec;
    if (cd > 0) {
      this.ui.toast(`Следующий бонус за видео будет доступен через ${cd} сек.`, 'info');
      return;
    }

    this._pendingRewardCb = onReward;
    this._pendingRewardGranted = false;

    if (this.hasNativeBridge) {
      try {
        this._pauseGameForAd();
        window.VkAdsBridge.showRewardedAd(VK_ADS_CONFIG.rewardedSlotId);
        return;
      } catch (e) { /* fall back */ }
    }

    this._showSimulatedAd('rewarded', () => {
      this.lastRewardedAt = Date.now();
      if (typeof onReward === 'function') onReward();
    }, rewardLabel);
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
    }, 'Сундук снабжения: +Золото, +Кристаллы, +Ресурсы и полное HP');
  }

  /**
   * Instant hero resurrection via Rewarded Video (Slot 2104988)
   */
  claimInstantRevive() {
    const prevCd = this.lastRewardedAt;
    this.lastRewardedAt = 0; // Always allow revive on death
    this.showRewarded(() => {
      const g = this.game;
      const p = g?.player;
      if (p) {
        p.dead = false;
        p.respawnTimer = 0;
        p.respawnIn = 0;
        p.hp = p.maxHp || 100;
        p.mana = p.maxMana || 100;
        p.stamina = p.maxStamina || 100;
      }
      g?. state?.addAll?.({ gold: 100, crystal: 40 });
      g?.bus?.emit?.('player:respawn');
      this.ui.menus?.hide?.();
      this.ui.root?.classList.remove('st-dead');
      g?.audio?.play?.('level_up', { volume: 1 });
      this.ui.toast('⚡ Мгновенное возрождение + 100 золота и 40 кристаллов!', 'good');
    }, 'Мгновенное возрождение героя + 100 золота');
    this.lastRewardedAt = prevCd;
  }

  _showSimulatedAd(kind, onComplete, subtitle = '') {
    this._pauseGameForAd();
    const isRewarded = kind === 'rewarded';
    const slotId = isRewarded ? VK_ADS_CONFIG.rewardedSlotId : VK_ADS_CONFIG.fullscreenSlotId;
    let secondsLeft = isRewarded ? 5 : 3;

    const overlay = document.createElement('div');
    overlay.className = 'ui-i';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(4,7,14,0.94);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc;';

    const card = document.createElement('div');
    card.style.cssText = 'max-width:480px;width:100%;background:linear-gradient(160deg,#0f172a 0%,#1e1b4b 100%);border:2px solid #3b82f6;border-radius:18px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,0.75);text-align:center;position:relative;';

    const badge = document.createElement('div');
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:8px;background:rgba(37,99,235,0.25);border:1px solid rgba(96,165,250,0.45);color:#93c5fd;font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;margin-bottom:14px;';
    badge.textContent = `VK Реклама (myTarget SDK) · Блок #${slotId}`;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:21px;font-weight:800;margin-bottom:8px;color:#ffffff;';
    title.textContent = isRewarded ? '🎬 Видео с вознаграждением' : '📱 Полноэкранная реклама VK';

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:14px;color:#cbd5e1;line-height:1.45;margin-bottom:18px;';
    desc.textContent = subtitle || (isRewarded
      ? 'Досмотрите короткое видео до конца, чтобы получить бонусный сундук ресурсов!'
      : 'Рекламная пауза Zombi Crafter (App ID: 3579274)');

    const timerBox = document.createElement('div');
    timerBox.style.cssText = 'margin:16px auto;padding:16px;border-radius:12px;background:rgba(15,23,42,0.75);border:1px solid rgba(148,163,184,0.2);font-size:15px;font-weight:700;color:#fbbf24;';
    timerBox.textContent = `⏳ До получения награды: ${secondsLeft} сек...`;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'width:100%;padding:12px 18px;border-radius:10px;border:none;font-size:15px;font-weight:800;cursor:not-allowed;background:#334155;color:#94a3b8;transition:all 0.2s;';
    closeBtn.disabled = true;
    closeBtn.textContent = `Подождите ${secondsLeft} с...`;

    card.append(badge, title, desc, timerBox, closeBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        timerBox.textContent = isRewarded
          ? `⏳ До получения награды: ${secondsLeft} сек...`
          : `⏳ Можно закрыть через ${secondsLeft} сек...`;
        closeBtn.textContent = `Подождите ${secondsLeft} с...`;
      } else {
        clearInterval(interval);
        timerBox.style.color = '#4ade80';
        timerBox.textContent = isRewarded
          ? '✅ Видео просмотрено! Награда готова к выдаче.'
          : '✅ Показ завершён (Slot ID: ' + slotId + ')';
        closeBtn.disabled = false;
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.background = isRewarded ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#2563eb,#3b82f6)';
        closeBtn.style.color = '#ffffff';
        closeBtn.textContent = isRewarded ? '🎁 Забрать награду!' : '✖ Закрыть и продолжить игру';
      }
    }, 1000);

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      clearInterval(interval);
      overlay.remove();
      this._resumeGameAfterAd();
      if (typeof onComplete === 'function') onComplete();
    };
  }
}
