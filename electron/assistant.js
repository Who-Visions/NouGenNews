// The in-app assistant: answers from the wire and the open story through Ollama's native /api/chat with tools.
// Model order: gemma4:31b on Ollama Cloud (one key per NouGen account, rotated when one is rate-limited or refused),
// then the resident local model. Keys come from the keymaker and stay in this process.
const { fetchSafe } = require("./safe");

const CLOUD = "https://ollama.com";
const LOCAL = "http://localhost:11434";
const CLOUD_MODEL = "gemma4:31b";
const LOCAL_MODEL = "gemma4:e2b-qat";
const MAX_ROUNDS = 4;
// The E-series spends its budget on a reasoning channel first; too small a value returns empty content.
const NUM_PREDICT = 2048;

const SYSTEM = [
  "You are the NouGenNews assistant inside a live news reader.",
  "Answer from the wire and the open story using your tools; never invent headlines, sources or times.",
  "Cite the source name and age for every story you mention. If the wire does not cover it, say so.",
  "Be brief.",
].join(" ");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_wire",
      description: "Search the headlines currently on the wire. Returns the best matches with id, title, source and age.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_article",
      description: "Read the full text of one wire story by its id (from search_wire).",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
];

// Every NouGen Ollama Cloud key name the keymaker holds; the generic one first.
const KEY_NAMES = [
  "OLLAMACLOUD_API_KEY",
  ...[
    "AIWITHDAV3_GMAIL_COM", "CONTACT_WHOVISIONS_COM", "DAVEMERALUS_GMAIL_COM", "DAVE_WHOVISIONS_COM", "EATSRUGER_GMAIL_COM",
    "EDIEBRIKELL12_GMAIL_COM", "KUSHBOYGROUP_GMAIL_COM", "LEARNWITHMRSBTUTORING_GMAIL_COM", "NOUGENAI_GMAIL_COM",
    "SUPERDAVEWHO_GMAIL_COM", "THESEXYSLUMBERPARTY_GMAIL_COM", "WHOENTERTAINS_GMAIL_COM", "WHOVISIONSLLC_GMAIL_COM", "WHOVISIONSTEAM_GMAIL_COM",
  ].map((x) => `OLLAMA_KEY_${x}`),
];

// Which words of the query appear in the title or description, best matches first.
function scoreStory(s, words) {
  const hay = `${s.title} ${s.desc || ""} ${s.source || ""}`.toLowerCase();
  let n = 0;
  for (const w of words) if (hay.includes(w)) n += s.title.toLowerCase().includes(w) ? 2 : 1;
  return n;
}

function makeTools({ wire, readArticle }) {
  return {
    search_wire: ({ query }) => {
      const words = String(query || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const hits = wire.map((s) => ({ s, n: words.length ? scoreStory(s, words) : 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
      if (!hits.length) return "No matching stories on the wire.";
      return hits.map(({ s }) => `[${s.id}] ${s.title} — ${s.source || "unknown"}, ${s.age || "age unknown"}`).join("\n");
    },
    read_article: async ({ id }) => {
      const s = wire.find((x) => String(x.id) === String(id));
      if (!s) return "No such story id on the wire.";
      if (!s.url) return `${s.title}\n${s.desc || ""}`;
      try {
        const a = await readArticle(s.url);
        const text = String((a && (a.text || a.html)) || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 6000);
        return text ? `${s.title}\n${text}` : `${s.title}\n${s.desc || ""}`;
      } catch {
        return `${s.title}\n${s.desc || ""}`;
      }
    },
  };
}

// One /api/chat round on one host. Returns { message } or throws an Error with .status.
async function chatOnce({ base, key, model, messages, http = fetchSafe, signal }) {
  const res = await http(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages, tools: TOOLS, stream: false, options: { num_predict: NUM_PREDICT, temperature: 0.3 } }),
    signal,
  });
  if (!res.ok) {
    const e = new Error(`Ollama HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  if (!data || !data.message) throw new Error("Ollama returned no message");
  return data;
}

// Cloud with key rotation, then local. A refused or rate-limited key moves on to the next; the first success wins.
async function chatRound(opts) {
  const { keys, http, signal } = opts;
  let lastError = null;
  for (const key of keys.slice(opts.start || 0)) {
    try {
      const data = await chatOnce({ base: CLOUD, key, model: CLOUD_MODEL, messages: opts.messages, http, signal });
      return { data, model: CLOUD_MODEL, keyIndex: keys.indexOf(key) };
    } catch (e) {
      lastError = e;
      if (signal && signal.aborted) throw e;
      // Only keys and capacity are worth rotating on; a malformed request fails the same on every key.
      if (e.status && ![401, 402, 403, 429, 500, 502, 503, 504].includes(e.status)) break;
    }
  }
  const data = await chatOnce({ base: LOCAL, key: "", model: LOCAL_MODEL, messages: opts.messages, http, signal }).catch((e) => {
    throw new Error(`No model answered (cloud: ${lastError ? lastError.message : "no keys"}; local: ${e.message})`);
  });
  return { data, model: LOCAL_MODEL, keyIndex: -1 };
}

// The assistant loop: the model asks for tools, we run them, until it answers in text.
async function ask({ question, wire = [], current = null, history = [], keys = [], http, readArticle = async () => ({}), signal }) {
  const tools = makeTools({ wire, readArticle });
  const open = current && current.title ? `The reader has this story open: "${current.title}" (${current.source || "unknown"}).\n${String(current.text || "").slice(0, 3000)}` : "";
  const messages = [
    { role: "system", content: `${SYSTEM}\nThe wire holds ${wire.length} stories.${open ? `\n${open}` : ""}` },
    ...history.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 4000) })),
    { role: "user", content: String(question || "").slice(0, 2000) },
  ];
  let usedModel = "";
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, model } = await chatRound({ keys, http, signal, messages });
    usedModel = model;
    const msg = data.message;
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!calls.length) return { answer: String(msg.content || "").trim(), model: usedModel };
    // The assistant's own tool-call message is echoed back, then each result follows it.
    messages.push(msg);
    for (const c of calls) {
      const name = c.function && c.function.name;
      const args = (c.function && c.function.arguments) || {};
      const fn = Object.prototype.hasOwnProperty.call(tools, name) ? tools[name] : null;
      const out = fn ? await Promise.resolve(fn(args)).catch((e) => `Tool error: ${e.message}`) : `Unknown tool: ${name}`;
      messages.push({ role: "tool", tool_name: name, content: String(out) });
    }
  }
  return { answer: "I could not settle on an answer from the wire in time.", model: usedModel };
}

module.exports = { ask, chatOnce, chatRound, makeTools, KEY_NAMES, CLOUD_MODEL, LOCAL_MODEL, TOOLS };
