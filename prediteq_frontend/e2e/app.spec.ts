import { test, expect, type Page } from "@playwright/test";

const E2E_AUTH_STORAGE_KEY = "__PREDITEQ_E2E_AUTH__";

type E2EUserRole = "admin" | "user";
type E2EAccountStatus = "pending" | "approved" | "rejected";

interface E2EAppUser {
  id: string;
  fullName: string;
  email: string;
  role: E2EUserRole;
  status: E2EAccountStatus;
  machineId?: string;
  machineCode?: string;
  createdAt: string;
  approvedAt?: string;
}

const MOCK_MACHINE_ROWS = [
  {
    id: "uuid-a1",
    code: "ASC-A1",
    nom: "Ascenseur Magasin A1",
    emplacement: "Batiment A - Zone Nord",
    region: "Ben Arous",
    latitude: 36.754,
    longitude: 10.231,
    statut: "operational",
    hi_courant: 0.87,
    rul_courant: 142,
    anom_count: 1,
    cycles_today: 82,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 1.3, current_a: 4.21, temp_c: 23.4 },
    decision: {
      status: "ok",
      hi: 0.87,
      rul_days: 142,
      alerts_24h: 1,
      urgency_band: "stable",
      urgency_label: "Stable",
      urgency_hex: "#10b981",
      urgency_score: 14,
      summary: "Machine stable",
      plain_reason: "Lecture stable",
      impact: "Pas d'impact critique",
      recommended_action: "Surveillance normale",
      trust_note: "Lecture stable",
      technical_story: "Aucun facteur critique detecte",
      stress_label: "Faible",
      diagnosis_count: 0,
      evidence: [],
      field_checks: [],
      task_template: { type: "inspection", lead_days: 7, title: "Inspection", summary: "Controle visuel" },
      budget_model: { multiplier: 1, delay_multiplier: 1.05 },
      data_source: "simulator_demo",
      updated_at: "2026-05-02T08:10:00.000Z",
      freshness_state: "fresh",
    },
  },
  {
    id: "uuid-b2",
    code: "ASC-B2",
    nom: "Ascenseur Magasin B2",
    emplacement: "Batiment B - Zone Est",
    region: "Sfax",
    latitude: 34.739,
    longitude: 10.76,
    statut: "degraded",
    hi_courant: 0.69,
    rul_courant: 22,
    anom_count: 1,
    cycles_today: 64,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 2.8, current_a: 4.55, temp_c: 25.9 },
    decision: {
      status: "degraded",
      hi: 0.69,
      rul_days: 22,
      alerts_24h: 1,
      urgency_band: "watch",
      urgency_label: "A surveiller",
      urgency_hex: "#0f766e",
      urgency_score: 42,
      summary: "Machine sous surveillance",
      plain_reason: "Des signaux d'usure apparaissent",
      impact: "Intervention a planifier",
      recommended_action: "Inspection sous 48 h",
      trust_note: "Lecture exploitable",
      technical_story: "Variabilite et vibration en hausse",
      stress_label: "Modere",
      diagnosis_count: 1,
      evidence: [],
      field_checks: [],
      task_template: { type: "inspection", lead_days: 2, title: "Inspection prioritaire", summary: "Verifier le moteur" },
      budget_model: { multiplier: 1.1, delay_multiplier: 1.08 },
      data_source: "simulator_demo",
      updated_at: "2026-05-02T08:10:00.000Z",
      freshness_state: "fresh",
    },
  },
  {
    id: "uuid-c3",
    code: "ASC-C3",
    nom: "Ascenseur Magasin C3",
    emplacement: "Batiment C - Zone Sud",
    region: "Sousse",
    latitude: 35.828,
    longitude: 10.636,
    statut: "critical",
    hi_courant: 0.31,
    rul_courant: 12,
    anom_count: 3,
    cycles_today: 58,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 6.8, current_a: 4.97, temp_c: 31.2 },
    decision: {
      status: "critical",
      hi: 0.31,
      rul_days: 12,
      alerts_24h: 3,
      urgency_band: "critical",
      urgency_label: "Urgent",
      urgency_hex: "#f43f5e",
      urgency_score: 91,
      summary: "Machine critique",
      plain_reason: "Le risque de defaillance est eleve",
      impact: "Fenetre d'action courte",
      recommended_action: "Intervention immediate",
      trust_note: "Lecture critique",
      technical_story: "Vibration et temperature dominantes",
      stress_label: "Critique",
      diagnosis_count: 2,
      evidence: [],
      field_checks: [],
      task_template: { type: "corrective", lead_days: 0, title: "Intervention urgente", summary: "Arret et controle" },
      budget_model: { multiplier: 1.3, delay_multiplier: 1.15 },
      data_source: "simulator_demo",
      updated_at: "2026-05-02T08:10:00.000Z",
      freshness_state: "fresh",
    },
  },
] as const;

async function seedAuth(page: Page, currentUser: E2EAppUser, allUsers: E2EAppUser[] = []) {
  const payload = { currentUser, allUsers };

  await page.addInitScript(
    ([storageKey, authPayload]) => {
      window.localStorage.setItem(storageKey, JSON.stringify(authPayload));
      (window as Window & { __PREDITEQ_E2E_AUTH__?: unknown }).__PREDITEQ_E2E_AUTH__ = authPayload;
    },
    [E2E_AUTH_STORAGE_KEY, payload],
  );
}

async function mockMachines(page: Page) {
  await page.route("**/machines", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_MACHINE_ROWS),
    });
  });
}

const ADMIN_USER: E2EAppUser = {
  id: "e2e-admin",
  fullName: "Admin PrediTeq",
  email: "admin@prediteq.test",
  role: "admin",
  status: "approved",
  createdAt: "2026-05-02T08:00:00.000Z",
  approvedAt: "2026-05-02T08:05:00.000Z",
};

const OPERATOR_USER: E2EAppUser = {
  id: "e2e-operator",
  fullName: "Operateur PrediTeq",
  email: "operator@prediteq.test",
  role: "user",
  status: "approved",
  machineId: "ASC-A1",
  machineCode: "ASC-A1",
  createdAt: "2026-05-02T08:00:00.000Z",
  approvedAt: "2026-05-02T08:05:00.000Z",
};

const PENDING_USER: E2EAppUser = {
  id: "e2e-pending",
  fullName: "Pending PrediTeq",
  email: "pending@prediteq.test",
  role: "user",
  status: "pending",
  machineId: "ASC-B2",
  machineCode: "ASC-B2",
  createdAt: "2026-05-02T08:00:00.000Z",
};

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
    await expect(page).toHaveURL(/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    const errorBanner = page.locator(".bg-destructive\\/10");
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Unauthenticated redirect", () => {
  test("redirects to landing when accessing dashboard without auth", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(landing|login)/, { timeout: 5000 });
  });
});

test.describe("Landing page", () => {
  test("landing page loads without errors", async ({ page }) => {
    await page.goto("/landing");
    await expect(page).toHaveURL(/landing/);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("Navigation", () => {
  test("signup page is accessible", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});

test.describe("Authenticated app flows", () => {
  test("redirects approved users away from login", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await page.goto("/login");
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Tableau de bord/i })).toBeVisible();
  });

  test("shows pending gate when a pending user opens the dashboard", async ({ page }) => {
    await seedAuth(page, PENDING_USER, [PENDING_USER]);
    await page.goto("/dashboard");
    await expect(page.getByText(PENDING_USER.email)).toBeVisible();
    await expect(page.getByText(PENDING_USER.fullName)).toBeVisible();
  });

  test("blocks standard users from admin-only pages", async ({ page }) => {
    await seedAuth(page, OPERATOR_USER, [OPERATOR_USER]);
    await page.goto("/simulateur");
    await expect(page.getByRole("heading", { name: /Acces refuse/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Retour au tableau de bord/i })).toBeVisible();
  });

  test("lets admins open the simulator", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await page.goto("/simulateur");
    await expect(page.getByRole("heading", { name: /Contr.*simulateur/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /D[ée]marrer/i })).toBeVisible();
  });

  test("keeps the selected machine stable when switching on the dashboard", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await page.goto("/dashboard?machine=ASC-A1");

    const machineSelect = page.locator('select:has(option[value="ASC-A1"])');
    await expect(machineSelect).toBeVisible();

    await machineSelect.selectOption("ASC-B2");
    await expect(machineSelect).toHaveValue("ASC-B2");
    await expect(page).toHaveURL(/machine=ASC-B2/);

    await machineSelect.selectOption("ASC-C3");
    await expect(machineSelect).toHaveValue("ASC-C3");
    await expect(page).toHaveURL(/machine=ASC-C3/);

    await page.waitForTimeout(800);
    await expect(machineSelect).toHaveValue("ASC-C3");
    await expect(page).toHaveURL(/machine=ASC-C3/);
  });
});
