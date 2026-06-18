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

### 4. Optional: Install TTS for audio generation

```bash
# Ubuntu/Debian
sudo apt-get install espeak-ng

# macOS (built-in `say` is used automatically)
```

## Usage Examples

Once installed in Claude Code, you can say:

- *"Generate a 10-minute podcast about the future of AI"*
- *"Create a podcast outline for an episode about climate change with 4 segments"*
- *"Make a podcast about quantum computing in an educational style for high school students"*
- *"Create a full podcast about space exploration and generate audio output"*

## Example Tool Call

```json
{
  "tool": "create_podcast",
  "arguments": {
    "topic": "The history of jazz music",
    "duration_minutes": 15,
    "hosts": ["Sarah", "Mike"],
    "style": "conversational",
    "target_audience": "music enthusiasts",
    "generate_audio": true,
    "output_file": "jazz_history.wav"
  }
}
```
