import { test, expect } from "@playwright/test";

test.describe("Navigation publique", () => {
  test("la page d’accueil se charge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "BlablaBox" })).toBeVisible();
  });

  test("le header contient le lien BlablaBox", async ({ page }) => {
    await page.goto("/");
    const logo = page.getByRole("link", { name: "BlablaBox" });
    await expect(logo).toHaveAttribute("href", "/");
  });

  test("la page de connexion est accessible depuis l’accueil", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  });
});

test.describe("Pages protégées (non connecté)", () => {
  test("/projects redirige vers /login", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/projects/new redirige vers /login", async ({ page }) => {
    await page.goto("/projects/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/courses redirige vers /login", async ({ page }) => {
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/login/);
  });
});
