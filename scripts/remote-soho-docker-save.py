#!/usr/bin/env python3
"""Read-only, exact SOHO candidate export. It never removes or retags an image."""

import json
import hashlib
import subprocess
import sys


CANDIDATES = {
    "soho-rollback/soho-api:20260913T112602Z": "sha256:3875289564a8e9b43378c43bed2de257ea35e9ed9eab6c39b64755b878c60c9c",
    "soho-rollback/soho-staging-api:20260913T111004Z": "sha256:988a77e497ed872374282145b1c4f4129a829a9890e0de9d49706a0a2e5a0591",
    "soho-rollback/soho-staging-web:20260913T111004Z": "sha256:6f2c1efb1e1b59898fe671220b377ea8426d9cb589b1436f93e1ebe07ee18122",
    "soho-rollback/soho-staging-worker:20260913T111004Z": "sha256:75593affa7a7161f8a221cd81a48761c7948ef44b21590ba7abc53709940589f",
    "soho-rollback/soho-web:20260913T112602Z": "sha256:88784daad15a2c445d42291d7203d226adf050bf16b6d3c66bb88775c05c0456",
    "soho-rollback/soho-worker:20260913T112602Z": "sha256:0134257c1ca37bb259505ae02ac9f1ce4172d06867573f4baf20e16c80c66654",
    "soho-rollback/soho-live-canary-api:20260912T050458Z": "sha256:3e6264f6b8a3ed7c803b4049fae4141e912ddf5bb2d8832c258a057791c8dcf6",
    "soho-rollback/soho-live-canary-calendar-worker:20260912T050458Z": "sha256:d15f254bdcf0e5297fcec5db83944b09b896937320442e3317a83e08ab1acd28",
    "soho-rollback/soho-live-canary-web:20260912T050458Z": "sha256:ec0d4e36011b532e4d113da316999dc0f35ecfea6efcec169ef5c687f3f4ab10",
    "soho-rollback/soho-live-canary-worker:20260912T050458Z": "sha256:a6914b83728eb4f57ec3ff302176f250df2ec863c8dfcf955bb684f4189e9fd4",
}


def emit(value):
    sys.stderr.write("STOCKINSIDER_META\t" + json.dumps(value, sort_keys=True) + "\n")
    sys.stderr.flush()


def inspect_images(refs):
    result = []
    for ref in refs:
        raw = subprocess.run(
            ["/usr/bin/docker", "image", "inspect", ref],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        value = json.loads(raw.stdout)
        if len(value) != 1:
            raise RuntimeError("image_inspect_ambiguous")
        image = value[0]
        expected = CANDIDATES[ref]
        if image.get("Id") != expected or ref not in (image.get("RepoTags") or []):
            raise RuntimeError("image_identity_changed")
        layers = image.get("RootFS", {}).get("Layers") or []
        if not layers or not all(isinstance(item, str) and item.startswith("sha256:") for item in layers):
            raise RuntimeError("image_layers_invalid")
        result.append({
            "ref": ref,
            "imageId": image["Id"],
            "configJsonSha256": hashlib.sha256(json.dumps(
                image.get("Config") or {}, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest(),
            "architecture": image.get("Architecture"),
            "os": image.get("Os"),
            "size": image.get("Size"),
            "rootFsLayers": layers,
        })
    return result


def main():
    refs = sys.argv[1:]
    if refs != sorted(CANDIDATES) or len(refs) != len(CANDIDATES):
        raise RuntimeError("exact_candidate_set_required")
    before = inspect_images(refs)
    emit({"phase": "before", "images": before})
    save = subprocess.Popen(
        ["/usr/bin/docker", "image", "save", *refs],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    compressor = subprocess.Popen(
        ["/usr/bin/zstd", "-T1", "-3", "-c"],
        stdin=save.stdout,
        stdout=sys.stdout.buffer,
        stderr=subprocess.DEVNULL,
    )
    save.stdout.close()
    compressor_status = compressor.wait()
    save_status = save.wait()
    if save_status != 0 or compressor_status != 0:
        raise RuntimeError("docker_save_failed")
    after = inspect_images(refs)
    if before != after:
        raise RuntimeError("image_identity_changed_during_export")
    emit({"phase": "after", "images": after})


try:
    main()
except Exception as error:
    emit({"phase": "failed", "reason": str(error)})
    raise SystemExit(1)
