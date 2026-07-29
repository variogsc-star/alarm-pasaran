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

  const text = String(
    req.body && req.body.text
      ? req.body.text
      : ""
  ).trim();

  if (!text) {
    return res.status(400).json({
      ok: false,
      error: "Teks suara tidak ditemukan."
    });
  }

  if (text.length > 1500) {
    return res.status(400).json({
      ok: false,
      error: "Teks terlalu panjang."
    });
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "cedar",
          input: text,

          instructions: [
            "Bacakan teks menggunakan bahasa Indonesia.",
            "Gunakan pelafalan bahasa Indonesia yang netral dan alami.",
            "Bacakan persis teks yang diberikan.",
            "Jangan menerjemahkan.",
            "Jangan menambahkan kata apa pun.",
            "Gunakan kecepatan bicara sedang dan jelas."
          ].join(" "),

          response_format: "mp3"
        })
      }
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "TTS OpenAI gagal:",
        response.status,
        errorText
      );

      return res.status(response.status).json({
        ok: false,
        error: "Gagal membuat suara.",
        details: errorText
      });
    }

    const audioBuffer =
      await response.arrayBuffer();

    res.setHeader(
      "Content-Type",
      "audio/mpeg"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error(
      "TTS server error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Kesalahan server TTS.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}
