// The reader's library titles, for the news boost. Read-only: the NouGenFlix database (nougenflix.db, SQLite)
// is opened from a copy in memory, never written. A plain library-titles.json in this app's data folder
// (an array of strings, or objects with a `title`) works for machines without NouGenFlix.
const fs = require("node:fs");
const path = require("node:path");

function candidates(app) {
  const appData = app.getPath("appData");
  const list = [
    process.env.NOUGENNEWS_LIBRARY_DB,
    path.join(appData, "NouGenFlix", "nougenflix.db"),
    path.join(appData, "com.super.drivenetflix", "nougenflix.db"),
  ].filter(Boolean);
  // Newest file wins: a stale copy from an older install should not shadow the live one.
  return list
    .map((p) => { try { return { p, m: fs.statSync(p).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.m - a.m)
    .map((x) => x.p);
}

async function titlesFromDb(file) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(file));
  try {
    const res = db.exec("SELECT COALESCE(NULLIF(display_title, ''), title) FROM titles WHERE kind IS NULL OR kind <> 'unknown'");
    return (res[0]?.values || []).map((r) => String(r[0] || "")).filter(Boolean);
  } finally {
    db.close();
  }
}

function titlesFromJson(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return (Array.isArray(data) ? data : data.titles || []).map((t) => (typeof t === "string" ? t : t && t.title)).filter(Boolean);
}

// { titles: string[], source: string | null }. Never throws: a missing or broken library means no boost.
async function libraryTitles(app) {
  for (const file of candidates(app)) {
    try {
      const titles = await titlesFromDb(file);
      if (titles.length) return { titles, source: file };
    } catch { /* try the next source */ }
  }
  const json = path.join(app.getPath("userData"), "library-titles.json");
  try {
    const titles = titlesFromJson(json);
    if (titles.length) return { titles, source: json };
  } catch { /* no file */ }
  return { titles: [], source: null };
}

module.exports = { libraryTitles, titlesFromJson };
