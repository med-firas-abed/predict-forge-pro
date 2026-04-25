import { test, expect } from "@playwright/test";

/*
 * E2E smoke tests for PrediTeq frontend.
 * Requires the dev server running on localhost:8080 (npm run dev).
 *
 * Run with:  npx playwright test
 */

test.describe("Login page", () => {
  test("shows login form when not authenticated", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows validation error for invalid email", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "not-an-email");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    // The form should show an error or remain on the same page
    await expect(page).toHaveURL(/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Wait for error banner to appear
    const errorBanner = page.locator(".bg-destructive\\/10");
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Unauthenticated redirect", () => {
  test("redirects to landing when accessing dashboard without auth", async ({ page }) => {
    await page.goto("/dashboard");
    // Should be redirected to /landing or /login
    await page.waitForURL(/\/(landing|login)/, { timeout: 5000 });
  });
});

test.describe("Landing page", () => {
  test("landing page loads without errors", async ({ page }) => {
    await page.goto("/landing");
    // Page should render without crashing
    await expect(page).toHaveURL(/landing/);
    // Should have some content
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });
});

test.describe("Navigation", () => {
  test("signup page is accessible", async ({ page }) => {
    await page.goto("/signup");
    // Should show signup form (has email + password + full name fields)
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
