# Podcast Generation MCP Plugin

An MCP (Model Context Protocol) server that gives Claude the ability to generate podcast scripts and audio.

## Tools

| Tool | Description |
|------|-------------|
| `generate_podcast_script` | Generate a full podcast script from a topic using Claude |
| `generate_podcast_outline` | Create a structured outline before writing a full script |
| `text_to_speech` | Convert script text to audio (requires espeak-ng or system TTS) |
| `create_podcast` | All-in-one: generate script and optionally convert to audio |

## Setup

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Set your Anthropic API key

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### 3. Add to Claude Code (`~/.claude/claude_desktop_config.json` or equivalent)

```json
{
  "mcpServers": {
    "podcast-generation": {
      "command": "node",
      "args": ["/path/to/cloth/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here"
      }
    }
  }
}
```

### 4. TTS for audio generation (pick one)

**Option A — OpenAI TTS** (natural, ~$0.03 for a 10-min episode):
```bash
export OPENAI_API_KEY=sk-...
```
Voices: `nova` (default), `alloy`, `echo`, `fable`, `onyx`, `shimmer`

**Option B — ElevenLabs** (most realistic, free tier = 10k chars/month):
```bash
export ELEVENLABS_API_KEY=your_key_here
```
Default voice: Rachel. Pass any ElevenLabs voice ID as the `voice` parameter.

**Option C — Local neural voice** (free AND natural, fully offline):
```bash
# Downloads a Piper neural voice (~110 MB) and installs the runtime
bash scripts/setup_neural_voice.sh
export PODCAST_VOICE_DIR=$HOME/.local/share/podcast-voices/vits-piper-en_US-ryan-high
```
Runs entirely on your machine via `sherpa-onnx` — no API key, nothing leaves
your computer. Voices sound natural (far better than espeak). Swap voices by
passing another name to the setup script, e.g.
`bash scripts/setup_neural_voice.sh vits-piper-en_US-amy-medium`.

**Option D — System TTS** (free, robotic fallback):
```bash
# Ubuntu/Debian
sudo apt-get install espeak-ng
# macOS uses built-in `say` automatically
```

The plugin auto-selects the best available provider: OpenAI → ElevenLabs →
local neural → system, based on which env vars are set. Override per-call with
the `provider` / `tts_provider` parameter.

## Usage Examples

Once installed in Claude Code, you can say:

- *"Generate a 10-minute podcast about the future of AI"*
- *"Create a podcast outline for an episode about climate change with 4 segments"*
- *"Make a podcast about quantum computing in an educational style for high school students"*
- *"Create a full podcast about space exploration and generate audio output"*

## Example Tool Calls

Generate a script only:
```json
{
  "tool": "generate_podcast_script",
  "arguments": {
    "topic": "The history of jazz music",
    "duration_minutes": 15,
    "hosts": ["Sarah", "Mike"],
    "style": "conversational"
  }
}
```

Convert existing text to natural audio (OpenAI):
```json
{
  "tool": "text_to_speech",
  "arguments": {
    "text": "Welcome to the show...",
    "provider": "openai",
    "voice": "nova",
    "output_file": "episode.mp3"
  }
}
```

All-in-one with ElevenLabs audio:
```json
{
  "tool": "create_podcast",
  "arguments": {
    "topic": "Quantum computing for beginners",
    "duration_minutes": 10,
    "generate_audio": true,
    "tts_provider": "elevenlabs",
    "output_file": "quantum.mp3"
  }
}
```
