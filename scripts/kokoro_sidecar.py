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


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
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
