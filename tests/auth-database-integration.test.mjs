import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ownedProjectsWhere } from "../lib/auth/ownership.ts";
import {
  MAX_FAILURES,
  recordLoginFailureAtomic,
  throttleKey,
} from "../lib/auth/rate-limit-core.ts";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;

test(
  "PostgreSQL applique l'isolation, la FK validée et l'incrément atomique",
  { skip: databaseUrl ? false : "AUTH_TEST_DATABASE_URL non définie" },
  async () => {
    if (!databaseUrl) return;
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const marker = `auth-integration-${Date.now()}`;
    const userAId = `${marker}-a`;
    const userBId = `${marker}-b`;
    const throttleEmail = `${marker}@example.invalid`;

    try {
      const constraints = await prisma.$queryRaw`
        SELECT convalidated
        FROM pg_constraint
        WHERE conname = 'Project_userId_fkey'
      `;
      assert.deepEqual(constraints, [{ convalidated: true }]);

      await prisma.user.createMany({
        data: [
          { id: userAId, email: `${marker}-a@example.invalid`, passwordHash: "test-only" },
          { id: userBId, email: `${marker}-b@example.invalid`, passwordHash: "test-only" },
        ],
      });
      const commonProject = {
        sourceContent: "Contenu de test",
        targetDurationMinutes: 5,
        audience: "10-12 ans",
        tone: "calme",
        level: "simple",
        learningObjective: "Vérifier l'isolation",
      };
      await prisma.project.createMany({
        data: [
          { id: `${marker}-project-a`, title: "Projet A", userId: userAId, ...commonProject },
          { id: `${marker}-project-b`, title: "Projet B", userId: userBId, ...commonProject },
          { id: `${marker}-project-legacy`, title: "Projet historique", userId: null, ...commonProject },
        ],
      });

      const projectsA = await prisma.project.findMany({ where: ownedProjectsWhere(userAId) });
      const projectsB = await prisma.project.findMany({ where: ownedProjectsWhere(userBId) });
      assert.deepEqual(projectsA.map(({ id }) => id), [`${marker}-project-a`]);
      assert.deepEqual(projectsB.map(({ id }) => id), [`${marker}-project-b`]);

      await assert.rejects(
        prisma.project.create({
          data: {
            id: `${marker}-invalid-owner`,
            title: "Propriétaire invalide",
            userId: `${marker}-unknown`,
            ...commonProject,
          },
        }),
      );

      await Promise.all(
        Array.from({ length: MAX_FAILURES }, () =>
          recordLoginFailureAtomic(prisma, throttleEmail),
        ),
      );
      const throttle = await prisma.authThrottle.findUniqueOrThrow({
        where: { keyHash: throttleKey(throttleEmail) },
      });
      assert.equal(throttle.failureCount, MAX_FAILURES);
      assert.ok(throttle.blockedUntil && throttle.blockedUntil.getTime() > Date.now());
    } finally {
      await prisma.authThrottle.deleteMany({ where: { keyHash: throttleKey(throttleEmail) } });
      await prisma.project.deleteMany({ where: { id: { startsWith: marker } } });
      await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
      await prisma.$disconnect();
    }
  },
);
