import { test, expect } from "@playwright/test";

test.describe("En-têtes de sécurité", () => {
  test("les en-têtes de sécurité sont présents sur les réponses", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("le CSP est configuré", async ({ request }) => {
    const response = await request.get("/login");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});

test.describe("Protection CSRF / méthodes", () => {
  test("les routes API refusent les requêtes non autorisées", async ({ request }) => {
    // La route audio nécessite une authentification
    const response = await request.get("/api/projects/fake-id/audio");
    // Devrait retourner une redirection ou une erreur, pas un 200
    expect(response.status()).not.toBe(200);
  });
});

test.describe("Rate limiting (login)", () => {
  test("les tentatives rapides de connexion ne crashent pas le serveur", async ({ request }) => {
    const promises = Array.from({ length: 5 }, () =>
      request.post("/login", {
        form: {
          email: "bruteforce@test.fr",
          password: "motdepassefaux1",
        },
      })
    );
    const results = await Promise.all(promises);
    // Toutes les réponses devraient être des redirections (302) ou des erreurs contrôlées
    for (const res of results) {
      expect([200, 302, 303, 307, 429]).toContain(res.status());
    }
  });
});
