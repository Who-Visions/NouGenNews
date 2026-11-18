// Weather in the terminal: node scripts/wx.cjs "Miami:Denver" ["%l: %c %t %w"]   (formats 1-4 or % tokens, see electron/wxline.js)
const { weatherReport } = require("../electron/weather");
const { renderLine } = require("../electron/wxline");

(async () => {
  const places = String(process.argv[2] || "").split(":").map((p) => p.trim()).filter(Boolean);
  if (!places.length) { console.error('usage: wx "City[:City...]" [format]'); process.exit(2); }
  let failed = 0;
  const lines = await Promise.all(places.map(async (city) => {
    try { return renderLine(await weatherReport({ city, region: "" }), process.argv[3] || "4"); } catch (e) { failed += 1; return `${city}: ${e.message}`; }
  }));
  console.log(lines.join("\n"));
  process.exit(failed ? 1 : 0);
})();
