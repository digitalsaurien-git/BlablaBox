import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { disposableDatabaseUrl } from "../helpers/lot2-environment.mjs";

const root = path.resolve(process.env.SOURCE_STORAGE_ROOT);
assert.equal(path.basename(root), "http-sources");
assert.match(path.basename(path.dirname(root)), /^blablabox-lot2-audit-[a-f0-9]+$/);
const relative = path.relative(tmpdir(), root);
assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
const db = new PrismaClient({ datasources: { db: { url: disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL) } } });
try {
  const where = { email: { startsWith: "lot2-http-", endsWith: "@example.invalid" } };
  const assets = await db.sourceAsset.findMany({ where: { user: where }, select: { storageKey: true } });
  for (const asset of assets) assert.match(asset.storageKey, /^[a-f0-9-]{36}$/);
  const deleted = await db.user.deleteMany({ where });
  for (const asset of assets) await rm(path.join(root, asset.storageKey), { force: true });
  console.log(JSON.stringify({ disposableHttpUsersRemoved: deleted.count, disposableFilesRemoved: assets.length }));
} finally { await db.$disconnect(); }
