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
    let sdp = "";

    if (typeof req.body === "string") {
      sdp = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      sdp = req.body.toString("utf8");
    } else if (
      req.body &&
      typeof req.body.sdp === "string"
    ) {
      sdp = req.body.sdp;
    }

    sdp = sdp.trim();

    if (!sdp || !sdp.startsWith("v=0")) {
      return res.status(400).json({
        error: "SDP offer tidak valid atau tidak ditemukan.",
        receivedType: typeof req.body,
        contentType: req.headers["content-type"] || ""
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
      new Blob(
        [JSON.stringify(session)],
        {
          type: "application/json"
        }
      ),
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

    const responseBody =
      await openAIResponse.text();

    if (!openAIResponse.ok) {
      console.error(
        "OpenAI Realtime error:",
        responseBody
      );

      return res
        .status(openAIResponse.status)
        .json({
          error: "OpenAI Realtime gagal.",
          details: responseBody
        });
    }

    return res
      .status(201)
      .setHeader(
        "Content-Type",
        "application/sdp"
      )
      .send(responseBody);

  } catch (error) {
    console.error(
      "Realtime server error:",
      error
    );

    return res.status(500).json({
      error: "Kesalahan server.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}
