import { test } from "node:test";
import assert from "node:assert/strict";
import { localQuery, localFeedUrl, stripPublisher, LOCAL_ID } from "../local.js";
import { FEEDS } from "../feeds.js";

test("localQuery adds the region unless the place already carries it", () => {
  assert.equal(localQuery("Springfield", "Illinois"), "Springfield, Illinois");
  assert.equal(localQuery("New York", "New York"), "New York");
  assert.equal(localQuery("Austin", ""), "Austin");
  assert.equal(localQuery("", "Texas"), "");
});

test("localFeedUrl encodes the place into Google News' location feed", () => {
  const u = new URL(localFeedUrl("Springfield, Illinois"));
  assert.equal(u.hostname, "news.google.com");
  assert.equal(decodeURIComponent(u.pathname.split("/").pop()), "Springfield, Illinois");
  assert.equal(u.searchParams.get("ceid"), "US:en");
});

test("stripPublisher drops only a trailing publisher name", () => {
  assert.equal(stripPublisher("Bridge reopens after repairs - Daily News", "Daily News"), "Bridge reopens after repairs");
  assert.equal(stripPublisher("Daily News launches app", "Daily News"), "Daily News launches app");
  assert.equal(stripPublisher("Plain headline", ""), "Plain headline");
});

test("the registry has a Near you entry that is resolved at run time and sits after the keyed feeds", () => {
  const i = FEEDS.findIndex((f) => f.id === LOCAL_ID);
  assert.ok(i >= 9, "keys 1-9 must keep their feeds");
  assert.equal(FEEDS[i].url, "@local");
  assert.equal(FEEDS[i].section, "Near you");
});
