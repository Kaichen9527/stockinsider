import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';

const [outsideFixture, ...extra] = process.argv.slice(2);
assert.ok(typeof outsideFixture === 'string'
  && /^\/var\/tmp\/stockinsider-stage-linux-model\.[A-Za-z0-9]+\/outside-probe\.json$/u.test(outsideFixture)
  && extra.length === 0, 'expected one staging fixture path');
assert.equal(process.platform, 'linux');
assert.equal(process.version, 'v22.14.0');
assert.ok(process.getuid() > 0, 'candidate runs as an unprivileged user');
assert.ok(!Object.keys(process.env).some(name => /^(OPENAI_|ANTHROPIC_|GH_TOKEN$|GITHUB_TOKEN$|CREDENTIALS_DIRECTORY$)/u.test(name)));

const source = '/workspace/readable-probe.txt';
const scratch = '/scratch/completed-probe.txt';
const message = 'StockInsider Linux model gate synthetic conformance fixture';
assert.equal(readFileSync(source, 'utf8'), message + '\n');
const blockedAccess = error => ['EACCES', 'EPERM', 'EROFS', 'ENOENT'].includes(error.code);
assert.throws(() => writeFileSync(path.join(path.dirname(source), 'write-probe.txt'), message, { flag: 'wx' }),
  error => ['EACCES', 'EPERM', 'EROFS'].includes(error.code));
assert.throws(() => readFileSync(outsideFixture), blockedAccess);
assert.throws(() => lstatSync('/run/docker.sock'), blockedAccess);

writeFileSync(scratch, message, { flag: 'wx', mode: 0o600 });
assert.equal(readFileSync(scratch, 'utf8'), message);
unlinkSync(scratch);

const denied = await new Promise((resolve, reject) => {
  const socket = connect({ host: '127.0.0.1', port: 9 });
  socket.setTimeout(1000);
  socket.once('timeout', () => { socket.destroy(); reject(new Error('expected an address-family denial')); });
  socket.once('connect', () => { socket.destroy(); reject(new Error('unexpected network access')); });
  socket.once('error', error => resolve(error.code));
});
assert.ok(['EAFNOSUPPORT', 'EPERM'].includes(denied), 'socket creation was denied by the sandbox');
console.log(JSON.stringify({
  platform: process.platform, architecture: process.arch, node: process.version,
  readOnlySubject: true, privateWritableScratch: true, outsideFixtureDenied: true,
  dockerSocketAbsent: true, credentialEnvironmentAbsent: true, ipv4SocketDenied: true,
  syntheticOnly: true, modelProviderInvoked: false, protectedCheckPassed: false,
}));
