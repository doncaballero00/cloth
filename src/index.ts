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
    "Convert podcast script text to speech audio using the system's built-in TTS. Saves audio to a file.",
  inputSchema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "The text to convert to speech",
      },
      output_file: {
        type: "string",
        description:
          "Output file path for the audio (default: podcast_output.mp3)",
      },
      voice: {
        type: "string",
        description: "Voice to use for TTS (system-dependent)",
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

async function textToSpeech(params: {
  text: string;
  output_file?: string;
  voice?: string;
}): Promise<string> {
  const outputFile = params.output_file ?? "podcast_output.wav";

  // Try espeak-ng first (most common on Linux)
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Check what TTS tools are available
  const ttsTools = ["espeak-ng", "espeak", "say", "festival"];
  let availableTool: string | null = null;

  for (const tool of ttsTools) {
    try {
      await execAsync(`which ${tool}`);
      availableTool = tool;
      break;
    } catch {
      continue;
    }
  }

  if (!availableTool) {
    // Save as plain text file if no TTS available
    const textFile = outputFile.replace(/\.(mp3|wav|ogg)$/, ".txt");
    fs.writeFileSync(textFile, params.text, "utf-8");
    return `No TTS engine found on system. Script saved as text to: ${path.resolve(textFile)}\n\nTo enable audio generation, install espeak-ng: sudo apt-get install espeak-ng`;
  }

  // Truncate text for audio preview (full scripts can be very long)
  const textForAudio = params.text.slice(0, 5000);
  const tempTextFile = "/tmp/podcast_tts_input.txt";
  fs.writeFileSync(tempTextFile, textForAudio, "utf-8");

  const wavFile = outputFile.endsWith(".wav") ? outputFile : outputFile.replace(/\.[^.]+$/, ".wav");

  let command: string;
  if (availableTool === "espeak-ng" || availableTool === "espeak") {
    const voice = params.voice ?? "en";
    command = `${availableTool} -v ${voice} -s 150 -f "${tempTextFile}" -w "${wavFile}"`;
  } else if (availableTool === "say") {
    // macOS
    const voice = params.voice ?? "Alex";
    command = `say -v ${voice} -o "${wavFile}" --data-format=LEF32@22050 -f "${tempTextFile}"`;
  } else {
    // festival
    command = `text2wave "${tempTextFile}" -o "${wavFile}"`;
  }

  try {
    await execAsync(command);
    const absolutePath = path.resolve(wavFile);
    return `Audio generated successfully!\nFile: ${absolutePath}\nEngine: ${availableTool}\nNote: Audio is a preview of the first 5000 characters of the script.`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return `TTS generation failed: ${errMsg}\n\nScript text has been prepared but audio conversion failed.`;
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
      output_file: (args.output_file as string) ?? "podcast_output.wav",
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
