const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { publishSnapshot, readSnapshot, mergeSavedStories } = require("../muse-bridge");

test("muse-bridge publishes and reads live stories, briefs, and saved stories", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nn-muse-bridge-"));
  const stateFile = path.join(dir, "news_sync.json");

  const empty = readSnapshot({ stateFile });
  assert.deepEqual(empty.stories, []);
  assert.deepEqual(empty.briefs, []);
  assert.deepEqual(empty.savedStories, []);

  const res = await publishSnapshot(
    {
      stories: [
        { id: "s1", title: "Headline One", link: "https://example.com/1", source: "Wire", timestamp: 1000 },
        { id: "s1", title: "Duplicate Headline One", link: "https://example.com/1", source: "Wire", timestamp: 1000 },
        { id: "s2", title: "Headline Two", link: "https://example.com/2", source: "Wire", timestamp: 2000 },
      ],
      briefs: [{ id: "b1", title: "Morning Brief", body: "Key developments across the fleet." }],
      savedStories: [{ id: "s1", title: "Headline One", link: "https://example.com/1", source: "Wire" }],
    },
    { stateFile },
  );

  assert.equal(res.ok, true);
  assert.deepEqual(res.counts, { stories: 2, briefs: 1, savedStories: 1 });

  const snap = readSnapshot({ stateFile });
  assert.equal(snap.stories.length, 2);
  assert.equal(snap.briefs.length, 1);
  assert.equal(snap.savedStories.length, 1);
  assert.equal(snap.briefs[0].title, "Morning Brief");

  const merged = await mergeSavedStories(
    {
      savedStories: [
        { id: "s2", title: "Headline Two", link: "https://example.com/2", source: "Wire" },
        { id: "s1", title: "Headline One", link: "https://example.com/1", source: "Wire" },
      ],
    },
    { stateFile },
  );
  assert.equal(merged.counts.savedStories, 2);
  assert.equal(readSnapshot({ stateFile }).savedStories.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("muse-bridge notifies live app_bridge HTTP endpoint when configured", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nn-muse-http-"));
  const stateFile = path.join(dir, "news_sync.json");
  const received = [];

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const res = await publishSnapshot(
      {
        stories: [{ id: "live-1", title: "Bridge Live Story", link: "https://example.com/live" }],
        briefs: [{ id: "brief-1", title: "Live Brief", body: "Synced to Muse app_bridge." }],
      },
      { stateFile, bridgeUrl: `http://127.0.0.1:${port}/sync` },
    );
    assert.equal(res.bridge.notified, true);
    assert.equal(res.bridge.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].event, "nougennews_sync");
    assert.equal(received[0].payload.stories[0].id, "live-1");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
