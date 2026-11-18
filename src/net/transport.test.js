import test from 'node:test';
import assert from 'node:assert/strict';
import { joinEndpoint } from './transport.js';

test('LAN addresses accept a bare IP, an explicit port and shared URLs', () => {
  for (const address of ['192.168.1.5', '192.168.1.5:27015', 'http://192.168.1.5:27015/']) {
    assert.deepEqual(joinEndpoint(address), {
      host: '192.168.1.5:27015',
      url: 'ws://192.168.1.5:27015/zc?role=client',
    });
  }
  assert.equal(joinEndpoint('https://game.example').url, 'wss://game.example/zc?role=client');
  assert.equal(joinEndpoint('[fd00::1]').url, 'ws://[fd00::1]:27015/zc?role=client');
  assert.throws(() => joinEndpoint('http://user:password@host'), /Введите IP/);
  assert.throws(() => joinEndpoint(''), /Введите адрес/);
});
