#!/usr/bin/env python3
"""Fixed staging reader-preflight workflow; host FD3–8 contract unchanged."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.stage_reader_preflight import main

if __name__=='__main__':
    raise SystemExit(main())
