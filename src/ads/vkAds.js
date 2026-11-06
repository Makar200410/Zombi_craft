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
      g?.state?.addAll?.({ gold: 100, crystal: 40 });
      g?.bus?.emit?.('player:respawn');
      this.ui.menus?.hide?.();
      this.ui.root?.classList.remove('st-dead');
      g?.audio?.play?.('level_up', { volume: 1 });
      this.ui.toast('⚡ Мгновенное возрождение + 100 золота и 40 кристаллов!', 'good');
    }, 'Мгновенное возрождение героя + 100 золота');
    this.lastRewardedAt = prevCd;
  }

  /**
   * Fullscreen 16:9 video preview for Web/PC & fallback before VK moderation activates live fill.
   * Note: On Android APK, com.my.target.ads.RewardedAd / InterstitialAd opens its own native
   * fullscreen Android Activity across 100% of the phone screen automatically.
   */
  _showSimulatedAd(kind, onComplete, subtitle = '') {
    this._pauseGameForAd();
    const isRewarded = kind === 'rewarded';
    const slotId = isRewarded ? VK_ADS_CONFIG.rewardedSlotId : VK_ADS_CONFIG.fullscreenSlotId;
    const totalSec = isRewarded ? 5 : 3;
    let secondsLeft = totalSec;

    const overlay = document.createElement('div');
    overlay.className = 'ui-i';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#020617;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc;';

    const frame = document.createElement('div');
    frame.style.cssText = 'width:min(92vw,860px);background:#0f172a;border:2px solid #3b82f6;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.85);display:flex;flex-direction:column;';

    // Top bar (like native myTarget Fullscreen / Rewarded header)
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(59,130,246,0.3);gap:10px;flex-wrap:wrap;';

    const badge = document.createElement('div');
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:8px;background:rgba(37,99,235,0.25);border:1px solid rgba(96,165,250,0.45);color:#93c5fd;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;';
    badge.textContent = `VK Реклама (myTarget SDK) · Блок #${slotId}`;

    const timerPill = document.createElement('div');
    timerPill.style.cssText = 'font-size:13px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.35);padding:4px 12px;border-radius:999px;';
    timerPill.textContent = `⏳ Награда через ${secondsLeft} сек`;

    topBar.append(badge, timerPill);

    // 16:9 Video Viewport (demonstrates full-size video placement)
    const videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;max-height:58vh;background:#090d16;overflow:hidden;display:flex;align-items:center;justify-content:center;';

    const vCanvas = document.createElement('canvas');
    vCanvas.width = 960;
    vCanvas.height = 540;
    vCanvas.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    videoWrap.appendChild(vCanvas);

    // Progress bar at bottom of video
    const progTrack = document.createElement('div');
    progTrack.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:6px;background:rgba(255,255,255,0.18);';
    const progFill = document.createElement('div');
    progFill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#22c55e);transition:width 0.25s linear;';
    progTrack.appendChild(progFill);
    videoWrap.appendChild(progTrack);

    // Bottom info + action bar
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;background:#0f172a;flex-wrap:wrap;';

    const infoCol = document.createElement('div');
    infoCol.style.cssText = 'flex:1;min-width:200px;';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:800;color:#ffffff;margin-bottom:3px;';
    title.textContent = isRewarded ? '🎬 Видео с вознаграждением (16:9 Fullscreen)' : '📱 Полноэкранная реклама VK (Interstitial)';
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px;color:#94a3b8;';
    desc.textContent = subtitle || 'На телефоне (в APK) видео открывается нативно во весь экран через SDK VK Рекламы.';
    infoCol.append(title, desc);

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'padding:11px 22px;border-radius:10px;border:none;font-size:14px;font-weight:800;cursor:not-allowed;background:#334155;color:#94a3b8;transition:all 0.2s;white-space:nowrap;';
    closeBtn.disabled = true;
    closeBtn.textContent = `Подождите ${secondsLeft} с...`;

    bottomBar.append(infoCol, closeBtn);
    frame.append(topBar, videoWrap, bottomBar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);

    // Animate the 16:9 video preview canvas
    const ctx = vCanvas.getContext('2d');
    let animId = 0;
    const startMs = performance.now();
    const renderFrame = (now) => {
      const t = (now - startMs) * 0.001;
      const pct = Math.min(1, t / totalSec);
      progFill.style.width = `${(pct * 100).toFixed(1)}%`;

      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#090d16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 540);

      // Animated glowing orbs in 16:9 video player
      for (let i = 0; i < 6; i++) {
        const x = 160 + i * 135 + Math.sin(t * 1.7 + i) * 55;
        const y = 270 + Math.cos(t * 1.3 + i * 1.2) * 110;
        const r = 70 + Math.sin(t * 2 + i) * 18;
        const rg = ctx.createRadialGradient(x, y, 4, x, y, r);
        rg.addColorStop(0, i % 2 === 0 ? 'rgba(59,130,246,0.42)' : 'rgba(34,197,94,0.38)');
        rg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Play icon & VK Video frame text
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(480, 235, 54, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.moveTo(465, 208);
      ctx.lineTo(510, 235);
      ctx.lineTo(465, 262);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VK AdNetwork · Видеоплеер 16:9 (Полный экран)', 480, 335);

      ctx.fillStyle = '#93c5fd';
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillText(`App ID: 3579274 · Slot ID: #${slotId} · В APK открывается на весь экран телефона`, 480, 372);

      animId = requestAnimationFrame(renderFrame);
    };
    animId = requestAnimationFrame(renderFrame);

    const interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        timerPill.textContent = isRewarded
          ? `⏳ Награда через ${secondsLeft} сек`
          : `⏳ Закрытие через ${secondsLeft} сек`;
        closeBtn.textContent = `Подождите ${secondsLeft} с...`;
      } else {
        clearInterval(interval);
        timerPill.style.color = '#4ade80';
        timerPill.style.borderColor = 'rgba(74,222,128,0.45)';
        timerPill.style.background = 'rgba(34,197,94,0.18)';
        timerPill.textContent = isRewarded ? '✅ Видео просмотрено!' : '✅ Показ завершён';
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
      cancelAnimationFrame(animId);
      overlay.remove();
      this._resumeGameAfterAd();
      if (typeof onComplete === 'function') onComplete();
    };
  }
}
