#!/usr/bin/env node

const fs = require("node:fs");

const ENDPOINTS = Object.freeze({
  global: "https://api.minimax.io/v1/t2a_v2",
  cn: "https://api.minimaxi.com/v1/t2a_v2",
});

const MODELS = Object.freeze([
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
]);

const FORMATS = Object.freeze(["mp3", "wav", "flac", "pcm"]);
const DEFAULT_MODEL = "speech-2.8-hd";

function usage() {
  return [
    "Usage: tts.js <text> [options]",
    "",
    "Options:",
    `  --model <model>    Speech model (default: ${DEFAULT_MODEL})`,
    "  --voice <voice>    MiniMax voice ID",
    "  --format <format>  mp3, wav, flac, or pcm (default: mp3)",
    "  --output <file>    Output path (default: speech.<format>)",
    "  --region <region>  global or cn (default: global)",
    "  -h, --help         Show this help",
  ].join("\n");
}

function optionValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    text: null,
    model: DEFAULT_MODEL,
    voice: null,
    format: "mp3",
    output: null,
    region: "global",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }

    if (["--model", "--voice", "--format", "--output", "--region"].includes(arg)) {
      const value = optionValue(args, index, arg);
      const key = arg.slice(2);
      options[key] = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.text !== null) {
      throw new Error("Provide text as one quoted argument");
    }
    options.text = arg;
  }

  if (!options.text) {
    throw new Error("Text is required");
  }
  if (!MODELS.includes(options.model)) {
    throw new Error(`Unsupported model: ${options.model}`);
  }
  if (!FORMATS.includes(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`);
  }
  if (!Object.hasOwn(ENDPOINTS, options.region)) {
    throw new Error(`Unsupported region: ${options.region}`);
  }

  options.output ||= `speech.${options.format}`;
  return options;
}

function buildRequest(options) {
  const request = {
    model: options.model,
    text: options.text,
    stream: false,
    output_format: "hex",
    audio_setting: {
      format: options.format,
    },
  };

  if (options.voice) {
    request.voice_setting = { voice_id: options.voice };
  }

  return request;
}

function decodeAudio(audio) {
  if (typeof audio !== "string" || audio.length === 0 || audio.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(audio)) {
    throw new Error("The API response did not contain valid hexadecimal audio data");
  }
  return Buffer.from(audio, "hex");
}

async function generateSpeech(options, dependencies = {}) {
  const apiKey = dependencies.apiKey ?? process.env.MINIMAX_API_KEY;
  const fetchImplementation = dependencies.fetchImplementation ?? globalThis.fetch;
  const writeFile = dependencies.writeFile ?? fs.writeFileSync;

  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY environment variable is required");
  }
  if (typeof fetchImplementation !== "function") {
    throw new Error("Node.js 18 or later is required");
  }

  const response = await fetchImplementation(ENDPOINTS[options.region], {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRequest(options)),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`MiniMax request failed with HTTP ${response.status}`);
  }

  const apiStatus = result.base_resp?.status_code;
  if (!response.ok || (apiStatus !== undefined && apiStatus !== 0)) {
    const message = result.base_resp?.status_msg || `HTTP ${response.status}`;
    throw new Error(`MiniMax request failed: ${message}`);
  }

  const audio = decodeAudio(result.data?.audio);
  writeFile(options.output, audio);
  return { output: options.output, bytes: audio.length };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await generateSpeech(options);
    console.log(`Audio written to ${result.output} (${result.bytes} bytes)`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_MODEL,
  ENDPOINTS,
  FORMATS,
  MODELS,
  buildRequest,
  decodeAudio,
  generateSpeech,
  parseArgs,
  usage,
};
