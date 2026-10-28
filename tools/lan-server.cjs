// Host a LAN game from a terminal (for testing, or with the web version): serves dist/ and relays the network game.
//   node tools/lan-server.cjs [port]
// Then open the game, pause → «Открыть мир для сети», and friends connect to http://<this-ip>:<port>.
const path = require('path');
const { startLan } = require('../electron/lan.cjs');
const port = +(process.argv[2] || 27015);
startLan({ port, root: path.join(__dirname, '..', 'dist') }).then(s => {
  console.log('LAN server on port ' + s.port + ': ' + (s.ips.map(ip => 'http://' + ip + ':' + s.port).join('  ') || 'no network'));
}).catch(e => { console.error('cannot start: ' + e.message); process.exit(1); });
