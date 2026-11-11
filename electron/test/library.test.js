const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { libraryTitles, titlesFromJson } = require("../library");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nn-lib-"));
const fakeApp = (appData, userData) => ({ getPath: (n) => (n === "appData" ? appData : userData) });

test("titlesFromJson takes strings or objects with a title", () => {
  const dir = tmp();
  const f = path.join(dir, "t.json");
  fs.writeFileSync(f, JSON.stringify(["Dune", { title: "Frieren" }, {}]));
  assert.deepEqual(titlesFromJson(f), ["Dune", "Frieren"]);
});

test("libraryTitles reads the NouGenFlix titles table and prefers display_title", async () => {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE titles (key TEXT PRIMARY KEY, title TEXT NOT NULL, display_title TEXT, kind TEXT)");
  db.run("INSERT INTO titles VALUES ('a','dune.2021.1080p','Dune','movie'),('b','junk','', 'unknown'),('c','The Bear','','tv')");
  const appData = tmp();
  fs.mkdirSync(path.join(appData, "NouGenFlix"));
  fs.writeFileSync(path.join(appData, "NouGenFlix", "nougenflix.db"), Buffer.from(db.export()));
  const out = await libraryTitles(fakeApp(appData, tmp()));
  assert.deepEqual(out.titles.sort(), ["Dune", "The Bear"]);
  assert.match(out.source, /nougenflix\.db$/);
});

test("libraryTitles falls back to library-titles.json, then to nothing", async () => {
  const userData = tmp();
  assert.deepEqual((await libraryTitles(fakeApp(tmp(), userData))).titles, []);
  fs.writeFileSync(path.join(userData, "library-titles.json"), JSON.stringify(["Frieren"]));
  assert.deepEqual((await libraryTitles(fakeApp(tmp(), userData))).titles, ["Frieren"]);
});
