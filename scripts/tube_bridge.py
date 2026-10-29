"""NouGenTube bridge for NouGenNews: one video in, JSON out.

Recall first (the nougentube rule): if the grid already holds tube:<id> the verbatim capture is not repeated. Then the
transcript and metadata come through nougentube's own tiers, and the fleet's recalled knowledge about writing news
(style shards) is returned so the writer is guided by what NouGen already knows, not by a prompt baked into the app.

usage: python tube_bridge.py <nougen_dir> <video_id> [--capture]
"""
import json
import os
import sys

nougen = sys.argv[1]
vid = sys.argv[2]
sys.path.insert(0, os.path.join(nougen, "src"))
sys.path.insert(0, os.path.join(nougen, "tools"))
os.environ.setdefault("NOUGEN_VAULT_DIR", os.path.expanduser("~/.nougen/shards"))

import nougentube as nt  # noqa: E402

url = f"https://www.youtube.com/watch?v={vid}"
out = {"id": vid, "known": False, "transcript": "", "tier": None, "meta": {}, "style": ""}
try:
    out["known"] = bool(nt.dedupe_check(vid))
except Exception:
    pass
try:
    text, tier = nt.fetch_transcript(vid, url)
    out["transcript"], out["tier"] = text or "", tier
except Exception:
    pass
try:
    out["meta"] = nt.fetch_metadata(url, vid)
except Exception:
    pass
try:
    import nougen_shards.core as core
    hits = core.retrieve("how to write a news article from a source: inverted pyramid, attribution, headline style", limit=4)
    out["style"] = core.compile_recall_packet(hits, token_budget=900)
except Exception:
    pass
if "--capture" in sys.argv and not out["known"] and out["transcript"]:
    try:
        nt.process_video(url)  # the verbatim, era-stamped capture other lanes recall (tag tube:<id>)
    except Exception:
        pass
sys.stdout.write(json.dumps(out))
