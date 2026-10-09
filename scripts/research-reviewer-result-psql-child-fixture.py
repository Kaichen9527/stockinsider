# Synthetic transport child only; never psql or a product RPC.
import json, os, sys, time
mode = sys.argv[1]
if mode == "pipe-closed":
    os.close(0)
    time.sleep(0.1)
    sys.stdout.write("closed")
elif mode == "stall":
    time.sleep(10)
else:
    data = sys.stdin.buffer.read()
    if mode == "consume":
        sys.stdout.write(json.dumps({"bytes": len(data), "args": sys.argv[2:]}))
    elif mode == "fail":
        sys.stdout.write("out")
        sys.stderr.write("sql failed")
        sys.exit(7)
    elif mode == "stdout-cap":
        sys.stdout.write("x" * 1048577)
    elif mode == "stderr-cap":
        sys.stderr.write("x" * 1048577)
    else:
        raise ValueError("unknown fixture mode")
