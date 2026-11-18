import test from 'node:test';
import assert from 'node:assert/strict';

let report;
const requested = [];
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [{
    name: 'VkAds',
    methods: [
      { name: 'addListener', rtype: 'callback' },
      { name: 'preload', rtype: 'promise' },
      { name: 'show', rtype: 'promise' },
    ],
  }],
  nativeCallback(_plugin, method, { eventName }, callback) {
    assert.equal(method, 'addListener');
    assert.equal(eventName, 'adState');
    report = callback;
    return '1';
  },
  nativePromise(_plugin, method, options) {
    if (method === 'show') requested.push(options);
    return Promise.resolve();
  },
};

const { VkAdsManager } = await import('./vkAds.js');

test('VK rewards require completion of the active native request and are paid once', async () => {
  const toasts = [];
  const game = { running: true, paused: false, setPaused(value) { this.paused = value; } };
  const ads = new VkAdsManager({ game, toast: message => toasts.push(message) });
  let rewards = 0;
  const reward = () => rewards++;

  ads.showRewarded(reward);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requested, [{ kind: 'rewarded', id: 1 }]);
  report({ id: 1, phase: 'dismissed', earned: false });
  assert.equal(rewards, 0);
  assert.equal(game.paused, false);
  assert.match(toasts.at(-1), /полный просмотр/);

  ads.showRewarded(reward);
  await new Promise(resolve => setImmediate(resolve));
  report({ id: 1, phase: 'dismissed', earned: true });
  report({ id: 2, phase: 'displayed', earned: false });
  assert.equal(rewards, 0);
  assert.equal(game.paused, true);
  report({ id: 2, phase: 'dismissed', earned: true });
  report({ id: 2, phase: 'dismissed', earned: true });
  assert.equal(rewards, 1);
  assert.equal(game.paused, false);

  ads.showRewarded(reward, { ignoreCooldown: true });
  await new Promise(resolve => setImmediate(resolve));
  report({ id: 3, phase: 'failed', detail: 'No ad', earned: false });
  assert.equal(rewards, 1);
  assert.equal(game.paused, false);
  assert.match(toasts.at(-1), /реклама сейчас недоступна/);
});
