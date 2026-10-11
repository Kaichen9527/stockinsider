'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { RunnerError, assert } = require('./artifacts');
const { writeExclusive, atomicReplace, fsyncDirectory } = require('./journalStore');
const { isOwnershipLost } = require('./processLifecycle');
function oracleRecoveryRoot() { return path.join(os.userInfo().homedir, '.stockinsider-model-oracle-v1'); }
// This is a durable refusal ledger, never an activation or approval authority.
// There is deliberately no stale-PID reclaim, expiry, reset flag or env override.
async function withOracleAttempt(root, run) {
  try { fs.mkdirSync(root, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw new RunnerError(11); }
  const rootStat = fs.lstatSync(root, { bigint: true });
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink() && fs.realpathSync(root) === root &&
    Number(rootStat.uid) === process.getuid() && (rootStat.mode & 0o077n) === 0n, 11);
  fsyncDirectory(path.dirname(root));
  const token = crypto.randomBytes(32).toString('hex');
  const directory = path.join(root, `attempt-${token}`);
  const fence = path.join(root, 'active.json');
  const base = { schema: 'model-oracle-recovery-v1', token, directory, createdAt: new Date().toISOString() };
  try { writeExclusive(fence, { ...base, state: 'in_progress' }); }
  catch { throw new RunnerError(11); }
  let owned;
  const verify = () => {
    const current = fs.lstatSync(root, { bigint: true });
    assert(current.dev === rootStat.dev && current.ino === rootStat.ino && current.isDirectory() && !current.isSymbolicLink(), 11);
    const stat = fs.lstatSync(fence); assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 11);
    assert(stat.size <= 4096 && JSON.parse(fs.readFileSync(fence,'utf8')).token === token, 11);
  };
  const retain = () => { try { verify(); atomicReplace(fence, { ...base, state: 'recovery_required' }); } catch { /* Existing durable fence still refuses every retry. */ } };
  try {
    fs.mkdirSync(directory, { mode: 0o700 }); fsyncDirectory(root);
    owned = fs.lstatSync(directory, { bigint: true });
    let value, primary, processRisk = false;
    const safety = Object.freeze({ processStarting: () => { processRisk = true; }, quiescent: () => { processRisk = false; } });
    try { value = await run(directory, safety); } catch (error) { primary = error; }
    if (isOwnershipLost(primary) || processRisk) { retain(); throw new RunnerError(11); }
    verify();
    const current = fs.lstatSync(directory, { bigint: true });
    assert(current.isDirectory() && !current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino, 11);
    fs.rmSync(directory, { recursive: true, force: false }); fsyncDirectory(root);
    verify(); fs.unlinkSync(fence); fsyncDirectory(root);
    if (primary) throw primary;
    return value;
  } catch (error) {
    // Never clean again after an uncertain failure or revive a prior attempt.
    if (fs.existsSync(fence)) { retain(); throw new RunnerError(11); }
    throw error;
  }
}
module.exports = { oracleRecoveryRoot, withOracleAttempt };
