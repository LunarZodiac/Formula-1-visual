"""Persistent local rembg worker for driver portraits.

The process communicates over JSON Lines and keeps the ISNet session in memory so
the model is initialized once per development session instead of once per upload.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def respond(value: dict[str, object]) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


try:
    if not ((3, 11) <= sys.version_info[:2] < (3, 14)):
        raise RuntimeError("rembg требует Python 3.11–3.13")
    from rembg import new_session, remove
except Exception as error:  # pragma: no cover - reported to the Node parent
    respond({"type": "startup-error", "error": str(error)})
    raise SystemExit(1)


session = None
respond({"type": "ready"})

for raw_line in sys.stdin:
    try:
        request = json.loads(raw_line)
        request_id = str(request["id"])
        input_path = Path(request["inputPath"])
        output_path = Path(request["outputPath"])
        if session is None:
            session = new_session("isnet-general-use")
        output_path.write_bytes(remove(input_path.read_bytes(), session=session))
        respond({"type": "result", "id": request_id, "ok": True})
    except Exception as error:  # keep the worker alive after a bad image
        respond({
            "type": "result",
            "id": locals().get("request_id", "unknown"),
            "ok": False,
            "error": str(error),
        })
