// Cast the app to a TV. On Windows the cast flyout (Win+K) lists every Miracast display on the network and
// mirrors the whole screen to the one picked, which carries this window, its videos and its sound. The key
// chord is sent with keybd_event (SendKeys cannot press the Windows key). Other systems report that they
// have no built-in cast panel instead of failing silently.
const { execFile } = require("node:child_process");

const VK_LWIN = 0x5b;
const VK_K = 0x4b;

// PowerShell that presses Win+K. Kept as a constant: nothing from the renderer is ever put into it.
const WIN_K = [
  "$sig = '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'",
  "Add-Type -MemberDefinition $sig -Name Keys -Namespace NN",
  `[NN.Keys]::keybd_event(${VK_LWIN}, 0, 0, [UIntPtr]::Zero)`,
  `[NN.Keys]::keybd_event(${VK_K}, 0, 0, [UIntPtr]::Zero)`,
  `[NN.Keys]::keybd_event(${VK_K}, 0, 2, [UIntPtr]::Zero)`,
  `[NN.Keys]::keybd_event(${VK_LWIN}, 0, 2, [UIntPtr]::Zero)`,
].join("; ");

function castScreen(platform = process.platform, run = execFile) {
  if (platform !== "win32") {
    return Promise.resolve({ ok: false, reason: "This system has no built-in cast panel. Use its screen-mirroring or AirPlay menu." });
  }
  return new Promise((resolve) => {
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WIN_K], { timeout: 15000, windowsHide: true }, (err) => {
      resolve(err ? { ok: false, reason: "Could not open the cast panel: " + (err.message || err) } : { ok: true });
    });
  });
}

module.exports = { castScreen, WIN_K };
