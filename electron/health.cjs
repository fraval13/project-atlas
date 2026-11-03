async function checkHealthResponse(response) {
  if (!response.ok) {
    await response.body?.cancel();
    return {
      status: response.status >= 500 ? "offline" : "unknown",
      healthStatus: response.status >= 500 ? "unhealthy" : "unknown",
      error: `Health endpoint returned HTTP ${response.status}${response.status < 500 ? " · verify endpoint URL and access" : ""}`,
    };
  }
  let text = "";
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return {
            status: "unknown",
            healthStatus: "unknown",
            error:
              "Health response exceeds 64 KB. Use a small health endpoint.",
          };
        }
        chunks.push(Buffer.from(value));
      }
      text = Buffer.concat(chunks).toString("utf8").trim();
    } finally {
      reader.releaseLock();
    }
  }
  let value = text;
  if (text.startsWith("{") || text.startsWith("[") || text.startsWith('"')) {
    try {
      const data = JSON.parse(text);
      value =
        typeof data === "string" ? data : (data?.status ?? data?.healthy ?? "");
    } catch {
      return {
        status: "unknown",
        healthStatus: "unknown",
        error: "Health endpoint returned malformed JSON.",
      };
    }
  }
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (!text || ["healthy", "up", "ok", "pass", "true"].includes(normalized))
    return { status: "online", healthStatus: "healthy", error: "" };
  if (
    [
      "unhealthy",
      "down",
      "outofservice",
      "fail",
      "failed",
      "false",
      "error",
    ].includes(normalized)
  )
    return {
      status: "offline",
      healthStatus: "unhealthy",
      error: "Backend reports unhealthy.",
    };
  if (["degraded", "warn", "warning"].includes(normalized))
    return {
      status: "unknown",
      healthStatus: "degraded",
      error: "Backend reports degraded health.",
    };
  return {
    status: "unknown",
    healthStatus: "unknown",
    error:
      "Unrecognized health response. Return Healthy/Unhealthy or JSON with a status field.",
  };
}
module.exports = { checkHealthResponse };
