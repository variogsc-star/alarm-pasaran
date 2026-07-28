export default async function handler(req, res) {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const appsScriptSecret = process.env.APPS_SCRIPT_SECRET;

  if (!appsScriptUrl || !appsScriptSecret) {
    return res.status(500).json({
      error:
        "APPS_SCRIPT_URL atau APPS_SCRIPT_SECRET belum diatur."
    });
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "next");

      const url = new URL(appsScriptUrl);
      url.searchParams.set("action", action);
      url.searchParams.set("secret", appsScriptSecret);

      const response = await fetch(url, {
        redirect: "follow",
        cache: "no-store"
      });

      const text = await response.text();

      return res
        .status(response.ok ? 200 : response.status)
        .setHeader("Content-Type", "application/json")
        .send(text);
    }

    if (req.method === "POST") {
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...req.body,
          secret: appsScriptSecret
        })
      });

      const text = await response.text();

      return res
        .status(response.ok ? 200 : response.status)
        .setHeader("Content-Type", "application/json")
        .send(text);
    }

    return res.status(405).json({
      error: "Method tidak diizinkan."
    });

  } catch (error) {
    return res.status(500).json({
      error: "Gagal menghubungi Apps Script.",
      details: error.message
    });
  }
}