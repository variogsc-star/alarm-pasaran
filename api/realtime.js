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
      error: "OPENAI_API_KEY belum diatur di Vercel."
    });
  }

  try {
    const rawSdp = readSdpBody(req);
    const sdp = normalizeSdp(rawSdp);

    if (!sdp || !sdp.startsWith("v=0\r\n")) {
      return res.status(400).json({
        ok: false,
        error: "SDP offer tidak valid atau tidak ditemukan.",
        contentType: req.headers["content-type"] || "",
        receivedType: typeof req.body,
        preview: String(rawSdp || "").substring(0, 120)
      });
    }

    /*
     * Realtime hanya mendengar dan membuat transkripsi.
     * Ia tidak diberi izin membuat respons suara sendiri.
     */
    const session = {
      type: "realtime",
      model: "gpt-realtime",

      output_modalities: [
        "audio"
      ],

      instructions: [
        "Kamu adalah sistem transkripsi untuk alarm jadwal.",
        "Ucapan pengguna menggunakan bahasa Indonesia.",
        "Jangan membuat jawaban suara secara otomatis.",
        "Fokus mengenali jawaban singkat mengenai status jadwal."
      ].join(" "),

      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "id",

            prompt: [
              "Transkripsikan seluruh ucapan sebagai bahasa Indonesia.",
              "Kosakata yang sering digunakan:",
              "sudah, udah, belum, gangguan, diundur, libur,",
              "buka, tutup, selesai, batal, jadwal, dan alarm."
            ].join(" ")
          },

          noise_reduction: {
            type: "near_field"
          },

          turn_detection: {
            type: "server_vad",

            /*
             * Realtime tidak menjawab sendiri.
             */
            create_response: false,
            interrupt_response: false,

            prefix_padding_ms: 300,
            silence_duration_ms: 700
          }
        },

        /*
         * Field output tetap disediakan agar sesi audio valid.
         * Suara alarm sebenarnya sebaiknya melalui /api/tts.
         */
        output: {
          voice: "cedar"
        }
      },

      max_output_tokens: 100
    };

    const formData = new FormData();

    /*
     * PENTING:
     * Kirim SDP sebagai field teks, bukan Blob/file.
     */
    formData.append(
      "sdp",
      sdp
    );

    /*
     * Session dikirim sebagai bagian application/json.
     */
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

        /*
         * Jangan menulis Content-Type multipart secara manual.
         * FormData akan membuat boundary secara otomatis.
         */
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
      console.error(
        "SDP answer tidak valid:",
        responseBody.substring(0, 300)
      );

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
      "no-store, no-cache, must-revalidate"
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


/*
 * Membaca SDP yang dikirim index.html.
 * Mendukung string, Buffer, atau object { sdp }.
 */
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


/*
 * OpenAI membutuhkan format baris CRLF untuk SDP.
 */
function normalizeSdp(value) {
  const normalized =
    String(value || "")
      .replace(/\r?\n/g, "\r\n")
      .replace(/(\r\n)+$/, "");

  if (!normalized) {
    return "";
  }

  return normalized + "\r\n";
}
