// Live camera frames from a NouGen//Eye server on this machine. The app ships no camera catalog: without that server
// there are simply no frames, and the alert keeps its portal button.
const TIMEOUT_MS = 6000;
const eyeUrl = () => process.env.NOUGENEYE_MCP_URL || "http://127.0.0.1:5191/mcp";

async function callTool(name, args, http = fetch) {
  const res = await http(eyeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NouGen//Eye returned ${res.status}`);
  const result = (await res.json()).result;
  if (!result || result.isError) throw new Error(`NouGen//Eye refused ${name}`);
  return result.content || [];
}

// The nearest cameras that have a frame right now, or [] on any failure. Never throws.
async function nearestFrames(lat, lon, { limit = 4, http = fetch } = {}) {
  try {
    const cameras = JSON.parse((await callTool("nearest_cameras", { lat, lon, limit: limit * 2 }, http))[0]?.text || "[]");
    const frames = await Promise.all(cameras.map(async (c) => {
      try {
        const image = (await callTool("get_camera_frame", { id: c.id }, http)).find((p) => p.type === "image");
        return image ? { id: c.id, name: c.name, distanceKm: c.distanceKm, src: `data:${image.mimeType};base64,${image.data}` } : null;
      } catch { return null; }
    }));
    return frames.filter(Boolean).slice(0, limit);
  } catch { return []; }
}

module.exports = { nearestFrames };
