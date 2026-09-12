#!/usr/bin/env python3
"""Read-only, exact SOHO candidate export. It never removes or retags an image."""

import json
import hashlib
import subprocess
import sys


CANDIDATES = {
    "soho-rollback/soho-api:20260912T023125Z": "sha256:e030a787d3beb14f345fe37114cf0b21edbab406b85af4c8ec35b398858c7a08",
    "soho-rollback/soho-live-canary-api:20260911T152751Z": "sha256:6466cec3ffd6604424cf882ea33eedaf80045daaaf67108924ca18e68a2b1a94",
    "soho-rollback/soho-live-canary-calendar-worker:20260911T152751Z": "sha256:1bf56c4659e6a50ca447e18e2ae8aaa3d70e91f8023d25663bc6f54144b66f08",
    "soho-rollback/soho-live-canary-web:20260911T152751Z": "sha256:3d13d731f09d5aab21380b886a54046bc5f7d7b76fcc6ec112cda4ecbb7db668",
    "soho-rollback/soho-live-canary-worker:20260911T152751Z": "sha256:ad7b5e99088a94616702b4cadbc8b84f81b090af144383bab1ed348ddd5d6295",
    "soho-rollback/soho-live-canary-api:20260911T153552Z": "sha256:6466cec3ffd6604424cf882ea33eedaf80045daaaf67108924ca18e68a2b1a94",
    "soho-rollback/soho-live-canary-calendar-worker:20260911T153552Z": "sha256:1bf56c4659e6a50ca447e18e2ae8aaa3d70e91f8023d25663bc6f54144b66f08",
    "soho-rollback/soho-live-canary-web:20260911T153552Z": "sha256:3d13d731f09d5aab21380b886a54046bc5f7d7b76fcc6ec112cda4ecbb7db668",
    "soho-rollback/soho-live-canary-worker:20260911T153552Z": "sha256:ad7b5e99088a94616702b4cadbc8b84f81b090af144383bab1ed348ddd5d6295",
    "soho-rollback/soho-live-canary-api:20260912T024829Z": "sha256:63d1496d7a0268c7450f649862fb18239825de1a4cc7a1171ecf787b0c005eb7",
    "soho-rollback/soho-live-canary-calendar-worker:20260912T024829Z": "sha256:860524803281d2cd3a75abdc598c7312da26628acb15e98aa3d1f611ef91c9d6",
    "soho-rollback/soho-live-canary-web:20260912T024829Z": "sha256:8d0d7ba38ff8eb2e2a12c8d98142bf22834c305dbb0f7ea63ba6ee97ab6ddb4e",
    "soho-rollback/soho-live-canary-worker:20260912T024829Z": "sha256:7f1e9e7bb35b1f6266659b09c1624d3664f5c652db7dbab652020e0f046a5b04",
    "soho-rollback/soho-staging-api:20260912T021616Z": "sha256:bfe8ff0d1faf2fb14d1ab7cb6ccf6187f021c277675960ffa29a3c703a76116a",
    "soho-rollback/soho-staging-web:20260912T021616Z": "sha256:4e18fe356b8e7169caf77ae86e8509ababaa34c3de09434370af956446f11835",
    "soho-rollback/soho-staging-worker:20260912T021616Z": "sha256:9247da8b9b9183f3c2b8a90387f344b0f8bbcc0ea4504fda8ae0139bba9e7bf4",
    "soho-rollback/soho-web:20260912T023125Z": "sha256:326f2099a0b03fc3bf5311eeacf8821c0d4fd4110ce1945e6274e2e327c41201",
    "soho-rollback/soho-worker:20260912T023125Z": "sha256:5ca5688af3f3a56df77851605afa84e54c3912fdb461ff6f47736a08cb201691",
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
