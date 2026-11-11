"""
NOUGEN/FLIX Kokoro text-to-speech sidecar.

Commands (each prints one JSON line on stdout):
  voices                 list the Kokoro voices the News tab can offer
  synth <voice> <wav>    read UTF-8 text from stdin and write a 24 kHz WAV to <wav>

Kokoro has no Haitian Creole voice; the News tab reads Creole with the selected voice.
"""

import json
import os
import sys

VOICES = {
    "af_heart": ("a", "American English · Heart (F)"),
    "af_bella": ("a", "American English · Bella (F)"),
    "af_nicole": ("a", "American English · Nicole (F)"),
    "af_sarah": ("a", "American English · Sarah (F)"),
    "am_adam": ("a", "American English · Adam (M)"),
    "am_michael": ("a", "American English · Michael (M)"),
    "bf_emma": ("b", "British English · Emma (F)"),
    "bm_george": ("b", "British English · George (M)"),
    "ff_siwis": ("f", "French · Siwis (F)"),
    "ef_dora": ("e", "Spanish · Dora (F)"),
    "em_alex": ("e", "Spanish · Alex (M)"),
}

SAMPLE_RATE = 24000


def _point_espeak_at_bundled_copy():
    """French and Spanish need espeak-ng. Use the copy under ~/.nougenflix unless the env already sets one."""
    if os.environ.get("PHONEMIZER_ESPEAK_LIBRARY"):
        return
    base = os.path.join(os.path.expanduser("~"), ".nougenflix", "espeak-ng", "eSpeak NG")
    dll = os.path.join(base, "libespeak-ng.dll")
    if os.path.exists(dll):
        os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = dll
        os.environ["PHONEMIZER_ESPEAK_PATH"] = os.path.join(base, "espeak-ng.exe")
        os.environ["ESPEAK_DATA_PATH"] = os.path.join(base, "espeak-ng-data")


def list_voices():
    return [{"id": vid, "lang": lang, "label": label} for vid, (lang, label) in VOICES.items()]


def synth(voice, out_path):
    if voice not in VOICES:
        return {"ok": False, "error": f"Unknown Kokoro voice {voice}"}
    text = sys.stdin.buffer.read().decode("utf-8", errors="replace").strip()
    if not text:
        return {"ok": False, "error": "No text to read"}

    _point_espeak_at_bundled_copy()
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code=VOICES[voice][0], repo_id="hexgrad/Kokoro-82M")
    chunks = [audio for _, _, audio in pipeline(text, voice=voice, speed=1.0)]
    if not chunks:
        return {"ok": False, "error": "Kokoro produced no audio"}
    audio = np.concatenate(chunks)
    sf.write(out_path, audio, SAMPLE_RATE)
    return {"ok": True, "path": out_path, "seconds": round(len(audio) / SAMPLE_RATE, 2)}


_PIPELINES = {}


def _pipeline(lang):
    """One loaded Kokoro pipeline per language code, kept for the life of the server."""
    if lang not in _PIPELINES:
        _point_espeak_at_bundled_copy()
        from kokoro import KPipeline

        _PIPELINES[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    return _PIPELINES[lang]


def synth_text(voice, text, out_path):
    """Same result as synth(), but with the text given and the pipeline reused."""
    if voice not in VOICES:
        return {"ok": False, "error": f"Unknown Kokoro voice {voice}"}
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "No text to read"}
    import numpy as np
    import soundfile as sf

    pipeline = _pipeline(VOICES[voice][0])
    chunks = [audio for _, _, audio in pipeline(text, voice=voice, speed=1.0)]
    if not chunks:
        return {"ok": False, "error": "Kokoro produced no audio"}
    audio = np.concatenate(chunks)
    sf.write(out_path, audio, SAMPLE_RATE)
    return {"ok": True, "path": out_path, "seconds": round(len(audio) / SAMPLE_RATE, 2)}


def serve():
    """Long-lived mode: one JSON request per stdin line, one JSON answer per stdout line.

    {"id": 1, "op": "warm", "voice": "af_heart"}  loads the pipeline for that voice's language
    {"id": 2, "op": "synth", "voice": "af_heart", "text": "...", "out": "x.wav"}
    A bad request gets an error answer; it never stops the server.
    """
    out = sys.stdout
    out.write(json.dumps({"ok": True, "ready": True}) + "\n")
    out.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            if req.get("op") == "warm":
                voice = req.get("voice", "")
                if voice not in VOICES:
                    ans = {"ok": False, "error": f"Unknown Kokoro voice {voice}"}
                else:
                    _pipeline(VOICES[voice][0])
                    ans = {"ok": True}
            elif req.get("op") == "synth":
                ans = synth_text(req.get("voice", ""), req.get("text", ""), req.get("out", ""))
            else:
                ans = {"ok": False, "error": f"Unknown op {req.get('op')!r}"}
        except Exception as exc:
            ans = {"ok": False, "error": str(exc)}
        ans["id"] = rid
        out.write(json.dumps(ans) + "\n")
        out.flush()


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "serve":
        serve()
        return
    try:
        if cmd == "voices":
            out = list_voices()
        elif cmd == "synth" and len(argv) >= 4:
            out = synth(argv[2], argv[3])
        else:
            out = {"ok": False, "error": f"Unknown command {cmd!r}"}
    except Exception as exc:  # the caller shows the message; nothing is retried here
        out = {"ok": False, "error": str(exc)}
    print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main(sys.argv)
