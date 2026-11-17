const test = require("node:test");
const assert = require("node:assert/strict");
const { nearestFrames } = require("../eyecams");

const reply = (result) => ({ ok: true, json: async () => ({ result }) });

test("frames come back nearest first, skipping cameras without one", async () => {
  const http = async (_url, { body }) => {
    const { name, arguments: args } = JSON.parse(body).params;
    if (name === "nearest_cameras") return reply({ content: [{ type: "text", text: JSON.stringify([{ id: "a", name: "A", distanceKm: 1 }, { id: "b", name: "B", distanceKm: 2 }]) }] });
    return args.id === "a" ? reply({ content: [{ type: "image", data: "eA==", mimeType: "image/jpeg" }] }) : reply({ isError: true });
  };
  assert.deepEqual(await nearestFrames(26.7, -80.05, { http }), [{ id: "a", name: "A", distanceKm: 1, src: "data:image/jpeg;base64,eA==" }]);
});

test("no NouGen//Eye server means no frames, not an error", async () => {
  assert.deepEqual(await nearestFrames(26.7, -80.05, { http: async () => { throw new Error("refused"); } }), []);
});
