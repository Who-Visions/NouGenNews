// "Use my location": the position comes from Windows' own location service (Wi-Fi and device sensors, accurate to
// tens or hundreds of metres, unlike an IP address, which is only reliable to the state), then the coordinates are
// turned into a place name. Nothing runs unless the person asks for it: the coordinates go to the name lookup only
// on that click. A fixed PowerShell script reads the position; nothing from the page is put into it.
const { execFile } = require("node:child_process");
const { fetchSafe } = require("./safe");

const POSITION = [
  "Add-Type -AssemblyName System.Device",
  "$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::Default)",
  "$null = $w.TryStart($false, [TimeSpan]::FromSeconds(8))",
  "$t = 0",
  "while ($w.Status -ne 'Ready' -and $t -lt 10) { Start-Sleep -Milliseconds 500; $t += 0.5 }",
  "$p = $w.Position.Location",
  "if ($p -and -not $p.IsUnknown) { 'lat={0} lon={1} acc={2}' -f $p.Latitude, $p.Longitude, $p.HorizontalAccuracy } else { 'unknown' }",
  "$w.Stop()",
].join("; ");

// "lat=26.746 lon=-80.094 acc=81" -> { lat, lon, accuracy } or null.
function parsePosition(out) {
  const m = /lat=(-?[\d.]+)\s+lon=(-?[\d.]+)\s+acc=([\d.]+|NaN)/.exec(String(out || ""));
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, accuracy: Number.isFinite(Number(m[3])) ? Number(m[3]) : null };
}

// The place name for coordinates: the locality (West Palm Beach) for weather and display, and the metro area the
// lookup calls "city" (Miami) for news, which casts a wider net. metro is empty when it adds nothing.
function parsePlace(json) {
  const locality = String((json && json.locality) || "").trim();
  const metroCity = String((json && json.city) || "").trim();
  const name = locality || metroCity;
  const region = String((json && json.principalSubdivision) || "").trim();
  if (!name) return null;
  return { city: name, metro: metroCity && metroCity.toLowerCase() !== name.toLowerCase() ? metroCity : "", region };
}

function readPosition(platform = process.platform, run = execFile) {
  if (platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", POSITION], { timeout: 20000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : parsePosition(stdout));
    });
  });
}

// { ok: true, city, region, lat, lon, accuracy } or { ok: false, reason }. Never throws.
async function locateMe({ platform = process.platform, run = execFile, http = fetchSafe } = {}) {
  if (platform !== "win32") return { ok: false, reason: "Location is only read from Windows. Type your city instead." };
  const pos = await readPosition(platform, run);
  if (!pos) return { ok: false, reason: "Windows could not give a position. Turn on Location in Windows Settings, or type your city." };
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lon}&localityLanguage=en`;
    const res = await http(url, { headers: { Accept: "application/json" } }, { retries: false, timeoutMs: 10000 });
    const place = res.ok ? parsePlace(await res.json()) : null;
    if (!place) return { ok: false, reason: "Found your position but not a place name for it. Type your city instead." };
    return { ok: true, ...place, lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy };
  } catch {
    return { ok: false, reason: "Found your position but could not look up its name. Type your city instead." };
  }
}

module.exports = { locateMe, parsePosition, parsePlace, POSITION };
