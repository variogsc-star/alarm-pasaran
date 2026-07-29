export default async function handler(req, res) {
  const appsScriptUrl = String(
    process.env.APPS_SCRIPT_URL || ""
  ).trim();

  const appsScriptSecret = String(
    process.env.APPS_SCRIPT_SECRET || ""
  ).trim();

  if (!appsScriptUrl || !appsScriptSecret) {
    return res.status(500).json({
      ok: false,
      error:
        "APPS_SCRIPT_URL atau APPS_SCRIPT_SECRET belum diatur."
    });
  }

  if (!appsScriptUrl.startsWith("https://script.google.com/")) {
    return res.status(500).json({
      ok: false,
      error:
        "APPS_SCRIPT_URL tidak valid. Gunakan URL script.google.com yang berakhiran /exec."
    });
  }

  try {
    if (req.method === "GET") {
      return await handleGet(
        req,
        res,
        appsScriptUrl,
        appsScriptSecret
      );
    }

    if (req.method === "POST") {
      return await handlePost(
        req,
        res,
        appsScriptUrl,
        appsScriptSecret
      );
    }

    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      error: "Method tidak diizinkan."
    });

  } catch (error) {
    console.error("Reminder proxy error:", error);

    return res.status(500).json({
      ok: false,
      error: "Gagal menghubungi Apps Script.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}


async function handleGet(
  req,
  res,
  appsScriptUrl,
  appsScriptSecret
) {
  const action = String(
    req.query.action || "next"
  )
    .trim()
    .toLowerCase();

  const allowedActions = [
    "next",
    "summary",
    "health"
  ];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({
      ok: false,
      error: "Action GET tidak valid."
    });
  }

  const targetUrl = new URL(appsScriptUrl);

  targetUrl.searchParams.set(
    "action",
    action
  );

  targetUrl.searchParams.set(
    "secret",
    appsScriptSecret
  );

  targetUrl.searchParams.set(
    "_",
    String(Date.now())
  );

  const response = await fetchWithTimeout(
    targetUrl.toString(),
    {
      method: "GET",
      redirect: "follow",
      cache: "no-store",

      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; AlarmPasaran/1.0)"
      }
    }
  );

  return forwardJsonResponse(
    response,
    res
  );
}


async function handlePost(
  req,
  res,
  appsScriptUrl,
  appsScriptSecret
) {
  const body =
    req.body &&
    typeof req.body === "object"
      ? req.body
      : {};

  const payload = {
    ...body,
    secret: appsScriptSecret
  };

  const response = await fetchWithTimeout(
    appsScriptUrl,
    {
      method: "POST",
      redirect: "follow",
      cache: "no-store",

      headers: {
        Accept: "application/json,text/plain,*/*",
        "Content-Type":
          "application/json; charset=utf-8",
        "User-Agent":
          "Mozilla/5.0 (compatible; AlarmPasaran/1.0)"
      },

      body: JSON.stringify(payload)
    }
  );

  return forwardJsonResponse(
    response,
    res
  );
}


async function forwardJsonResponse(
  response,
  res
) {
  const text =
    await response.text();

  const trimmed =
    String(text || "").trim();

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  let parsed;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const isGoogleLogin =
      trimmed.includes(
        "accounts.google.com"
      ) ||
      trimmed.includes(
        "/signin/"
      ) ||
      trimmed.includes(
        "<!doctype html"
      ) ||
      trimmed.includes(
        "<html"
      );

    console.error(
      "Apps Script bukan JSON:",
      {
        status: response.status,
        finalUrl: response.url,
        contentType: contentType,
        preview:
          trimmed.substring(0, 300)
      }
    );

    return res.status(502).json({
      ok: false,

      error: isGoogleLogin
        ? "Apps Script mengembalikan halaman login Google."
        : "Apps Script tidak mengembalikan JSON.",

      googleStatus:
        response.status,

      finalUrl:
        response.url,

      contentType:
        contentType,

      preview:
        trimmed.substring(0, 200)
    });
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  return res
    .status(response.ok ? 200 : response.status)
    .json(parsed);
}


async function fetchWithTimeout(
  url,
  options
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      function() {
        controller.abort();
      },
      20000
    );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Apps Script tidak merespons dalam 20 detik."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}
