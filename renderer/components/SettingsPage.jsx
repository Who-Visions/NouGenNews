import { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";
import "./SettingsPage.css";

const STATUS = { saved: "Saved here", environment: "From this computer", none: "Not set", unreadable: "Can't be read, paste it again" };

// One key: the box is write-only, since a saved value never comes back from the main process.
function KeyRow({ row, onRows }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const run = async (cmd, args) => {
    setError("");
    try { onRows(await invoke(cmd, args)); setValue(""); }
    catch (e) { setError(String(e.message || e).replace(/^.*Error: /, "")); }
  };
  return (
    <form className="settings__row" onSubmit={(e) => { e.preventDefault(); if (value.trim()) run("keys_save", { name: row.env, value }); }}>
      <label htmlFor={row.env}>{row.label}</label>
      <span className={`settings__status is-${row.source}`}>{STATUS[row.source]}</span>
      <input id={row.env} type="password" autoComplete="off" spellCheck={false} value={value} placeholder={row.source === "none" ? "Paste key" : "Paste a new key to replace"} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" disabled={!value.trim()}>Save</button>
      <button type="button" disabled={row.source !== "saved" && row.source !== "unreadable"} onClick={() => run("keys_clear", { name: row.env })}>Remove</button>
      {error ? <p className="settings__error" role="alert">{error}</p> : null}
    </form>
  );
}

export function SettingsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { invoke("keys_list").then(setRows).catch((e) => setError(String(e.message || e))); }, []);
  const groups = [...new Set((rows || []).map((r) => r.group))];
  return (
    <div className="settings">
      <h1>Settings</h1>
      <h2>API keys</h2>
      <p className="settings__note">Keys are encrypted on this computer and can't be read back here. A new key applies the next time that source refreshes.</p>
      {error ? <p className="settings__error" role="alert">{error}</p> : null}
      {!rows && !error ? <p>Loading…</p> : null}
      {groups.map((g) => (
        <section key={g}>
          <h3>{g}</h3>
          {rows.filter((r) => r.group === g).map((r) => <KeyRow key={r.env} row={r} onRows={setRows} />)}
        </section>
      ))}
    </div>
  );
}
