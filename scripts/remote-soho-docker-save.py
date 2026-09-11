#!/usr/bin/env python3
"""Read-only, exact SOHO candidate export. It never removes or retags an image."""

import json
import subprocess
import sys


CANDIDATES = {
    "soho-rollback/soho-api:20260910T231911Z": "sha256:5bc8b33e7db261c4416dfef480d72cd1bc202a71fca1d9ef555db40601702928",
    "soho-rollback/soho-web:20260910T231911Z": "sha256:38a1fc825a21b11d764946437c30d69a0caa955d23f0c965a77e2c64159d68d8",
    "soho-rollback/soho-worker:20260910T231911Z": "sha256:305a4fd9a1adaad9900472bbeba1075c7e55cb2da312235f28809bca9c2a65b7",
    "soho-rollback/soho-live-canary-api:20260910T220957Z": "sha256:baf21214fa1d4d37ab480fd89f94debcd1945b3d120d8dffd787d9825e89d81f",
    "soho-rollback/soho-live-canary-calendar-worker:20260910T220957Z": "sha256:75b62a7e3288ffe942a6eaea36ab43f022e81c87f0c7d92a22c972bf2a6531d9",
    "soho-rollback/soho-live-canary-web:20260910T220957Z": "sha256:58a03c8f802ef6d459b3c1b8e2afa626cce54ce3c4450261f4426682c607e417",
    "soho-rollback/soho-live-canary-worker:20260910T220957Z": "sha256:25d30158cc2a755b755973352c550a8b86a5ca63ff60602a2c0bc796199af976",
    "soho-rollback/soho-live-canary-api:20260910T233603Z": "sha256:6456d6328cba3355f295818bc99e7f22108998b3d38dfe04f56df1f6de741ad4",
    "soho-rollback/soho-live-canary-calendar-worker:20260910T233603Z": "sha256:ec575d45893c157347a5cd0025d8f015845b7e4ac36d226ef2b992dd98c7084b",
    "soho-rollback/soho-live-canary-web:20260910T233603Z": "sha256:63064c2dde1cd9382ba21771dd0f30d41ff6995ee6b9368ebd9f94ce8c9aac85",
    "soho-rollback/soho-live-canary-worker:20260910T233603Z": "sha256:b920e8be5ef7b3ef4536b93b9021ca761457560159f2cfe38d4ef63cbf3b8503",
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
            "configDigest": image["Id"],
            "architecture": image.get("Architecture"),
            "os": image.get("Os"),
            "size": image.get("Size"),
            "rootFsLayers": layers,
        })
    return result


def main():
    refs = sys.argv[1:]
    if refs != sorted(CANDIDATES) or len(refs) != 11:
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
