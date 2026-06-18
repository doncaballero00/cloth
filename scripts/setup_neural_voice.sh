#!/usr/bin/env bash
# Download a free neural Piper voice model for local TTS (no API key needed).
# Models are hosted as sherpa-onnx GitHub release assets.
set -euo pipefail

VOICE="${1:-vits-piper-en_US-ryan-high}"
DEST="${2:-$HOME/.local/share/podcast-voices}"

mkdir -p "$DEST"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${VOICE}.tar.bz2"

echo "Downloading $VOICE ..."
curl -L --fail -o "/tmp/${VOICE}.tar.bz2" "$URL"

echo "Extracting to $DEST ..."
tar xjf "/tmp/${VOICE}.tar.bz2" -C "$DEST"
rm -f "/tmp/${VOICE}.tar.bz2"

echo "Installing Python runtime ..."
pip install --quiet sherpa-onnx soundfile

echo "Done. Voice model at: $DEST/$VOICE"
echo "Set PODCAST_VOICE_DIR=$DEST/$VOICE to use it with the plugin."

# Other good free voices to try as the first argument:
#   vits-piper-en_US-ryan-high      (warm male, default)
#   vits-piper-en_US-amy-medium     (clear female)
#   vits-piper-en_US-hfc_female-medium
#   vits-piper-en_GB-alba-medium    (British female)
