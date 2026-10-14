# Private historical cash carrier — independent design review

Verdict: recommend the bounded canonical-byte carrier for this unpublished candidate interface, subject to the concrete implementation requirements below. No new demonstrated P0/P1/P2 design blocker in that specified design. This is an unsigned model-agent engineering design recommendation, not code closure, human policy approval, formal reviewer execution, or protected approval. Existing e2d REQUEST_CHANGES / R2 remains OPEN until an actual implementation and regression review. No candidate code was changed or tested in this task.

Reviewed baseline: e2dcb6c20b71561dfb37d7728809b0be257d8fe2, tree 8d5ed4a38fa861969ad052297018d67333b0c941. Prior review remains at fbf454d4f7e89fd8415160c5e5f8cd1eb14b6ab0, report SHA2223f72c1654a49f8762a3e0e178bd4aaf2868d310389a8d2fc9614d4993c23f. No old result is relabeled.

## Independent representation measurements

The fixture-only script independently constructs recursively sorted object keys, preserved file-array order, UTF8, no trailing newline, from the actual pinned fixture. It does not export a production encoder or accept arbitrary caller objects. It verifies all 15 raw lengths/SHA and canonical base64 against the fixture pins; issuer selections also match exact runtime pins. Original Git byte equality is prior evidence, not rerun here.

| Issuer | Files | Decoded raw | Canonical carrier | Whole SHA256 |
|---|---:|---:|---:|---|
| AUO 2409 | 9 | 697558 | 931023 | 823b80038e13779f4155327b3cd7d36b1dc5a833490da1bf692d33845c239590 |
| EMC 2383 | 7 | 264753 | 353803 | 5fff5dd7e33ae7da30d8b72890f13414866b7820f54685af38b5cdd95d2b5564 |

Both match Root's proposal exactly. Gzip202500 bytes SHAafedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f; expansion1245186; 15 unique raw files931660 bytes. Two company inventories share the packet. No raw carrier, source lines, or local PDF paths are exported in the measurement output.

Sixteen representation mutations (eight per issuer: unknown field, duplicate symbol key, omission, extra file, reordered array, other issuer, bad base64, trailing newline) all change exact length or whole SHA. Reordering, cross-company and bad-base64 examples preserve length and specifically require the hash check. These are proposed representation properties, NOT tests of a repaired runtime.

Largest AUO raw393280, encoded524376 bytes; largest EMC raw110526, encoded147368. Applying raw512KiB to encoded fields would wrongly reject valid AUO input. Carrier cap1MiB and raw aggregate1MiB are distinct limits. Carrier plus decoded raw alone is1628581/618556 bytes, before caller buffer, strings, parse trees, model and output. Do not describe this as a total1MiB memory limit.

## Required acceptance and ownership contract

1. Explicit BREAKING candidate-internal input change: every former Map input, including exact valid9/7 data and Map plus10000 properties, is rejected without iteration/reflection. There is no compatibility normalizer or exported arbitrary-Map encoder. Serialized carrier metadata is the only metadata input domain. Extra JS view properties are outside that domain and are never read, enumerated, serialized or copied as metadata; this is explicit representation narrowing, not silently dropping serialized unknown fields.
2. Check primitive profile/symbol, then use intrinsic view brand/typed-array kind and native byteLength, not caller getters, iterator, constructor, slice, set, buffer, toJSON or Reflect.ownKeys. Reject non-Uint8Array views and proxies without property access; state Buffer support explicitly. Wrong static length and oversize must reject before allocation/copy/parse. Intrinsics must come from the trusted module realm, not mutable caller methods. Avoid getPrototypeOf on a proxy before the intrinsic brand check.
3. Copy the bounded logical view into owned memory first; calculate the static issuer-specific SHA on that SAME owned copy. Hashing caller memory and copying later admits a TOCTOU counterexample if another writer changes the bytes. An owned-copy SHA mismatch must stop before TextDecoder/JSON.parse/base64 decode. No fallback canonicalization after parsing. Exact static SHA binds all keys, duplicates, Unicode encoding, whitespace, field order, path order and base64 spelling under the usual SHA256 integrity assumption. Preserve all later original raw pins, complete manifests and semantic/core checks; the carrier hash is not financial authority.
4. Decide the backing-store domain explicitly. Safest initial scope: ordinary non-shared, non-resizable native Uint8Array/Buffer views, using intrinsic backing-store accessors. Alternatively a shared copy can only be accepted by hashing the resulting owned snapshot, but that needs separate concurrency/custody tests and must not claim producer stability. Detached or concurrently resized views must fail without success. Do not inspect custom own keys to enforce any of this.
5. Preserve exact9/7, raw per-file524288, raw aggregate1048576, projection160000, fixed semantic/numeric pins, and every false flag/null future field. Whole-carrier size1048576 does not replace the raw limits. Base64 decoding is bounded by already-authenticated bytes, but decoded lengths/SHA still must be checked, with every temporary decoded buffer accounted for. Unknown or duplicate serialized fields are rejected before parse even though JSON.parse itself accepts duplicates.
6. Retain one shared deadline with checks before/after copy, hash, parse, each decode/check and projection; discard late success. Synchronous bounded operations are not preempted by a timer. The maximum1MiB finite workload makes a bound reviewable but does not prove a10s wall-clock guarantee. Deadline callbacks are trusted cooperative controls, not arbitrary untrusted executable input with a hard runtime guarantee; no claim of interruption of callback/kernel work.
7. Register owned carrier and each temporary/raw copy for finally cleanup before any later check can throw. Wipe success, rejection, deadline and semantic failure paths. Preserve caller ownership: do not wipe caller buffers. Avoid hidden duplicate base64 decode buffers or include them in cleanup. Immutable JS UTF8/base64 strings and JSON strings cannot be reliably zeroed; drop references and document this limitation. Do not log them. Buffer wiping alone is not complete secret erasure or proof of filesystem custody.

A lightweight language-primitive experiment on Node22.14 verifies native byteLength and Uint8Array.prototype.set on Uint8Array and Buffer with10000 own getters plus overridden byteLength/buffer/length/iterator/slice/set/toJSON: zero caller getter reads, exact copied bytes. ArrayBuffer.isView rejects a proxy and Map without triggering its traps. This demonstrates available primitives, not candidate acceptance, whole runtime cleanup, or a hard deadline.

## Alternative: opaque material / factory

A private WeakMap-backed opaque handle can reject arbitrary objects in O(1) and avoid accepting public bytes repeatedly. It is sound only when its factory itself has a bounded trusted input, e.g. the same pinned byte carrier or an internal fixed filesystem reader. A public factory accepting the old unknown Map simply moves R2 into the factory. Object.freeze on a wrapper does not make a referenced Uint8Array immutable; exposed buffers can change after validation. Keep bytes private, bind exact issuer/profile/hash, and define disposal, reuse, deadline and lifetime ownership. The factory cannot confer source authority merely by branding.

For this narrow unpublished leaf, byte carrier has the smaller review surface: one finite byte string per issuer and no handle lifecycle or new factory trust boundary. Opaque handles may be useful later for a real single-owner reader but are not needed to close the current input-enumeration problem. Neither design may infer source authority from branding/hash.

## Implementation acceptance still required

- All legacy Maps reject, including correct data plus10000 own properties; zero iterator/getter/ownKeys calls. New byte views with hostile getters do not execute them. Wrong kind/proxy and detached backing reject.
- Exact and +1/static-length failures before owned allocation/parse; same-length wrong hash, unknown key and duplicate key including length-balanced mutations reject before parse; reordered/cross-issuer/bad or noncanonical base64 reject.
- Both real9/7 positives preserve output hashes/shape and raw/manifest/semantic checks; raw pin drift, packet duplication, top/nested manifest mismatch and canonical/model mismatch still reject.
- Caller mutation cannot alter owned validated input; all owned buffers tracked/wiped on each failure stage and late deadline; no claims of wiping immutable strings.
- Future producer fixed9/7 reads, O_NOFOLLOW/regular-file identity, bounded actual reads, close confirmation, cleanup recovery, caller cancellation and common deadline remain unimplemented and unapproved.
- Full scenario+cash schema/mapping, legacyv2 replay, reader8, HTTP8192, quotas/fences, HTTP-PG, author/reviewer/publication pipeline and formal approval remain entirely separate/pending. The carrier is not an HTTP request enlargement or v3 completion.

## Work and limits

Task saved compressed and reread; no Root long thread/automation memory read. Admission07:15:08Z, deadline07:25:08Z. Clean existing evidence worktree; e2d pins/projection/fixture unchanged. Only light Node measurements; no suite/PG/native/build/install/CI or services started. No environment configuration change needed. Node v22.14.0; measurement maxRSS82412KiB, intrinsic probe31056KiB (per-process highwater, not whole-task sampling). Initial free /workspace8619147264, /tmp15473672192 bytes; no deletion. Commands and exact outputs recorded beside report. Source report is independent of Root as code maker, but remains unsigned model-agent review, not a formal role/budget or signature.
