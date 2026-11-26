// Permission requests from web content (Electron security checklist item 5, docs/tutorial/security.md).
// Electron GRANTS every permission by default. The reader sidebar loads arbitrary sites in <webview>s, so without this
// any article could silently get the camera, microphone, location, notifications, MIDI or USB/HID/serial devices.
// Embedded players and sidebar articles may need fullscreen (video) or copying text/links (clipboard-sanitized-write).
// Everything else is denied without a prompt.
const ALLOWED = new Set(["fullscreen", "clipboard-sanitized-write"]);

function allowed(permission) {
  return ALLOWED.has(String(permission));
}

const allowPermission = allowed;

// Applies the policy to one session: requests, synchronous checks, and device pickers.
function lockSession(ses, log = () => {}) {
  if (!ses || ses.__nougenPermissionsLocked) return false;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const ok = allowed(permission);
    if (!ok) log(`denied ${permission} for ${(details && (details.requestingUrl || details.securityOrigin)) || (wc && wc.getURL && wc.getURL()) || "?"}`);
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission) => allowed(permission));
  if (typeof ses.setDevicePermissionHandler === "function") ses.setDevicePermissionHandler(() => false);
  ses.__nougenPermissionsLocked = true;
  return true;
}

const applyPermissionPolicy = lockSession;

// Locks the default session and every session created later (webview partitions included).
function lockAllSessions({ app, session, log }) {
  lockSession(session.defaultSession, log);
  app.on("session-created", (ses) => lockSession(ses, log));
}

module.exports = { ALLOWED, allowed, allowPermission, lockSession, applyPermissionPolicy, lockAllSessions };
