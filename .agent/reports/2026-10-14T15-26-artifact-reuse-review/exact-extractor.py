import hashlib, json, os, re, stat, tarfile, zipfile
from pathlib import Path, PurePosixPath

# Fixed successful upstream input; no caller-selected run/artifact or build fallback.
tmp = Path(os.environ['RUNNER_TEMP'])
export = tmp / 'standalone-export'
source = 'dd59817f750684b093965f539dd4de466be13077'
zip_hash = 'c3006c864a95d8cebb022d32d848baccec7ba99cfe95b9a1a6f446e7e002caed'
tar_hash = '398e71768ea0e7a5935282432c0edfcb2f47c953712b715562def95c3745add4'
manifest_hash = '344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a'
upstream = export / 'upstream'
metadata = json.loads((export / 'upstream-artifact-metadata.json').read_text())
run = json.loads((export / 'upstream-run.json').read_text())
assert metadata['id'] == 11904225538
assert metadata['name'] == 'reviewed-linux-standalone-' + source + '-38580440366-success'
assert metadata['size_in_bytes'] == 28254621 and metadata['expired'] is False
assert metadata['digest'] == 'sha256:' + zip_hash
assert metadata['workflow_run']['id'] == 38580440366
assert metadata['workflow_run']['repository_id'] == 1169909279
assert metadata['workflow_run']['head_repository_id'] == 1169909279
assert metadata['workflow_run']['head_sha'] == 'e902021ee9df537d4a8da2a2eaff3921084d44d7'
assert run['id'] == 38580440366 and run['status'] == 'completed' and run['conclusion'] == 'success'
assert run['repository']['id'] == 1169909279
assert run['head_sha'] == 'e902021ee9df537d4a8da2a2eaff3921084d44d7'
archive = tmp / 'reviewed-existing-artifact.zip'
assert archive.stat().st_size == 28254621
assert hashlib.sha256(archive.read_bytes()).hexdigest() == zip_hash
expected = {'SHA256SUMS', 'builder-canonical.log', 'builder-canonical.tap',
            'builder-correctness.json', 'package.json', 'packaged-boot.json',
            'packaged-boot.stderr', 'packaged-boot.stdout', 'release-manifest.json',
            'review-binding.json', 'source-identity.txt', 'stockinsider-linux.tar.gz', 'verification.json'}
upstream.mkdir(mode=0o700)
with zipfile.ZipFile(archive) as z:
    entries = z.infolist()
    assert len(entries) == 13 and {e.filename for e in entries} == expected
    assert sum(e.file_size for e in entries) < 64 * 1024 * 1024
    for e in entries:
        assert not e.is_dir() and not (e.flag_bits & 1)
        assert stat.S_IFMT(e.external_attr >> 16) in (0, stat.S_IFREG)
        with (upstream / e.filename).open('xb') as out:
            out.write(z.read(e))  # zipfile verifies CRC; whole ZIP is hash-bound above.
checks = (upstream / 'SHA256SUMS').read_text().splitlines()
assert len(checks) == 12
seen = set()
for row in checks:
    m = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)', row)
    assert m and m[2] in expected - {'SHA256SUMS'} and m[2] not in seen
    seen.add(m[2])
    assert hashlib.sha256((upstream / m[2]).read_bytes()).hexdigest() == m[1]
assert seen == expected - {'SHA256SUMS'}
assert hashlib.sha256((upstream / 'stockinsider-linux.tar.gz').read_bytes()).hexdigest() == tar_hash
assert hashlib.sha256((upstream / 'release-manifest.json').read_bytes()).hexdigest() == '127d7d9427c0122c547021b9a9a01e4b1d3ce960087a0cef1796e1b88e0ae943'
receipt = json.loads((upstream / 'release-manifest.json').read_text())
manifest = receipt['manifest']
assert receipt['manifestSha256'] == manifest_hash
assert manifest['sourceCommit'] == manifest['packagerCommit'] == manifest['releaseId'] == source
assert manifest['fileCount'] == 2586 and manifest['bytes'] == 79354761
assert manifest['entrypoint'] == 'app/server.js'
binding = json.loads((upstream / 'review-binding.json').read_text())
assert binding['sourceCommit'] == source and binding['sourceTree'] == '6a9a08af70fb94b50ed2b5eee6aaf3686f648b99'
assert binding['directChildEvidence'] == 'c2b146adb6d03814f2bd9a7af72baf003bb48812'
assert binding['reviewAttestationSha256'] == 'e0fed54595dda6ad3be4dfe8a9f4714b9912c754b13842ea28bdff99b9f8ebd3'
assert binding['builderWorkflowSha'] == binding['triggerCommit'] == 'c3995978bf9bb5dff5913fc709d9d30f674e55f2'
assert binding['runId'] == '38580440366'
assert binding['databaseConnectionAttempted'] is False and binding['deploymentPerformed'] is False
assert (upstream / 'source-identity.txt').read_text().splitlines() == [source, '6a9a08af70fb94b50ed2b5eee6aaf3686f648b99', 'c516655efaac8260b1bcf5938f8f4d65ab61ad44']
release_parent = tmp / 'reviewed-standalone'
release_parent.mkdir(mode=0o700)
with tarfile.open(upstream / 'stockinsider-linux.tar.gz', 'r:gz') as t:
    members = t.getmembers()
    assert len(members) == 3101
    regular = [m for m in members if m.isfile()]
    assert len(regular) == 2587 and sum(m.size for m in regular) == 79955758
    paths = set()
    for m in members:
        name = m.name.rstrip('/')
        parts = PurePosixPath(name).parts
        assert name and not name.startswith('/') and '\\' not in name
        assert parts[0] == source and all(p not in ('', '.', '..') for p in name.split('/'))
        assert name not in paths and (m.isdir() or m.isfile())
        assert not (m.mode & 0o7000)
        paths.add(name)
    for m in members:
        destination = release_parent / m.name
        if m.isdir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open('xb') as out, t.extractfile(m) as src:
                for block in iter(lambda: src.read(1024 * 1024), b''): out.write(block)
            destination.chmod(m.mode & 0o777)
assert (release_parent / source / 'release-manifest.json').read_bytes() == (upstream / 'release-manifest.json').read_bytes()
proof = {'artifactId': 11904225538, 'upstreamRunId': 38580440366,
         'zipSha256': zip_hash, 'tarSha256': tar_hash, 'manifestSha256': manifest_hash,
         'sourceCommit': source, 'directChildEvidence': binding['directChildEvidence'],
         'upstreamBuilderSubject': binding['builderWorkflowSha'],
         'currentBuilderSubject': os.environ['GITHUB_SHA'], 'currentRunId': os.environ['GITHUB_RUN_ID'],
         'upstreamTestsAttributedToCurrentBuilder': False, 'applicationRebuilt': False,
         'safeTarMembers': len(members), 'fullOriginalVerifierReceipt': 'reuse-full-verification.json',
         'productionReadinessProven': False, 'deploymentPerformed': False}
(export / 'reuse-provenance.json').write_text(json.dumps(proof, indent=2) + '\n')