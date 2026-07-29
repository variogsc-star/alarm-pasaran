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
    const rawSdp = readSdpBody(req);
    const sdp = normalizeSdp(rawSdp);

    if (!sdp.startsWith("v=0\r\n")) {
      return res.status(400).json({
        ok: false,
        error: "SDP offer tidak valid.",
        contentType:
          req.headers["content-type"] || "",
        preview:
          sdp.substring(0, 120)
      });
    }

    /*
     * Realtime hanya dipakai untuk mendengar
     * dan mentranskripsikan suara pengguna.
     *
     * create_response dibuat false agar model
     * tidak menjawab dengan suara Inggris,
     * Rusia, atau bahasa lainnya.
     */
    const session = {
      type: "realtime",
      model: "gpt-realtime",

      output_modalities: [
        "audio"
      ],

      instructions: [
        "Kamu adalah sistem transkripsi alarm.",
        "Jangan membuat jawaban suara otomatis.",
        "Ucapan pengguna menggunakan bahasa Indonesia.",
        "Fokus mengenali jawaban singkat mengenai status jadwal."
      ].join(" "),

      audio: {
        input: {
          transcription: {
            model:
              "gpt-4o-mini-transcribe",

            language: "id",

            prompt: [
              "Transkripsikan ucapan sebagai bahasa Indonesia.",
              "Kosakata yang sering muncul:",
              "sudah, udah, belum, gangguan,",
              "diundur, libur, buka, tutup,",
              "jadwal, alarm, selesai, dan batal."
            ].join(" ")
          },

          noise_reduction: {
            type: "near_field"
          },

          turn_detection: {
            type: "server_vad",

            /*
             * Sangat penting.
             * Jangan izinkan Realtime menjawab.
             */
            create_response: false,

            /*
             * Karena tidak ada respons AI Realtime,
             * tidak perlu menginterupsi respons.
             */
            interrupt_response: false,

            prefix_padding_ms: 300,
            silence_duration_ms: 700
          }
        },

        output: {
          /*
           * Tidak digunakan untuk alarm.
           * Suara alarm datang dari /api/tts.
           */
          voice: "cedar"
        }
      },

      max_output_tokens: 100
    };

    const formData = new FormData();

    formData.append(
      "sdp",
      new Blob(
        [sdp],
        {
          type: "application/sdp"
        }
      ),
      "offer.sdp"
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

    const openAIResponse =
      await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`
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
          error:
            "OpenAI Realtime gagal.",
          status:
            openAIResponse.status,
          details:
            responseBody
        });
    }

    if (
      !responseBody ||
      !responseBody
        .trim()
        .startsWith("v=0")
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
      error:
        "Kesalahan server Realtime.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}


function readSdpBody(req) {
  if (typeof req.body === "string") {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (
    req.body &&
    typeof req.body.sdp === "string"
  ) {
    return req.body.sdp;
  }

  return "";
}


function normalizeSdp(value) {
  const normalized =
    String(value || "")
      .replace(/\r?\n/g, "\r\n")
      .replace(/(\r\n)+$/, "");

  return normalized + "\r\n";
}
