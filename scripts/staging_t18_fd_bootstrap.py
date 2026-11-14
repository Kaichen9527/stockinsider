#!/usr/bin/env python3
"""Fixed FD-only T18 bootstrap; separate from any keyless admission entry."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.t18_fd_handoff import bootstrap_main

if __name__=='__main__':
    raise SystemExit(bootstrap_main())
