const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_MODEL,
  ENDPOINTS,
  FORMATS,
  MODELS,
  buildRequest,
  decodeAudio,
  generateSpeech,
  parseArgs,
} = require("./tts.js");

test("uses the current default model and regional endpoints", () => {
  assert.equal(DEFAULT_MODEL, "speech-2.8-hd");
  assert.deepEqual(MODELS, [
    "speech-2.8-hd",
    "speech-2.8-turbo",
    "speech-2.6-hd",
    "speech-2.6-turbo",
    "speech-02-hd",
    "speech-02-turbo",
    "speech-01-hd",
    "speech-01-turbo",
  ]);
  assert.deepEqual(FORMATS, ["mp3", "wav", "flac", "pcm"]);
  assert.equal(ENDPOINTS.global, "https://api.minimax.io/v1/t2a_v2");
  assert.equal(ENDPOINTS.cn, "https://api.minimaxi.com/v1/t2a_v2");
});

test("parses text and synthesis options", () => {
  assert.deepEqual(
    parseArgs([
      "Hello",
      "--model",
      "speech-2.8-turbo",
      "--voice",
      "English_expressive_narrator",
      "--format",
      "wav",
      "--region",
      "cn",
    ]),
    {
      text: "Hello",
      model: "speech-2.8-turbo",
      voice: "English_expressive_narrator",
      format: "wav",
      output: "speech.wav",
      region: "cn",
    }
  );
});

test("builds a non-streaming hexadecimal audio request", () => {
  const options = parseArgs(["Hello", "--voice", "English_expressive_narrator"]);
  assert.deepEqual(buildRequest(options), {
    model: "speech-2.8-hd",
    text: "Hello",
    stream: false,
    output_format: "hex",
    audio_setting: { format: "mp3" },
    voice_setting: { voice_id: "English_expressive_narrator" },
  });
});

test("decodes hexadecimal audio and rejects invalid data", () => {
  assert.deepEqual(decodeAudio("4869"), Buffer.from("Hi"));
  assert.throws(() => decodeAudio("not-hex"), /valid hexadecimal audio/);
});

test("sends a Bearer-authenticated request and writes decoded audio", async () => {
  const options = parseArgs(["Hello", "--output", "hello.mp3"]);
  let request;
  let written;

  const result = await generateSpeech(options, {
    apiKey: "YOUR-MINIMAX-API-KEY",
    fetchImplementation: async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { audio: "4869", status: 2 },
          base_resp: { status_code: 0, status_msg: "success" },
        }),
      };
    },
    writeFile: (output, audio) => {
      written = { output, audio };
    },
  });

  assert.equal(request.url, ENDPOINTS.global);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer YOUR-MINIMAX-API-KEY");
  assert.deepEqual(JSON.parse(request.init.body), buildRequest(options));
  assert.equal(written.output, "hello.mp3");
  assert.deepEqual(written.audio, Buffer.from("Hi"));
  assert.deepEqual(result, { output: "hello.mp3", bytes: 2 });
});

test("reports API errors without writing a file", async () => {
  const options = parseArgs(["Hello"]);
  await assert.rejects(
    generateSpeech(options, {
      apiKey: "YOUR-MINIMAX-API-KEY",
      fetchImplementation: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          base_resp: { status_code: 1004, status_msg: "invalid request" },
        }),
      }),
      writeFile: () => assert.fail("writeFile should not be called"),
    }),
    /MiniMax request failed: invalid request/
  );
});
