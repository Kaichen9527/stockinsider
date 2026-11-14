#!/usr/bin/env python3
"""Fixed-FD dedicated staging DB entry; see handoff contract before execution."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.stage_database_restore import main

if __name__=='__main__':
    raise SystemExit(main())
