/** Isolated read-only test transport, never a source or staging producer.
 * Reads fixed snapshots captured from the disposable real PostgreSQL lifecycle.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.env.VNEXT_BROWSER_FIXTURES;
if (!root || !path.isAbsolute(root)) throw Error('explicit_fixture_snapshot_root_required');
const port = Number(process.env.VNEXT_BROWSER_BRIDGE_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('explicit_isolated_bridge_port_required');
const allowed = new Map(['home', 'detail', 'home-before', 'detail-before'].filter(name => !name.endsWith('-before') || fs.existsSync(path.join(root,name+'.json'))).map(name => {
  const p = path.join(root, name + '.json'); const stat = fs.lstatSync(p);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw Error('bounded_regular_snapshot_required');
  const bytes = fs.readFileSync(p); return [name, { value: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }];
}));
const controlKey = process.env.VNEXT_BROWSER_CONTROL_KEY;
if (!controlKey || controlKey.length < 32) throw Error('test_control_key_required');
let mode = 'full'; let delay = 0; let trace = [];
const server = http.createServer(async (req, res) => {
  const chunks = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 8192) { res.writeHead(413).end(); return; } chunks.push(part); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { res.writeHead(400).end(); return; }
  res.setHeader('content-type', 'application/json');
  if (req.url === '/__fixture/control' && req.headers['x-test-control'] === controlKey) {
    if (req.method === 'GET') { res.end(JSON.stringify({ mode, trace, sourceHashes: Object.fromEntries([...allowed].map(([k, v]) => [k, v.sha256])) })); return; }
    if (!['full', 'empty', 'error', 'before'].includes(body.mode) || body.mode==='before' && !allowed.has('home-before') || ![0, 1000].includes(body.delayMs || 0)) { res.writeHead(400).end(); return; }
    mode = body.mode; delay = body.delayMs || 0; trace = []; res.end('{"ok":true}'); return;
  }
  trace.push({ method: req.method, path: req.url, inputSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') });
  if (req.url !== '/rest/v1/rpc/vnext_read_v1' || req.method !== 'POST') { res.writeHead(403).end('{"message":"read_only_fixture_transport"}'); return; }
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (mode === 'error') { res.writeHead(503).end('{"message":"synthetic_database_unavailable"}'); return; }
  const suffix=mode==='before'?'-before':'';
  const value = body.p_symbol ? allowed.get('detail'+suffix).value : allowed.get('home'+suffix).value;
  const data = mode === 'empty' ? (body.p_symbol ? { symbol: body.p_symbol, history: [], membership: null } : { ...value, members: [] }) : value;
  res.end(JSON.stringify(data));
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, scope: 'read-only synthetic test transport of real isolated DB snapshots', port })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
