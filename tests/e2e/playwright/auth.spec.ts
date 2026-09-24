import { test, expect } from "@playwright/test";

test.describe("Authentification", () => {
  test("la page de connexion s’affiche correctement", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("la connexion avec des identifiants invalides affiche une erreur", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill("inexistant@test.fr");
    await page.getByLabel("Mot de passe").fill("motdepassefaux123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Connexion impossible");
  });

  test("la page d’accueil redirige vers /login si non connecté", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("le health endpoint répond correctement", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.service).toBe("blablabox");
    expect(body).toHaveProperty("checks");
  });
});

test.describe("Inscription", () => {
  test("la page d’inscription affiche le formulaire ou le message de fermeture", async ({ page }) => {
    await page.goto("/register");
    // Selon REGISTRATION_ENABLED, on voit le formulaire ou le message
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    const text = await heading.textContent();
    expect(["Créer un compte", "Inscriptions fermées"]).toContain(text);
  });
});
