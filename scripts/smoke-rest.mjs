// REST smoke test (pure fetch). Boot the server first:
//   SUBSTRATE_FORCE_MOCK=1 SUBSTRATE_DATA_DIR=/tmp/substrate-smoke pnpm dev:server
// then: node scripts/smoke-rest.mjs
const B = process.env.SUBSTRATE_SERVER ?? "http://localhost:4321";
const j = (r) => r.json();
const post = (p, b) =>
  fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(j);
const get = (p) => fetch(B + p).then(j);

const { deckId } = await post("/api/decks", {
  title: "Substrate pitch",
  aspectRatio: "16:9",
  designPresetId: "apple",
  outline: "a pitch for Substrate",
});
console.log("deck:", deckId);
await new Promise((r) => setTimeout(r, 2500));

const detail = await get(`/api/decks/${deckId}`);
const rendered = detail.slides.filter((s) => s.imageBlobRef).length;
console.log("rendered:", rendered, "/", detail.slides.length);

const s0 = detail.slides[0];
const img = await fetch(B + "/blobs/" + s0.imageBlobRef);
console.log("blob:", img.status, img.headers.get("content-type"));

const edit = await post(`/api/slides/${s0.id}/prompt`, { prompt: "A bold hero slide.", mode: "direct" });
console.log("edit applied:", edit.applied);

await post(`/api/decks/${deckId}/review`, { on: true });
const prop = await post(`/api/slides/${s0.id}/prompt`, { prompt: "Proposed in review mode", mode: "direct" });
console.log("review-mode edit applied (should be false):", prop.applied);
const pend = await get(`/api/decks/${deckId}/pending`);
console.log("pending:", pend.length, "author:", pend[0]?.author);
const res = await post(`/api/edits/${pend[0].id}/resolve`, { decision: "approve" });
console.log("resolve applied:", res.applied);

const vars = await post(`/api/slides/${s0.id}/variations`, { count: 3 });
console.log("variations:", vars.length);
const exp = await get(`/api/decks/${deckId}/export?format=png`);
console.log("export:", exp.path);
console.log("OK");
