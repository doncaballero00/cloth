#!/usr/bin/env python3
"""Local neural TTS using sherpa-onnx + a Piper VITS voice model.

Runs entirely offline once the voice model is downloaded — no API keys,
no external services at synthesis time. Used by the podcast MCP server as
the "local" TTS provider.

Usage:
    python3 neural_tts.py --text-file INPUT.txt --out OUTPUT.wav \
        --model-dir /path/to/voice-model [--speed 0.96]

The model dir must contain: <voice>.onnx, tokens.txt, and espeak-ng-data/.
Download voices from sherpa-onnx GitHub releases, e.g.:
    https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-high.tar.bz2
"""
import argparse
import glob
import os
import sys


def find_model(model_dir: str) -> str:
    onnx = glob.glob(os.path.join(model_dir, "*.onnx"))
    if not onnx:
        sys.exit(f"No .onnx model found in {model_dir}")
    return onnx[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True, help="UTF-8 text to synthesize")
    ap.add_argument("--out", required=True, help="Output WAV path")
    ap.add_argument("--model-dir", required=True, help="Dir with .onnx, tokens.txt, espeak-ng-data/")
    ap.add_argument("--speed", type=float, default=0.96, help="Speech rate (1.0 = natural)")
    ap.add_argument("--sid", type=int, default=0, help="Speaker id for multi-speaker models")
    args = ap.parse_args()

    try:
        import sherpa_onnx
        import soundfile as sf
    except ImportError:
        sys.exit("Missing deps. Install with: pip install sherpa-onnx soundfile")

    with open(args.text_file, encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        sys.exit("Input text is empty")

    model = find_model(args.model_dir)
    tokens = os.path.join(args.model_dir, "tokens.txt")
    data_dir = os.path.join(args.model_dir, "espeak-ng-data")

    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=model,
                tokens=tokens,
                data_dir=data_dir,
            ),
            num_threads=max(2, os.cpu_count() or 2),
        ),
        max_num_sentences=2,
    )
    tts = sherpa_onnx.OfflineTts(config)
    audio = tts.generate(text, sid=args.sid, speed=args.speed)
    sf.write(args.out, audio.samples, audio.sample_rate)

    dur = len(audio.samples) / audio.sample_rate
    print(f"OK {args.out} {dur:.1f}s {audio.sample_rate}Hz")


if __name__ == "__main__":
    main()
