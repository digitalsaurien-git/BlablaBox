import assert from "node:assert/strict";
export function disposableDatabaseUrl(value) {
  assert.ok(value, "Une URL PostgreSQL jetable explicite est obligatoire");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(Number(url.port) > 1024 && url.port !== "5432");
  assert.equal(url.username, "lot2_audit");
  assert.ok(["/lot2_full", "/lot2_upgrade"].includes(url.pathname));
  return url.toString();
}
