'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { assert } = require('./artifacts');
const { canonicalJson, parseJsonWithNoDuplicateKeys, sha256 } = require('./canonicalJson');
const candidatePath = path.resolve(__dirname, '../../docs/engineering/runner-recovery-20261011/host-pins.candidate.json');
const fixtureSha256 = 'a5bc7f4a0e7122c54fdbacdde9cef8e72c98e96584eba4d4faaea2f897f6d579';
const fixtureBytes = 2425;
// Public measurement only. No active pin replacement or execution authority.
function loadRecoveryCandidatePins() {
  const fd = fs.openSync(candidatePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    assert(st.isFile() && st.size === fixtureBytes, 5);
    const bytes = Buffer.alloc(fixtureBytes + 1);
    let n = 0, count;
    while ((count = fs.readSync(fd, bytes, n, bytes.length - n, null)) > 0) { n += count; assert(n <= fixtureBytes, 5); }
    const final = fs.fstatSync(fd);
    assert(n === fixtureBytes && st.dev === final.dev && st.ino === final.ino && st.size === final.size
      && st.mtimeMs === final.mtimeMs && st.ctimeMs === final.ctimeMs, 5);
    const value = bytes.subarray(0,n); assert(sha256(value) === fixtureSha256, 5);
    const pins = parseJsonWithNoDuplicateKeys(value.toString('utf8'));
    assert(canonicalJson(pins) + '\n' === value.toString('utf8') && pins.approvalAuthority === null
      && pins.candidateStatus === 'inactive-pending-independent-review-and-initial-establishment'
      && pins.fixtureVersion === 'model-runner-host-pins-oct11-candidate-v1', 5);
    return pins;
  } finally { fs.closeSync(fd); }
}
module.exports = { loadRecoveryCandidatePins, fixtureSha256, fixtureBytes };
