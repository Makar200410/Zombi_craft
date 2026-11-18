package com.zombicraft.game;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.my.target.ads.InterstitialAd;
import com.my.target.ads.Reward;
import com.my.target.ads.RewardedAd;
import com.my.target.common.MyTargetManager;
import com.my.target.common.models.IAdLoadingError;

@CapacitorPlugin(name = "VkAds")
public class VkAdsPlugin extends Plugin {
    private static final String TAG = "ZombiCraftVkAds";
    private static final int FULLSCREEN_SLOT = 2104985;
    private static final int REWARDED_SLOT = 2104988;
    private final Handler main = new Handler(Looper.getMainLooper());
    private InterstitialAd fullscreen;
    private RewardedAd rewarded;
    private boolean fullscreenReady;
    private boolean rewardedReady;
    private boolean earned;
    private String pending;
    private int requestId;

    private final Runnable showTimeout = () -> {
        if (pending != null) finish("failed", "SDK не ответил вовремя");
    };

    @Override
    public void load() {
        main.post(() -> MyTargetManager.initSdk(getContext().getApplicationContext()));
    }

    @PluginMethod
    public void preload(PluginCall call) {
        main.post(() -> {
            loadFullscreen();
            loadRewarded();
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        String kind = call.getString("kind", "");
        main.post(() -> {
            if (pending != null || !("fullscreen".equals(kind) || "rewarded".equals(kind))) {
                call.reject("Реклама уже запрошена или формат не поддерживается");
                return;
            }
            pending = kind;
            requestId = call.getInt("id", 0);
            earned = false;
            main.postDelayed(showTimeout, 30_000);
            call.resolve();
            if ("rewarded".equals(kind)) {
                if (rewardedReady) showRewarded();
                else loadRewarded();
            } else {
                if (fullscreenReady) showFullscreen();
                else loadFullscreen();
            }
        });
    }

    private void event(String phase, String detail) {
        notifyListeners("adState", new JSObject().put("id", requestId).put("phase", phase)
                .put("detail", detail).put("earned", earned));
    }

    private void displayed() {
        main.removeCallbacks(showTimeout);
        event("displayed", "");
    }

    private void finish(String phase, String detail) {
        if (pending == null) return;
        String kind = pending;
        if ("failed".equals(phase)) Log.w(TAG, kind + " request failed: " + detail);
        main.removeCallbacks(showTimeout);
        event(phase, detail);
        pending = null;
        if ("rewarded".equals(kind)) clearRewarded();
        else clearFullscreen();
        if ("dismissed".equals(phase)) {
            if ("rewarded".equals(kind)) loadRewarded();
            else loadFullscreen();
        }
    }

    private void loadFailed(String kind, int slot, IAdLoadingError error) {
        String detail = error.getCode() + ": " + error.getMessage();
        Log.w(TAG, "Slot " + slot + " load failed: " + detail);
        if (kind.equals(pending)) finish("failed", detail);
        else if ("rewarded".equals(kind)) clearRewarded();
        else clearFullscreen();
    }

    private void clearFullscreen() {
        InterstitialAd ad = fullscreen;
        fullscreen = null;
        fullscreenReady = false;
        if (ad != null) ad.destroy();
    }

    private void clearRewarded() {
        RewardedAd ad = rewarded;
        rewarded = null;
        rewardedReady = false;
        if (ad != null) ad.destroy();
    }

    private void showFullscreen() {
        fullscreenReady = false;
        try {
            fullscreen.show(getActivity());
        } catch (RuntimeException error) {
            Log.w(TAG, "Slot " + FULLSCREEN_SLOT + " show failed", error);
            finish("failed", "SDK не смог открыть рекламный экран");
        }
    }

    private void showRewarded() {
        rewardedReady = false;
        try {
            rewarded.show(getActivity());
        } catch (RuntimeException error) {
            Log.w(TAG, "Slot " + REWARDED_SLOT + " show failed", error);
            finish("failed", "SDK не смог открыть рекламный экран");
        }
    }

    private void loadFullscreen() {
        if (fullscreen != null) return;
        try {
            fullscreen = new InterstitialAd(FULLSCREEN_SLOT, getActivity());
            fullscreen.setListener(new InterstitialAd.InterstitialAdListener() {
                @Override public void onLoad(InterstitialAd ad) { main.post(() -> {
                    if (fullscreen != ad) return;
                    fullscreenReady = true;
                    if ("fullscreen".equals(pending)) showFullscreen();
                }); }
                @Override public void onNoAd(IAdLoadingError error, InterstitialAd ad) { main.post(() -> {
                    if (fullscreen == ad) loadFailed("fullscreen", FULLSCREEN_SLOT, error);
                }); }
                @Override public void onDisplay(InterstitialAd ad) { main.post(() -> {
                    if (fullscreen == ad && "fullscreen".equals(pending)) displayed();
                }); }
                @Override public void onDismiss(InterstitialAd ad) { main.post(() -> {
                    if (fullscreen == ad && "fullscreen".equals(pending)) finish("dismissed", "");
                }); }
                @Override public void onFailedToShow(InterstitialAd ad) { main.post(() -> {
                    if (fullscreen == ad && "fullscreen".equals(pending)) finish("failed", "VK SDK: onFailedToShow");
                }); }
                @Override public void onClick(InterstitialAd ad) {}
                @Override public void onVideoCompleted(InterstitialAd ad) {}
            });
            fullscreen.load();
        } catch (RuntimeException error) {
            Log.w(TAG, "Slot " + FULLSCREEN_SLOT + " could not start loading", error);
            if ("fullscreen".equals(pending)) finish("failed", "Не удалось запросить рекламу VK");
            else clearFullscreen();
        }
    }

    private void loadRewarded() {
        if (rewarded != null) return;
        try {
            rewarded = new RewardedAd(REWARDED_SLOT, getActivity());
            rewarded.setListener(new RewardedAd.RewardedAdListener() {
                @Override public void onLoad(RewardedAd ad) { main.post(() -> {
                    if (rewarded != ad) return;
                    rewardedReady = true;
                    if ("rewarded".equals(pending)) showRewarded();
                }); }
                @Override public void onNoAd(IAdLoadingError error, RewardedAd ad) { main.post(() -> {
                    if (rewarded == ad) loadFailed("rewarded", REWARDED_SLOT, error);
                }); }
                @Override public void onDisplay(RewardedAd ad) { main.post(() -> {
                    if (rewarded == ad && "rewarded".equals(pending)) displayed();
                }); }
                @Override public void onDismiss(RewardedAd ad) { main.post(() -> {
                    if (rewarded == ad && "rewarded".equals(pending)) finish("dismissed", "");
                }); }
                @Override public void onFailedToShow(RewardedAd ad) { main.post(() -> {
                    if (rewarded == ad && "rewarded".equals(pending)) finish("failed", "VK SDK: onFailedToShow");
                }); }
                @Override public void onReward(Reward reward, RewardedAd ad) { main.post(() -> {
                    if (rewarded == ad && "rewarded".equals(pending)) earned = true;
                }); }
                @Override public void onClick(RewardedAd ad) {}
            });
            rewarded.load();
        } catch (RuntimeException error) {
            Log.w(TAG, "Slot " + REWARDED_SLOT + " could not start loading", error);
            if ("rewarded".equals(pending)) finish("failed", "Не удалось запросить рекламу VK");
            else clearRewarded();
        }
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacksAndMessages(null);
        pending = null;
        clearFullscreen();
        clearRewarded();
    }
}
