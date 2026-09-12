#!/usr/bin/env python3
"""Read-only, exact SOHO candidate export. It never removes or retags an image."""

import json
import hashlib
import subprocess
import sys


CANDIDATES = {
    "soho-rollback/soho-api:20260911T151041Z": "sha256:62b8490d90544a132311fc4afd04f72c25733f51fc1ebe66422d672ea4d3af93",
    "soho-rollback/soho-web:20260911T151041Z": "sha256:5037ade762b451bcf52e562c9ee1dce6ed195c4203dd7710eed83c37fb1e6293",
    "soho-rollback/soho-worker:20260911T151041Z": "sha256:840b210f90f8f4a5c2c06d0283c5713c6dc9530345ea6fad60dd46a253627fb5",
    "soho-rollback/soho-staging-api:20260912T004955Z": "sha256:aa239a511039edff6b52f4ad078118b48ae59ff8f45e3cb1af6348241f2d8737",
    "soho-rollback/soho-staging-web:20260912T004955Z": "sha256:1e3a67e6af707dc3c7da76fa9184309e8ae17bd93e94e507210eb2773d75179a",
    "soho-rollback/soho-staging-worker:20260912T004955Z": "sha256:65a53fe075fee77007a2c9bc6d84ca463a019cc259cd87ac1b4d0acb805bbf0a",
    "soho-rollback/soho-live-canary-api:20260911T152751Z": "sha256:6466cec3ffd6604424cf882ea33eedaf80045daaaf67108924ca18e68a2b1a94",
    "soho-rollback/soho-live-canary-calendar-worker:20260911T152751Z": "sha256:1bf56c4659e6a50ca447e18e2ae8aaa3d70e91f8023d25663bc6f54144b66f08",
    "soho-rollback/soho-live-canary-web:20260911T152751Z": "sha256:3d13d731f09d5aab21380b886a54046bc5f7d7b76fcc6ec112cda4ecbb7db668",
    "soho-rollback/soho-live-canary-worker:20260911T152751Z": "sha256:ad7b5e99088a94616702b4cadbc8b84f81b090af144383bab1ed348ddd5d6295",
    "soho-rollback/soho-live-canary-api:20260911T153552Z": "sha256:6466cec3ffd6604424cf882ea33eedaf80045daaaf67108924ca18e68a2b1a94",
    "soho-rollback/soho-live-canary-calendar-worker:20260911T153552Z": "sha256:1bf56c4659e6a50ca447e18e2ae8aaa3d70e91f8023d25663bc6f54144b66f08",
    "soho-rollback/soho-live-canary-web:20260911T153552Z": "sha256:3d13d731f09d5aab21380b886a54046bc5f7d7b76fcc6ec112cda4ecbb7db668",
    "soho-rollback/soho-live-canary-worker:20260911T153552Z": "sha256:ad7b5e99088a94616702b4cadbc8b84f81b090af144383bab1ed348ddd5d6295",
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
    process = subprocess.Popen(
        ["/usr/bin/docker", "image", "save", *refs],
        stdout=sys.stdout.buffer,
        stderr=subprocess.DEVNULL,
    )
    if process.wait() != 0:
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
