// LAN server for network games (no dependencies): serves the built game (dist/) over HTTP so friends can open it in a
// browser, and relays WebSocket messages between the host's game and the players who join it.
//   ws://<ip>:<port>/zc?role=host    — the hosting game (one)
//   ws://<ip>:<port>/zc?role=client  — a joining player; the host gets {sys:'join'|'leave', id} and {from: id, d}
// The host sends {to: id | '*', d} and the server forwards d (a JSON string) to that client / everyone.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp' };

/** IPv4 addresses of this machine on the local network. */
function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

// ---- minimal WebSocket (RFC 6455): text frames, ping/pong, close
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = { socket, onmessage: null, onclose: null, closed: false, buf: Buffer.alloc(0), frag: [] };
  conn.send = (text) => {
    if (conn.closed) return;
    const data = Buffer.from(text, 'utf8'), n = data.length;
    let head;
    if (n < 126) head = Buffer.from([0x81, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    socket.write(Buffer.concat([head, data]));
  };
  conn.close = () => { if (conn.closed) return; conn.closed = true; try { socket.end(Buffer.from([0x88, 0])); } catch (e) { /* ignore */ } conn.onclose?.(); };
  socket.on('data', (chunk) => {
    conn.buf = Buffer.concat([conn.buf, chunk]);
    while (conn.buf.length >= 2) {
      const b0 = conn.buf[0], b1 = conn.buf[1];
      let len = b1 & 127, off = 2;
      if (len === 126) { if (conn.buf.length < 4) return; len = conn.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (conn.buf.length < 10) return; len = Number(conn.buf.readBigUInt64BE(2)); off = 10; }
      const masked = b1 & 128;
      if (conn.buf.length < off + (masked ? 4 : 0) + len) return;
      let payload = conn.buf.subarray(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
      if (masked) { const m = conn.buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      conn.buf = conn.buf.subarray(off + (masked ? 4 : 0) + len);
      const op = b0 & 15, fin = b0 & 128;
      if (op === 8) { conn.close(); return; }
      if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        conn.frag.push(payload);
        if (fin) { const text = Buffer.concat(conn.frag).toString('utf8'); conn.frag = []; conn.onmessage?.(text); }
      }
    }
  });
  const end = () => { if (!conn.closed) { conn.closed = true; conn.onclose?.(); } };
  socket.on('close', end); socket.on('error', end);
  return conn;
}

/** Starts the server. root: folder with the built game. Returns {port, ips, close()}. */
function startLan({ port = 27015, root } = {}) {
  let host = null, nextId = 1;
  const clients = new Map();
  const server = http.createServer((req, res) => {
    // static files of the game, for browser players on the network
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(root || '.', p));
    if (!root || !file.startsWith(path.normalize(root))) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  server.on('upgrade', (req, socket) => {
    if (!(req.url || '').startsWith('/zc')) { socket.destroy(); return; }
    const role = new URL(req.url, 'http://x').searchParams.get('role');
    const conn = wsAccept(req, socket);
    if (role === 'host') {
      if (host) host.close();
      host = conn;
      conn.onmessage = (text) => {
        let m; try { m = JSON.parse(text); } catch (e) { return; }
        if (m.to === '*') { for (const c of clients.values()) c.send(m.d); }
        else { const c = clients.get(m.to); if (c) c.send(m.d); }
        if (m.kick) { const c = clients.get(m.kick); if (c) c.close(); }
      };
      conn.onclose = () => { if (host === conn) { host = null; for (const c of clients.values()) c.close(); } };
      return;
    }
    if (!host) { conn.send(JSON.stringify({ t: 'nohost' })); conn.close(); return; }
    const id = nextId++;
    clients.set(id, conn);
    host.send(JSON.stringify({ sys: 'join', id, ip: socket.remoteAddress }));
    conn.onmessage = (text) => host?.send(JSON.stringify({ from: id, d: text }));
    conn.onclose = () => { clients.delete(id); host?.send(JSON.stringify({ sys: 'leave', id })); };
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve({ port, ips: lanIps(), close: () => { for (const c of clients.values()) c.close(); host?.close(); server.close(); } }));
  });
}

module.exports = { startLan, lanIps };
