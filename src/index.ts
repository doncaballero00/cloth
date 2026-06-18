#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic();

const GENERATE_SCRIPT_TOOL: Tool = {
  name: "generate_podcast_script",
  description:
    "Generate a full podcast script from a topic using Claude. Returns a structured script with intro, main segments, and outro.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "The main topic or theme for the podcast episode",
      },
      duration_minutes: {
        type: "number",
        description: "Target duration of the podcast in minutes (default: 10)",
      },
      hosts: {
        type: "array",
        items: { type: "string" },
        description:
          "Names of the podcast hosts (default: ['Alex', 'Jordan'])",
      },
      style: {
        type: "string",
        enum: ["conversational", "interview", "educational", "storytelling"],
        description: "The style of the podcast (default: conversational)",
      },
      target_audience: {
        type: "string",
        description:
          "Description of the target audience (default: general audience)",
      },
    },
    required: ["topic"],
  },
};

const TEXT_TO_SPEECH_TOOL: Tool = {
  name: "text_to_speech",
  description:
    "Convert podcast script text to speech audio. Supports OpenAI TTS (natural, requires OPENAI_API_KEY), ElevenLabs (most realistic, requires ELEVENLABS_API_KEY), or system espeak-ng as fallback.",
  inputSchema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "The text to convert to speech",
      },
      output_file: {
        type: "string",
        description: "Output file path for the audio (default: podcast_output.mp3)",
      },
      provider: {
        type: "string",
        enum: ["openai", "elevenlabs", "system"],
        description: "TTS provider: 'openai' (natural, set OPENAI_API_KEY), 'elevenlabs' (most realistic, set ELEVENLABS_API_KEY), 'system' (free espeak-ng fallback). Auto-detects from available env vars if omitted.",
      },
      voice: {
        type: "string",
        description: "Voice name. OpenAI: alloy, echo, fable, onyx, nova, shimmer (default: nova). ElevenLabs: voice ID or name (default: Rachel). System: en-us, en-gb, etc.",
      },
    },
    required: ["text"],
  },
};

const CREATE_PODCAST_TOOL: Tool = {
  name: "create_podcast",
  description:
    "All-in-one tool: generates a podcast script from a topic using Claude and optionally converts it to audio.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "The main topic or theme for the podcast episode",
      },
      duration_minutes: {
        type: "number",
        description: "Target duration of the podcast in minutes (default: 10)",
      },
      hosts: {
        type: "array",
        items: { type: "string" },
        description: "Names of the podcast hosts",
      },
      style: {
        type: "string",
        enum: ["conversational", "interview", "educational", "storytelling"],
        description: "The style of the podcast",
      },
      target_audience: {
        type: "string",
        description: "Description of the target audience",
      },
      generate_audio: {
        type: "boolean",
        description: "Whether to generate audio from the script (default: false)",
      },
      output_file: {
        type: "string",
        description: "Output file path if generating audio",
      },
      tts_provider: {
        type: "string",
        enum: ["openai", "elevenlabs", "system"],
        description: "TTS provider for audio generation (auto-detects from env vars if omitted)",
      },
      voice: {
        type: "string",
        description: "Voice name/ID for TTS (see text_to_speech tool for options)",
      },
    },
    required: ["topic"],
  },
};

const PODCAST_OUTLINE_TOOL: Tool = {
  name: "generate_podcast_outline",
  description:
    "Generate a structured outline for a podcast episode before writing the full script.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "The main topic for the podcast",
      },
      num_segments: {
        type: "number",
        description: "Number of main segments (default: 3)",
      },
      duration_minutes: {
        type: "number",
        description: "Target episode duration in minutes",
      },
    },
    required: ["topic"],
  },
};

async function generatePodcastScript(params: {
  topic: string;
  duration_minutes?: number;
  hosts?: string[];
  style?: string;
  target_audience?: string;
}): Promise<string> {
  const duration = params.duration_minutes ?? 10;
  const hosts = params.hosts ?? ["Alex", "Jordan"];
  const style = params.style ?? "conversational";
  const audience = params.target_audience ?? "general audience";
  const wordsPerMinute = 140;
  const targetWords = duration * wordsPerMinute;

  const hostList = hosts.join(" and ");

  const prompt = `You are a professional podcast writer. Create a complete, engaging podcast script for the following:

**Topic:** ${params.topic}
**Hosts:** ${hostList}
**Style:** ${style}
**Target Audience:** ${audience}
**Target Duration:** ${duration} minutes (approximately ${targetWords} words)

Write a full podcast script with:
1. An engaging intro that hooks listeners and introduces the topic
2. Host introductions (${hostList})
3. Main content divided into ${Math.max(2, Math.floor(duration / 3))} segments with natural back-and-forth dialogue
4. Interesting facts, anecdotes, or examples relevant to the topic
5. Smooth transitions between segments
6. A compelling outro with key takeaways and a call to action

Format the script clearly with:
- Speaker labels (e.g., "ALEX:", "JORDAN:")
- Stage directions in [brackets] where helpful
- Section headers (INTRO, SEGMENT 1, etc.)
- Natural, conversational language appropriate for the ${style} style
- [PAUSE] markers for dramatic effect where appropriate

Make it sound natural and engaging, not like it's being read from a script. Include specific details, not generic statements.`;

  const stream = await client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();

  const textContent = response.content.find((block) => block.type === "text");
  return textContent ? textContent.text : "Failed to generate script";
}

async function generatePodcastOutline(params: {
  topic: string;
  num_segments?: number;
  duration_minutes?: number;
}): Promise<string> {
  const numSegments = params.num_segments ?? 3;
  const duration = params.duration_minutes ?? 10;

  const prompt = `Create a structured podcast episode outline for the topic: "${params.topic}"

Requirements:
- ${numSegments} main content segments
- Target duration: ${duration} minutes total
- Include: intro hook, main segments with bullet points, outro

Format as a clear outline with:
- Episode title suggestion
- Hook/opening line idea
- ${numSegments} segments, each with: title, key points (3-5 bullets), estimated duration
- Outro with key takeaways
- Potential guest or research suggestions

Be specific and actionable, not generic.`;

  const stream = await client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();
  const textContent = response.content.find((block) => block.type === "text");
  return textContent ? textContent.text : "Failed to generate outline";
}

function detectTtsProvider(requested?: string): string {
  if (requested) return requested;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  return "system";
}

async function ttsOpenAI(params: {
  text: string;
  output_file: string;
  voice?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable not set");

  const voice = (params.voice ?? "nova") as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  if (!validVoices.includes(voice)) {
    throw new Error(`Invalid OpenAI voice. Choose from: ${validVoices.join(", ")}`);
  }

  const https = await import("https");
  const outputFile = params.output_file.endsWith(".mp3")
    ? params.output_file
    : params.output_file.replace(/\.[^.]+$/, "") + ".mp3";

  // OpenAI TTS supports up to 4096 chars per request — chunk for long scripts
  const CHUNK_SIZE = 4000;
  const chunks: string[] = [];
  let remaining = params.text;
  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }
    // Break at sentence boundary
    const slice = remaining.slice(0, CHUNK_SIZE);
    const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
    const breakAt = lastPeriod > CHUNK_SIZE * 0.5 ? lastPeriod + 1 : CHUNK_SIZE;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  const buffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const body = JSON.stringify({ model: "tts-1-hd", input: chunk, voice });

    const chunkBuf = await new Promise<Buffer>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.openai.com",
          path: "/v1/audio/speech",
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = "";
            res.on("data", (d) => (errBody += d));
            res.on("end", () => reject(new Error(`OpenAI TTS error ${res.statusCode}: ${errBody}`)));
            return;
          }
          const parts: Buffer[] = [];
          res.on("data", (d) => parts.push(d));
          res.on("end", () => resolve(Buffer.concat(parts)));
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    buffers.push(chunkBuf);
  }

  // Concatenate all MP3 chunks (MP3 frames are self-contained, simple concat works)
  fs.writeFileSync(outputFile, Buffer.concat(buffers));
  const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(1);
  return `Audio generated with OpenAI TTS!\nVoice: ${voice} (tts-1-hd)\nChunks: ${chunks.length}\nFile: ${path.resolve(outputFile)} (${sizeMB} MB)`;
}

async function ttsElevenLabs(params: {
  text: string;
  output_file: string;
  voice?: string;
}): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY environment variable not set");

  // Rachel (21m00Tcm4TlvDq8ikWAM) — warm, clear, natural female voice; free-tier friendly
  const voiceId = params.voice ?? "21m00Tcm4TlvDq8ikWAM";
  const outputFile = params.output_file.endsWith(".mp3")
    ? params.output_file
    : params.output_file.replace(/\.[^.]+$/, "") + ".mp3";

  const https = await import("https");

  // ElevenLabs supports up to ~5000 chars per request
  const CHUNK_SIZE = 4500;
  const chunks: string[] = [];
  let remaining = params.text;
  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }
    const slice = remaining.slice(0, CHUNK_SIZE);
    const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
    const breakAt = lastPeriod > CHUNK_SIZE * 0.5 ? lastPeriod + 1 : CHUNK_SIZE;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const body = JSON.stringify({
      text: chunk,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const chunkBuf = await new Promise<Buffer>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.elevenlabs.io",
          path: `/v1/text-to-speech/${voiceId}`,
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Accept: "audio/mpeg",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = "";
            res.on("data", (d) => (errBody += d));
            res.on("end", () => reject(new Error(`ElevenLabs error ${res.statusCode}: ${errBody}`)));
            return;
          }
          const parts: Buffer[] = [];
          res.on("data", (d) => parts.push(d));
          res.on("end", () => resolve(Buffer.concat(parts)));
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    buffers.push(chunkBuf);
  }

  fs.writeFileSync(outputFile, Buffer.concat(buffers));
  const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(1);
  return `Audio generated with ElevenLabs!\nVoice ID: ${voiceId} (eleven_turbo_v2_5)\nChunks: ${chunks.length}\nFile: ${path.resolve(outputFile)} (${sizeMB} MB)`;
}

async function ttsSystem(params: {
  text: string;
  output_file: string;
  voice?: string;
}): Promise<string> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const ttsTools = ["espeak-ng", "espeak", "say", "festival"];
  let availableTool: string | null = null;
  for (const tool of ttsTools) {
    try { await execAsync(`which ${tool}`); availableTool = tool; break; }
    catch { continue; }
  }

  if (!availableTool) {
    const textFile = params.output_file.replace(/\.(mp3|wav|ogg)$/, ".txt");
    fs.writeFileSync(textFile, params.text, "utf-8");
    return `No TTS engine found. Script saved as text to: ${path.resolve(textFile)}\nInstall espeak-ng: sudo apt-get install espeak-ng`;
  }

  const tempTextFile = "/tmp/podcast_tts_input.txt";
  fs.writeFileSync(tempTextFile, params.text, "utf-8");
  const wavFile = params.output_file.replace(/\.[^.]+$/, ".wav");

  let command: string;
  if (availableTool === "espeak-ng" || availableTool === "espeak") {
    command = `${availableTool} -v ${params.voice ?? "en-us"} -s 150 -f "${tempTextFile}" -w "${wavFile}"`;
  } else if (availableTool === "say") {
    command = `say -v ${params.voice ?? "Alex"} -o "${wavFile}" --data-format=LEF32@22050 -f "${tempTextFile}"`;
  } else {
    command = `text2wave "${tempTextFile}" -o "${wavFile}"`;
  }

  await execAsync(command);
  return `Audio generated with ${availableTool} (system TTS — robotic voice).\nFile: ${path.resolve(wavFile)}\nFor natural voices, set OPENAI_API_KEY or ELEVENLABS_API_KEY.`;
}

async function textToSpeech(params: {
  text: string;
  output_file?: string;
  provider?: string;
  voice?: string;
}): Promise<string> {
  const outputFile = params.output_file ?? "podcast_output.mp3";
  const provider = detectTtsProvider(params.provider);

  if (provider === "openai") {
    return ttsOpenAI({ text: params.text, output_file: outputFile, voice: params.voice });
  } else if (provider === "elevenlabs") {
    return ttsElevenLabs({ text: params.text, output_file: outputFile, voice: params.voice });
  } else {
    return ttsSystem({ text: params.text, output_file: outputFile, voice: params.voice });
  }
}

async function handleGenerateScript(args: Record<string, unknown>): Promise<string> {
  return generatePodcastScript({
    topic: args.topic as string,
    duration_minutes: args.duration_minutes as number | undefined,
    hosts: args.hosts as string[] | undefined,
    style: args.style as string | undefined,
    target_audience: args.target_audience as string | undefined,
  });
}

async function handleTextToSpeech(args: Record<string, unknown>): Promise<string> {
  return textToSpeech({
    text: args.text as string,
    output_file: args.output_file as string | undefined,
    provider: args.provider as string | undefined,
    voice: args.voice as string | undefined,
  });
}

async function handleCreatePodcast(args: Record<string, unknown>): Promise<string> {
  const script = await generatePodcastScript({
    topic: args.topic as string,
    duration_minutes: args.duration_minutes as number | undefined,
    hosts: args.hosts as string[] | undefined,
    style: args.style as string | undefined,
    target_audience: args.target_audience as string | undefined,
  });

  let result = `=== PODCAST SCRIPT ===\n\n${script}`;

  if (args.generate_audio) {
    result += "\n\n=== AUDIO GENERATION ===\n";
    const audioResult = await textToSpeech({
      text: script,
      output_file: (args.output_file as string) ?? "podcast_output.mp3",
      provider: args.tts_provider as string | undefined,
      voice: args.voice as string | undefined,
    });
    result += audioResult;
  }

  return result;
}

async function handleGenerateOutline(args: Record<string, unknown>): Promise<string> {
  return generatePodcastOutline({
    topic: args.topic as string,
    num_segments: args.num_segments as number | undefined,
    duration_minutes: args.duration_minutes as number | undefined,
  });
}

const server = new Server(
  {
    name: "podcast-generation-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    GENERATE_SCRIPT_TOOL,
    TEXT_TO_SPEECH_TOOL,
    CREATE_PODCAST_TOOL,
    PODCAST_OUTLINE_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{ type: "text", text: "No arguments provided" }],
      isError: true,
    };
  }

  try {
    let result: string;

    switch (name) {
      case "generate_podcast_script":
        result = await handleGenerateScript(args);
        break;
      case "text_to_speech":
        result = await handleTextToSpeech(args);
        break;
      case "create_podcast":
        result = await handleCreatePodcast(args);
        break;
      case "generate_podcast_outline":
        result = await handleGenerateOutline(args);
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errMsg}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Podcast Generation MCP Server running on stdio\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
