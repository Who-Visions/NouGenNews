const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArchive, storyToRecord } = require("../archive");
const { makeTools } = require("../assistant");

const NOW = Date.now();
const story = (n, over = {}) => ({ id: `s${n}`, feedId: "tvline", title: `Story number ${n} about zebra migration`, link: `https://x.test/${n}`, source: "TVLine", badge: "TV", lang: "en", categories: ["TV", "Film"], desc: `Summary ${n} of the zebra story`, timestamp: NOW - n * 3600000, ...over });
const mem = () => createArchive({ file: ":memory:" });

test("a wire story becomes a shard-shaped record keyed by its address", () => {
  const r = storyToRecord(story(1));
  assert.equal(r.key, "https://x.test/1");
  assert.equal(r.event_type, "NEWS_STORY");
  assert.equal(r.domain_key, "nougennews/tvline");
  assert.equal(r.source_uri, "https://x.test/1");
  assert.deepEqual(r.tags, ["TVLine", "TV", "en", "TV", "Film"]);
  assert.equal(r.event_time, NOW - 3600000);
  assert.match(r.content, /Summary 1/);
});

test("a story with no usable address or title is skipped, and an empty summary falls back to source and title", () => {
  assert.equal(storyToRecord(story(1, { link: "javascript:alert(1)" })), null);
  assert.equal(storyToRecord(story(1, { link: "" })), null);
  assert.equal(storyToRecord(story(1, { title: "  " })), null);
  assert.equal(storyToRecord(null), null);
  assert.equal(storyToRecord(story(2, { desc: "", text: "" })).content, "TVLine: Story number 2 about zebra migration");
  assert.equal(storyToRecord(story(3, { feedId: "../../etc" })).domain_key, "nougennews/etc");
});

test("ingesting the same wire twice stores each story once, and a story opened later gains its full text in place", () => {
  const a = mem();
  const wire = [1, 2, 3].map((n) => story(n));
  assert.deepEqual([a.ingest(wire).captured, a.ingest(wire).unchanged], [3, 3]);
  assert.equal(a.stats().count, 3);
  const full = a.ingest([story(2, { text: "The complete article text with a unique marker: quokka." })]);
  assert.equal(full.updated, 1);
  assert.equal(a.stats().count, 3);
  assert.equal(a.search({ query: "quokka" })[0].title, "Story number 2 about zebra migration");
});

test("ingest tolerates junk input and reports what it received", () => {
  const a = mem();
  assert.equal(a.ingest(undefined).received, 0);
  assert.equal(a.ingest("nope").received, 0);
  assert.equal(a.ingest([null, { title: "x" }, story(9)]).received, 1);
});

test("search finds a story that has left the wire, and `days` limits it to recent ones", () => {
  const a = mem();
  a.ingest([story(1, { timestamp: NOW - 3600000 }), story(2, { timestamp: NOW - 20 * 86400000, title: "Old zebra census report", link: "https://x.test/old" })]);
  assert.equal(a.search({ query: "zebra" }).length, 2);
  const recent = a.search({ query: "zebra", days: 7 });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].source_uri, "https://x.test/1");
});

test("the archive survives a restart and exports a bundle in the app's own documents folder layout", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nn-arch-"));
  const file = path.join(dir, "shards-light.db");
  const a = createArchive({ file });
  a.ingest([story(1), story(2)]);
  a.close();
  const b = createArchive({ file });
  assert.equal(b.stats().count, 2);
  const out = b.exportTo(path.join(dir, "export"));
  assert.equal(out.count, 2);
  const lines = fs.readFileSync(out.file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].event_type, "NEWS_STORY");
  assert.equal(lines[0].source_uri, "https://x.test/1");
  b.close();
});

test("upgradeInfo names this product and the shared product page", () => {
  const u = mem().upgradeInfo();
  assert.equal(u.product, "NouGenNews");
  assert.equal(u.name, "NouGen Shards");
  assert.match(u.url, /^https:\/\//);
});

test("the assistant's search_archive tool lists stories with outlet, time and address, and says so when there are none", async () => {
  const a = mem();
  a.ingest([story(1), story(2, { link: "https://x.test/older", timestamp: NOW - 5 * 86400000 })]);
  const tools = makeTools({ wire: [], readArticle: async () => ({}), archive: (q, d) => a.search({ query: q, limit: 6, days: d }) });
  const out = await tools.search_archive({ query: "zebra", days: 0 });
  assert.match(out, /^\[archive \d+\] Story number 1 about zebra migration — tvline, \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC: .*\(https:\/\/x\.test\/1\)/);
  assert.equal(out.split("\n").length, 2);
  assert.equal(await tools.search_archive({ query: "qqqqzzzz" }), "Nothing in the archive about that.");
  const broken = makeTools({ wire: [], readArticle: async () => ({}), archive: () => { throw new Error("locked"); } });
  assert.equal(await broken.search_archive({ query: "x" }), "Nothing in the archive about that.");
});
