export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      ok: false,
      error: "Method tidak diizinkan."
    });
  }

  const apiKey = String(
    process.env.OPENAI_API_KEY || ""
  ).trim();

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY belum diatur."
    });
  }

  try {
    const sdp = readSdpBody(req);

    if (!sdp || !sdp.startsWith("v=0")) {
      return res.status(400).json({
        ok: false,
        error: "SDP offer tidak valid atau tidak ditemukan.",
        contentType: req.headers["content-type"] || "",
        receivedType: typeof req.body
      });
    }

    const session = {
      type: "realtime",
      model: "gpt-realtime",

      output_modalities: [
        "audio"
      ],

      instructions: [
        "Kamu adalah asisten alarm suara.",
        "Kamu wajib selalu berbicara menggunakan bahasa Indonesia.",
        "Jangan pernah menjawab menggunakan bahasa Inggris.",
        "Gunakan pengucapan bahasa Indonesia yang jelas dan alami.",
        "Gunakan gaya bicara singkat, tegas, dan mudah dipahami.",
        "Jangan menerjemahkan nama jadwal atau nama yang diberikan pengguna.",
        "Ketika diminta membacakan sebuah kalimat, ucapkan kalimat itu persis tanpa tambahan.",
        "Jangan menambahkan pembukaan, penjelasan, salam, atau penutup.",
        "Jawaban pengguna biasanya berhubungan dengan sudah, gangguan, diundur, atau libur."
      ].join(" "),

      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "id",

            prompt: [
              "Seluruh ucapan menggunakan bahasa Indonesia.",
              "Kata yang sering digunakan adalah sudah, udah, gangguan, diundur, libur, jadwal, alarm, buka, dan belum."
            ].join(" ")
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

    const formData = new FormData();

    /*
     * SDP dikirim sebagai field teks.
     * Jangan memakai Blob untuk SDP.
     */
    formData.append(
      "sdp",
      normalizeSdp(sdp)
    );

    formData.append(
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
      "https://api.openai.com/v1/realtime/calls?model=gpt-realtime",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`
        },

        body: formData
      }
    );

    const responseBody =
      await openAIResponse.text();

    if (!openAIResponse.ok) {
      console.error(
        "OpenAI Realtime gagal:",
        openAIResponse.status,
        responseBody
      );

      return res
        .status(openAIResponse.status)
        .json({
          ok: false,
          error: "OpenAI Realtime gagal.",
          status: openAIResponse.status,
          details: responseBody
        });
    }

    if (
      !responseBody ||
      !responseBody.trim().startsWith("v=0")
    ) {
      return res.status(502).json({
        ok: false,
        error:
          "OpenAI tidak mengembalikan SDP answer yang valid.",
        preview:
          responseBody.substring(0, 300)
      });
    }

    res.setHeader(
      "Content-Type",
      "application/sdp"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(201)
      .send(responseBody);

  } catch (error) {
    console.error(
      "Realtime server error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Kesalahan server Realtime.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}


function readSdpBody(req) {
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

  return String(sdp || "");
}


function normalizeSdp(value) {
  const normalized = String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .replace(/(\r\n)+$/, "");

  return normalized + "\r\n";
}
