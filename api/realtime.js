export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method tidak diizinkan."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY belum diatur."
    });
  }

  try {
    const sdp =
      typeof req.body === "string"
        ? req.body
        : req.body?.sdp;

    if (!sdp) {
      return res.status(400).json({
        error: "SDP tidak ditemukan."
      });
    }

    const session = {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      instructions: [
        "Kamu adalah asisten pengingat suara berbahasa Indonesia.",
        "Jawab singkat, jelas, dan alami.",
        "Saat diminta mengucapkan kalimat alarm, ucapkan persis kalimat tersebut tanpa tambahan."
      ].join(" "),
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "id"
          },
          noise_reduction: {
            type: "near_field"
          },
          turn_detection: {
            type: "server_vad",
            create_response: false,
            interrupt_response: true,
            silence_duration_ms: 700,
            prefix_padding_ms: 300
          }
        },
        output: {
          voice: "marin",
          speed: 1
        }
      },
      max_output_tokens: 250
    };

    const form = new FormData();

    form.append(
      "sdp",
      new Blob([sdp], {
        type: "application/sdp"
      }),
      "offer.sdp"
    );

    form.append(
      "session",
      new Blob([JSON.stringify(session)], {
        type: "application/json"
      }),
      "session.json"
    );

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form
      }
    );

    const body = await openAIResponse.text();

    if (!openAIResponse.ok) {
      return res.status(openAIResponse.status).json({
        error: "OpenAI Realtime gagal.",
        details: body
      });
    }

    res
      .status(201)
      .setHeader("Content-Type", "application/sdp")
      .send(body);

  } catch (error) {
    res.status(500).json({
      error: "Kesalahan server.",
      details: error.message
    });
  }
}