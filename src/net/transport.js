import { Capacitor, registerPlugin } from '@capacitor/core';

const LocalMultiplayer = registerPlugin('LocalMultiplayer');
export const LAN_PORT = 27015;

export function hasAndroidLan() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('LocalMultiplayer');
}

export function hostBridge() {
  if (hasAndroidLan()) {
    return {
      startLan: (port) => LocalMultiplayer.startLan({ port }),
      stopLan: () => LocalMultiplayer.stopLan(),
      shareAddress: (address) => LocalMultiplayer.shareAddress({ address }),
      advertise: (port, name) => LocalMultiplayer.advertise({ port, name }),
      findWorlds: () => LocalMultiplayer.findWorlds(),
    };
  }
  return window.zcDesktop;
}

export function joinEndpoint(address) {
  const value = String(address || '').trim();
  if (!value) throw new Error('Введите адрес хозяина');
  const explicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  try {
    const url = new URL(explicitScheme ? value : 'ws://' + value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ||
        !url.hostname || url.username || url.password || !['', '/'].includes(url.pathname) ||
        url.search || url.hash) throw new Error();
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    const host = url.port || explicitScheme ? url.host : url.hostname + ':' + LAN_PORT;
    return { host, url: (secure ? 'wss://' : 'ws://') + host + '/zc?role=client' };
  } catch {
    throw new Error('Введите IP или адрес хоста, например 192.168.1.5:27015');
  }
}

let nextSocketId = 0;
let listener;
const sockets = new Map();

function listen() {
  listener ||= LocalMultiplayer.addListener('socket', ({ id, type, data }) => {
    const socket = sockets.get(id);
    if (!socket) return;
    if (type === 'close') {
      sockets.delete(id);
      socket.readyState = 3;
    } else if (type === 'open') {
      socket.readyState = 1;
    }
    socket['on' + type]?.({ data });
  }).catch(error => {
    listener = null;
    throw error;
  });
  return listener;
}

export function openSocket(url) {
  if (!hasAndroidLan()) return new WebSocket(url);

  const id = ++nextSocketId;
  const socket = {
    readyState: 0,
    send(data) {
      LocalMultiplayer.send({ id, data }).catch(() => {
        socket.close();
        socket.onerror?.();
      });
    },
    close() {
      if (socket.readyState === 3) return;
      socket.readyState = 3;
      sockets.delete(id);
      LocalMultiplayer.close({ id }).catch(() => {});
    },
  };
  sockets.set(id, socket);
  listen().then(() => {
    if (socket.readyState === 0) return LocalMultiplayer.connect({ id, url });
  }).catch(() => {
    if (sockets.delete(id)) {
      socket.readyState = 3;
      socket.onerror?.();
    }
  });
  return socket;
}
