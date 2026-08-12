---
name: minimax-tts
description: Convert text to an audio file with the MiniMax text-to-speech API. Supports global and China endpoints, current speech models, voices, and MP3, WAV, FLAC, or PCM output.
---

# MiniMax Text to Speech

Generate speech from text with the MiniMax synchronous text-to-audio API.

## Setup

Create an API key at https://platform.minimax.io and add it to your shell profile:

```bash
export MINIMAX_API_KEY="your-api-key-here"
```

## Usage

```bash
{baseDir}/tts.js "Hello from MiniMax" --output greeting.mp3
{baseDir}/tts.js "Hello" --voice English_expressive_narrator
{baseDir}/tts.js "Hello" --model speech-2.8-turbo --format wav --output greeting.wav
{baseDir}/tts.js "你好" --region cn --output greeting.mp3
```

The default model is `speech-2.8-hd`, the default region is `global`, and the default output is `speech.mp3`.

### Options

- `--model <model>` - Select a speech model.
- `--voice <voice-id>` - Select a MiniMax voice.
- `--format <format>` - Select `mp3`, `wav`, `flac`, or `pcm`.
- `--output <file>` - Set the output path.
- `--region <region>` - Select `global` or `cn`.

Supported models are `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo`, `speech-01-hd`, and `speech-01-turbo`.

## Requirements

- Node.js 18 or later
- A MiniMax API key in `MINIMAX_API_KEY`

The API key is read only from the environment and is sent as a Bearer token.
