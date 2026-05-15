import { chromium } from "@playwright/test";

const frontendUrl = normalizeUrl(process.env.FRONTEND_URL ?? "https://prediteq.aro-teq.com");
const backendUrl = normalizeUrl(process.env.BACKEND_URL ?? "https://prediteq-saas.onrender.com");
const retries = parsePositiveInt(process.env.SMOKE_RETRIES, 1);
const delayMs = parsePositiveInt(process.env.SMOKE_DELAY_MS, 15_000);

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 240)}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${url} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkBackend() {
  const health = await fetchJson(`${backendUrl}/health`);
  assert(health?.status === "ok", `Unexpected backend health payload: ${JSON.stringify(health)}`);

  const metrics = await fetchJson(`${backendUrl}/health/public-metrics`);
  assert(
    typeof metrics?.verified_pipeline?.holdout_r2 === "number",
    "Public metrics payload is missing verified_pipeline.holdout_r2",
  );

  const machines = await fetchJson(`${backendUrl}/auth/machines`);
  assert(Array.isArray(machines) && machines.length >= 1, "Public machine list is empty");
}

async function checkFrontend() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const requestFailures = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith(frontendUrl) && !url.startsWith(backendUrl)) {
      return;
    }
    if (url.includes("/auth/login")) {
      return;
    }
    requestFailures.push(`${url} => ${request.failure()?.errorText ?? "unknown failure"}`);
  });

  await page.route("**/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "text/plain",
      body: "Email ou mot de passe incorrect.",
    });
  });

  try {
    await page.goto(`${frontendUrl}/login`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    await page.locator('input[type="email"]').waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.locator('input[type="password"]').waitFor({
      state: "visible",
      timeout: 15_000,
    });

    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    await page.getByText(/email ou mot de passe incorrect\./i).waitFor({
      state: "visible",
      timeout: 15_000,
    });

    await page.goto(`${frontendUrl}/dashboard`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    const path = new URL(page.url()).pathname;
    assert(
      path === "/login" || path === "/landing" || path === "/pending",
      `Unexpected unauthenticated dashboard route: ${page.url()}`,
    );

    assert(pageErrors.length === 0, `Frontend page errors: ${pageErrors.join(" | ")}`);
    assert(requestFailures.length === 0, `Frontend request failures: ${requestFailures.join(" | ")}`);
  } finally {
    await browser.close();
  }
}

async function runSmoke() {
  console.log(`Checking backend: ${backendUrl}`);
  await checkBackend();

  console.log(`Checking frontend: ${frontendUrl}`);
  await checkFrontend();
}

let lastError = null;

for (let attempt = 1; attempt <= retries; attempt += 1) {
  try {
    console.log(`Smoke attempt ${attempt}/${retries}`);
    await runSmoke();
    console.log("Deployed smoke passed.");
    process.exit(0);
  } catch (error) {
    lastError = error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke attempt ${attempt}/${retries} failed: ${message}`);

    if (attempt < retries) {
      await sleep(delayMs);
    }
  }
}

if (lastError) {
  throw lastError;
}
