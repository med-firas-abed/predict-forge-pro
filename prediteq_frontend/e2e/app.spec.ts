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
    nom: "Machine 1",
    emplacement: "Site Nord - Bizerte",
    region: "Bizerte",
    latitude: 37.2744,
    longitude: 9.8739,
    statut: "operational",
    hi_courant: 0.96,
    rul_courant: 142,
    anom_count: 1,
    cycles_today: 82,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 1.3, current_a: 4.21, temp_c: 23.4 },
    decision: {
      status: "ok",
      hi: 0.96,
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
    nom: "Machine 2",
    emplacement: "Batiment B - Zone Est",
    region: "Sfax",
    latitude: 34.739,
    longitude: 10.76,
    statut: "degraded",
    hi_courant: 0.62,
    rul_courant: 54,
    anom_count: 1,
    cycles_today: 64,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 2.8, current_a: 4.55, temp_c: 25.9 },
    decision: {
      status: "degraded",
      hi: 0.62,
      rul_days: 54,
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
    nom: "Machine 3",
    emplacement: "Batiment C - Zone Sud",
    region: "Sousse",
    latitude: 35.828,
    longitude: 10.636,
    statut: "critical",
    hi_courant: 0.10,
    rul_courant: 12,
    anom_count: 3,
    cycles_today: 58,
    modele: "SITI FC100L1-4",
    etages: 19,
    derniere_maj: "2026-05-02T08:10:00.000Z",
    last_sensors: { rms_mms: 6.8, current_a: 4.97, temp_c: 31.2 },
    decision: {
      status: "critical",
      hi: 0.10,
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

async function mockEsp32Serial(page: Page) {
  await page.addInitScript(() => {
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    type MockPort = {
      readable: ReadableStream<Uint8Array> | null;
      writable: WritableStream<Uint8Array> | null;
      open: (options?: { baudRate?: number }) => Promise<void>;
      close: () => Promise<void>;
      getInfo: () => { usbVendorId: number; usbProductId: number };
    };

    const windowWithEsp = window as Window & {
      __espCommands?: string[];
    };
    windowWithEsp.__espCommands = [];

    const createPort = (): MockPort => {
      let readable: ReadableStream<Uint8Array> | null = null;
      let writable: WritableStream<Uint8Array> | null = null;
      let stopStream: (() => void) | null = null;

      return {
        get readable() {
          return readable;
        },
        get writable() {
          return writable;
        },
        async open() {
          readable = new ReadableStream<Uint8Array>({
            start(controller) {
              const frames = [
                "============================================================",
                " ESP32 - ACS712-5A + MPU6050 - Courant & Vibrations",
                " Le moteur peut etre demarre. Le MPU peut etre secoue.",
                "I = 91 mA   |   Vib = 0.342 g   |   |a| = 1.084 g",
                "I = 93 mA   |   Vib = 0.342 g   |   |a| = 1.086 g",
                "I = 92 mA   |   Vib = 0.342 g   |   |a| = 1.085 g",
              ];
              let index = 0;
              let closed = false;

              const pushFrame = () => {
                if (closed) return;
                const line = frames[index % frames.length];
                controller.enqueue(textEncoder.encode(`${line}\n`));
                index += 1;
              };

              pushFrame();
              const intervalId = window.setInterval(pushFrame, 80);
              stopStream = () => {
                if (closed) return;
                closed = true;
                window.clearInterval(intervalId);
                try {
                  controller.close();
                } catch {
                  // Stream may already be closed by the reader.
                }
              };
            },
            cancel() {
              stopStream?.();
            },
          });

          writable = new WritableStream<Uint8Array>({
            write(chunk) {
              windowWithEsp.__espCommands?.push(textDecoder.decode(chunk));
            },
          });
        },
        async close() {
          stopStream?.();
          stopStream = null;
          readable = null;
          writable = null;
        },
        getInfo() {
          return { usbVendorId: 0x10c4, usbProductId: 0xea60 };
        },
      };
    };

    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          return createPort();
        },
      },
    });
  });
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

async function mockPlannerCalendarFlow(page: Page) {
  const today = new Date().toISOString().slice(0, 10);
  const repeatedTaskTitle = "Intervention corrective ASC-C3 - Vibration moteur - reprise";
  const plannerTask = {
    machine_code: "ASC-C3",
    titre: repeatedTaskTitle,
    type: "corrective",
    priorite: "haute",
    date_planifiee: today,
    cout_estime: 480,
    description:
      "Action: Intervention immediate. Etat: HI 12%, RUL 4 j, zone Critical, score 93/100, signal dominant Vibration moteur. Contexte calendrier: 1 tache deja ouverte.",
    technicien: "",
  } as const;

  const taskStore = [
    {
      id: "existing-task-1",
      machineId: "uuid-c3",
      machineCode: "ASC-C3",
      titre: repeatedTaskTitle,
      description: "[Agent planificateur] Tache deja ouverte pour cette derive.",
      statut: "planifiee",
      technicien: "",
      datePlanifiee: today,
      coutEstime: 420,
      type: "corrective",
      createdAt: `${today}T08:00:00.000Z`,
    },
  ];

  await page.route("**/planner/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: `${today}T09:00:00.000Z`,
        focus_machine: null,
        markdown: "Synthese planner backend pour la machine critique ASC-C3.",
        tasks: [plannerTask],
        fleet: [
          {
            machine_code: "ASC-C3",
            nom: "Machine 3",
            region: "Sousse",
            hi: 0.12,
            rul_days: 4,
            zone: "Critical",
            risk_score: 93,
            risk_level: "critical",
            risk_label: "Urgent",
            summary: "Machine critique avec derive vibratoire persistante.",
            recommended_action: "Reprendre l'intervention corrective sans attendre.",
            maintenance_window: "Controle terrain prioritaire",
            open_tasks: 1,
            data_source: "live_runtime",
            updated_at: `${today}T09:00:00.000Z`,
            is_stale: false,
            plain_reason: "La vibration moteur reste dominante malgre une action deja ouverte.",
            impact: "Le risque d'arret reste eleve si aucune reprise n'est programmee.",
            evidence: ["HI 12 %", "RUL 4 j", "1 tache corrective deja ouverte"],
            field_checks: ["Verifier les roulements et l'alignement moteur."],
            projected_cost: 480,
            delayed_cost: 560,
            delay_penalty: 80,
            task_context:
              "Contexte calendrier: 1 tache de intervention corrective est deja ouverte sur cette machine.",
            similar_open_tasks: 1,
            recent_completed_tasks: 2,
            task_suggestion: plannerTask,
          },
        ],
      }),
    });
  });

  await page.route("**/planner/approve", async (route) => {
    const body = route.request().postDataJSON() as typeof plannerTask;
    taskStore.push({
      id: `approved-task-${taskStore.length + 1}`,
      machineId: "uuid-c3",
      machineCode: body.machine_code,
      titre: body.titre,
      description: `[Agent planificateur] ${body.description}`,
      statut: "planifiee",
      technicien: body.technicien ?? "",
      datePlanifiee: body.date_planifiee ?? today,
      coutEstime: body.cout_estime ?? 480,
      type: body.type,
      createdAt: `${today}T09:15:00.000Z`,
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        message: `Tache '${body.titre}' creee pour ${body.machine_code}`,
        machine_code: body.machine_code,
        repeat_note:
          "Relance planner autorisee: 1 tache au meme titre est deja ouverte; la nouvelle insertion reste permise.",
      }),
    });
  });

  await page.route("**/runtime-data/tasks*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taskStore),
    });
  });
}

function getMockMachineRow(machineCode: string) {
  return (
    MOCK_MACHINE_ROWS.find(
      (row) => row.code === machineCode || row.id === machineCode,
    ) ?? MOCK_MACHINE_ROWS[0]
  );
}

function buildDiagnosticsPayload(machineCode: string) {
  const row = getMockMachineRow(machineCode);
  const isCritical = row.code === "ASC-C3";
  const isWatch = row.code === "ASC-B2";
  const stressBand = isCritical ? "critical" : isWatch ? "moderate" : "low";
  const stressValue = isCritical ? 0.84 : isWatch ? 0.52 : 0.18;
  const dominantAxis = isCritical ? "vibration" : isWatch ? "load" : "thermal";
  const maintenanceWindow = isCritical
    ? "Intervenir sous 24 h"
    : isWatch
      ? "Inspection sous 48 h"
      : "Surveillance hebdomadaire";
  const confidence = isWatch ? "medium" : "high";
  const diagnosisSeverity = isCritical ? "critical" : isWatch ? "warning" : "info";
  const diagnosticsTitle = isCritical
    ? "Vibration moteur dominante"
    : isWatch
      ? "Charge instable"
      : "Lecture stable";
  const hi = row.hi_courant;
  const rulDays = row.rul_courant;
  const intervalLow = Math.max(1, rulDays - (isCritical ? 1 : isWatch ? 6 : 12));
  const intervalHigh = rulDays + (isCritical ? 2 : isWatch ? 8 : 16);
  const zone = isCritical ? "Critical" : isWatch ? "Degraded" : "Excellent";

  return {
    machine_code: machineCode,
    rul_interval: {
      machine_code: machineCode,
      source: "random_forest",
      rul_days: rulDays,
      rul_days_p10: intervalLow,
      rul_days_p90: intervalHigh,
      rul_minutes: rulDays * 24 * 60,
      cvi: 0.12,
      confidence,
      n_trees: 64,
      status: "ok",
      disclaimer: "Pronostic demo",
    },
    diagnose: {
      machine_code: machineCode,
      inputs: {
        vibration_rms: row.last_sensors.rms_mms,
        current_a: row.last_sensors.current_a,
        temp_c: row.last_sensors.temp_c,
      },
      diagnoses: [
        {
          cause: diagnosticsTitle,
          detail: isCritical
            ? "La derive vibratoire reste dominante sur la machine critique."
            : isWatch
              ? "Le profil de charge reste plus instable que le nominal."
              : "Aucune derive experte critique n'est active.",
          severity: diagnosisSeverity,
          action: isCritical
            ? "Verifier les roulements, l'alignement et la fixation moteur."
            : isWatch
              ? "Confirmer la charge et inspecter la transmission sous 48 h."
              : "Continuer la surveillance normale.",
          refs: isCritical
            ? ["rms_mms", "current_a", "temp_c"]
            : ["rms_mms", "current_a"],
          code: `${machineCode}-diagnostic`,
        },
      ],
      count: 1,
    },
    rul_explain: {
      machine_code: machineCode,
      baseline_days: rulDays + 14,
      prediction_days: rulDays,
      prediction_minutes: rulDays * 24 * 60,
      contributions: [
        {
          feature: "vibration_rms",
          value: row.last_sensors.rms_mms,
          shap_value_min: isCritical ? -960 : isWatch ? -240 : 120,
          impact_days: isCritical ? -12.5 : isWatch ? -5.2 : 3.4,
          direction: isCritical || isWatch ? "raccourcit" : "rallonge",
          rank: 1,
        },
        {
          feature: "current_a",
          value: row.last_sensors.current_a,
          shap_value_min: isCritical ? -420 : isWatch ? -180 : 60,
          impact_days: isCritical ? -6.1 : isWatch ? -2.8 : 1.1,
          direction: isCritical || isWatch ? "raccourcit" : "rallonge",
          rank: 2,
        },
        {
          feature: "temp_c",
          value: row.last_sensors.temp_c,
          shap_value_min: isCritical ? -210 : isWatch ? -70 : 25,
          impact_days: isCritical ? -2.9 : isWatch ? -1.1 : 0.4,
          direction: isCritical || isWatch ? "raccourcit" : "rallonge",
          rank: 3,
        },
      ],
      other_impact_days: isCritical ? -1.5 : isWatch ? -0.8 : 0.2,
      other_impact_count: 2,
      top_k: 3,
    },
    stress_index: {
      machine_code: machineCode,
      value: stressValue,
      band: stressBand,
      components: {
        thermal: isCritical ? 0.72 : isWatch ? 0.41 : 0.12,
        vibration: isCritical ? 0.91 : isWatch ? 0.38 : 0.09,
        load: isCritical ? 0.66 : isWatch ? 0.58 : 0.17,
        variability: isCritical ? 0.52 : isWatch ? 0.44 : 0.11,
      },
      dominant: dominantAxis,
      inputs_seen: ["thermal", "vibration", "load", "variability"],
    },
    calibrated_rul: {
      machine_code: machineCode,
      mode: "prediction",
      hi_current: hi,
      zone,
      bearing_reference: {
        years_adjusted: 3.4,
        p_observed_kw: 1.25,
        p_nominal_kw: 1.5,
        source: "measured",
        reference: "ISO 281",
        bearing_model: "6204",
      },
      disclosures: {
        availability_note: "Pronostic live disponible",
        calendar_basis: "Rythme observe sur la machine",
        bearing_reference_basis: "Reference ISO 281 corrigee par charge observee",
        warmup_note: "Calibration terminee",
        model_scope_note: "Lecture issue du pipeline de demo",
      },
      prediction: {
        rul_days: rulDays,
        rul_days_p10: intervalLow,
        rul_days_p90: intervalHigh,
        rul_days_display_low: intervalLow,
        rul_days_display_high: intervalHigh,
        display_interval_label: "IC 80 %",
        cycles_remaining: rulDays * 52,
        cycles_per_day_observed: 52,
        factor_used: 1,
        factor_source: "observed",
        cycles_per_sim_min: 1,
        hi_zone: zone,
        maintenance_window: maintenanceWindow,
        rul_min_simulator: rulDays * 24 * 60,
        rul_min_p10: intervalLow * 24 * 60,
        rul_min_p90: intervalHigh * 24 * 60,
        n_trees: 64,
        cvi: 0.12,
        confidence,
        stop_recommended: isCritical,
      },
      reference_prediction: {
        kind: "demo_reference",
        rul_days: rulDays + 20,
      },
      maintenance_window: maintenanceWindow,
      warmup_detail: "Lecture stable",
    },
    disclaimers: {
      rul_nature: "Demo",
      calibration_notice: "Calibrated replay",
      badge_labels: {
        high: {
          label: "Lecture solide",
          color_hex: "#10b981",
          icon: "check",
          tooltip: "Lecture stable",
        },
        medium: {
          label: "Lecture utilisable",
          color_hex: "#f59e0b",
          icon: "alert",
          tooltip: "Controle terrain conseille",
        },
        low: {
          label: "A confirmer",
          color_hex: "#94a3b8",
          icon: "info",
          tooltip: "Lecture a confirmer",
        },
      },
    },
    errors: {},
  };
}

function buildSensorHistory(machineCode: string) {
  const row = getMockMachineRow(machineCode);
  const baseTime = Date.parse("2026-05-14T09:00:00.000Z");
  const vibrationStep = row.code === "ASC-C3" ? 0.4 : row.code === "ASC-B2" ? 0.18 : 0.05;
  const currentStep = row.code === "ASC-C3" ? 0.08 : row.code === "ASC-B2" ? 0.05 : 0.02;
  const temperatureStep = row.code === "ASC-C3" ? 0.6 : row.code === "ASC-B2" ? 0.35 : 0.15;

  return Array.from({ length: 4 }, (_, index) => ({
    ts: new Date(baseTime + index * 5 * 60_000).toISOString(),
    rms_mms: Number((row.last_sensors.rms_mms - vibrationStep * (3 - index)).toFixed(2)),
    power_kw: Number((1.05 + index * 0.03).toFixed(2)),
    current_a: Number((row.last_sensors.current_a - currentStep * (3 - index)).toFixed(2)),
    temp_c: Number((row.last_sensors.temp_c - temperatureStep * (3 - index)).toFixed(2)),
    tick: index * 300,
  }));
}

async function mockDiagnosticsAndSensors(page: Page) {
  await page.route(/\/diagnostics\/[^/]+\/all(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/diagnostics\/([^/]+)\/all$/);
    const machineCode = decodeURIComponent(match?.[1] ?? "ASC-A1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildDiagnosticsPayload(machineCode)),
    });
  });

  await page.route(/\/machines\/[^/]+\/sensors$/, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/machines\/([^/]+)\/sensors$/);
    const machineCode = decodeURIComponent(match?.[1] ?? "ASC-A1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSensorHistory(machineCode)),
    });
  });
}

async function mockAlertsData(page: Page) {
  const alertsStore = [
    {
      id: "alert-c3-open",
      machineId: "uuid-c3",
      machineCode: "ASC-C3",
      titre: "Vibration moteur",
      description: "La vibration moteur reste dominante.",
      severite: "urgence",
      acquitte: false,
      createdAt: "2026-05-14T09:15:00.000Z",
    },
    {
      id: "alert-b2-open",
      machineId: "uuid-b2",
      machineCode: "ASC-B2",
      titre: "Charge instable",
      description: "Le profil de charge reste plus instable que le nominal.",
      severite: "surveillance",
      acquitte: false,
      createdAt: "2026-05-14T08:40:00.000Z",
    },
    {
      id: "alert-c3-closed",
      machineId: "uuid-c3",
      machineCode: "ASC-C3",
      titre: "Temperature palier",
      description: "Signal historique acquitte.",
      severite: "info",
      acquitte: true,
      createdAt: "2026-05-13T11:00:00.000Z",
    },
  ];

  const emailHistoryStore = [
    {
      id: "mail-c3",
      machineId: "uuid-c3",
      machineCode: "ASC-C3",
      machineName: "Machine 3",
      recipientEmail: "c3@prediteq.test",
      success: true,
      type: "hi",
      source: "simulator",
      severity: "urgence",
      subject: "Alerte ASC-C3",
      note: "Escalade critique envoyee",
      createdAt: "2026-05-14T09:18:00.000Z",
    },
    {
      id: "mail-b2",
      machineId: "uuid-b2",
      machineCode: "ASC-B2",
      machineName: "Machine 2",
      recipientEmail: "b2@prediteq.test",
      success: true,
      type: "hi",
      source: "scheduler",
      severity: "surveillance",
      subject: "Alerte ASC-B2",
      note: "Notification de surveillance envoyee",
      createdAt: "2026-05-14T08:42:00.000Z",
    },
  ];

  await page.route(/\/alerts(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith("/email-history")) {
      const machineFilter = url.searchParams.get("machine_id");
      const filteredHistory = machineFilter
        ? emailHistoryStore.filter(
            (entry) =>
              entry.machineId === machineFilter || entry.machineCode === machineFilter,
          )
        : emailHistoryStore;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredHistory),
      });
      return;
    }

    if (pathname.endsWith("/acknowledge")) {
      const match = pathname.match(/\/alerts\/([^/]+)\/acknowledge$/);
      const alertId = match?.[1];
      const target = alertsStore.find((alert) => alert.id === alertId);
      if (target) {
        target.acquitte = true;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
      return;
    }

    const machineFilter = url.searchParams.get("machine_id");
    const filteredAlerts = machineFilter
      ? alertsStore.filter(
          (alert) =>
            alert.machineId === machineFilter || alert.machineCode === machineFilter,
        )
      : alertsStore;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filteredAlerts),
    });
  });
}

async function mockCostsAndTasks(page: Page) {
  const costRows = [
    {
      id: "cost-1",
      machineCode: "ASC-A1",
      mois: 2,
      annee: 2026,
      mainOeuvre: 120,
      pieces: 80,
      total: 200,
    },
    {
      id: "cost-2",
      machineCode: "ASC-B2",
      mois: 3,
      annee: 2026,
      mainOeuvre: 260,
      pieces: 140,
      total: 400,
    },
    {
      id: "cost-3",
      machineCode: "ASC-C3",
      mois: 4,
      annee: 2026,
      mainOeuvre: 420,
      pieces: 260,
      total: 680,
    },
    {
      id: "cost-4",
      machineCode: "ASC-C3",
      mois: 5,
      annee: 2026,
      mainOeuvre: 480,
      pieces: 310,
      total: 790,
    },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const taskStore = [
    {
      id: "task-a1",
      machineId: "uuid-a1",
      machineCode: "ASC-A1",
      titre: "Inspection ASC-A1",
      description: "Controle visuel",
      statut: "planifiee",
      technicien: "Equipe A",
      datePlanifiee: today,
      coutEstime: 160,
      type: "inspection",
      createdAt: `${today}T08:00:00.000Z`,
    },
    {
      id: "task-c3",
      machineId: "uuid-c3",
      machineCode: "ASC-C3",
      titre: "Intervention corrective ASC-C3",
      description: "Controle roulements",
      statut: "planifiee",
      technicien: "Equipe C",
      datePlanifiee: today,
      coutEstime: 520,
      type: "corrective",
      createdAt: `${today}T09:00:00.000Z`,
    },
  ];

  await page.route(/\/runtime-data\/costs(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(costRows),
    });
  });

  await page.route(/\/runtime-data\/tasks(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taskStore),
    });
  });
}

async function mockSimulatorLifecycle(page: Page) {
  let lastStartRequest = "";
  const simulatorStatus = {
    running: false,
    tick: 0,
    speed: 60,
    machines: Object.fromEntries(
      MOCK_MACHINE_ROWS.map((row) => [
        row.code,
        {
          total: 100,
          current: 0,
          hi_smooth: row.hi_courant,
          zone:
            row.code === "ASC-C3"
              ? "Critical"
              : row.code === "ASC-B2"
                ? "Degraded"
                : "Excellent",
          current_load_kg: row.code === "ASC-C3" ? 720 : row.code === "ASC-B2" ? 540 : 360,
        },
      ]),
    ),
  };

  await page.route(/\/simulator\/status$/, async (route) => {
    if (simulatorStatus.running) {
      simulatorStatus.tick += 10;
      for (const machine of Object.values(simulatorStatus.machines)) {
        machine.current = Math.min(machine.total ?? 100, (machine.current ?? 0) + 10);
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(simulatorStatus),
    });
  });

  await page.route(/\/simulator\/start(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    lastStartRequest = url.search;
    simulatorStatus.running = true;
    simulatorStatus.speed = Number(url.searchParams.get("speed") ?? "60");
    if (url.searchParams.get("reset") === "true") {
      simulatorStatus.tick = 0;
      for (const machine of Object.values(simulatorStatus.machines)) {
        machine.current = 0;
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "started" }),
    });
  });

  await page.route(/\/simulator\/stop$/, async (route) => {
    simulatorStatus.running = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "stopped" }),
    });
  });

  return {
    getLastStartRequest: () => lastStartRequest,
  };
}

async function mockAuthMachineOptions(page: Page) {
  await page.route(/\/auth\/machines$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        MOCK_MACHINE_ROWS.map((row) => ({
          id: row.id,
          code: row.code,
          nom: row.nom,
        })),
      ),
    });
  });
}

async function mockAdminSupportData(page: Page) {
  await mockAuthMachineOptions(page);

  await page.route(/\/seuils\/recipients-preview$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          machine_id: "uuid-c3",
          machine_code: "ASC-C3",
          machine_name: "Machine 3",
          machine_users: [
            {
              id: "e2e-operator",
              full_name: "Operateur PrediTeq",
              email: "operator@prediteq.test",
            },
          ],
          configured: {
            manager_email: "manager@prediteq.test",
            technician_email: "tech@prediteq.test",
          },
          recipients: [
            {
              email: "manager@prediteq.test",
              sources: ["admin", "manager_email"],
              contact_names: ["Responsable maintenance"],
            },
          ],
        },
      ]),
    });
  });

  await page.route(/\/seuils$/, async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fallback();
      return;
    }

    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hi_critical: 0.3,
        hi_surveillance: 0.6,
        rul_critical_days: 7,
        rul_surveillance_days: 30,
        manager_email: "manager@prediteq.test",
        technician_email: "tech@prediteq.test",
      }),
    });
  });

  await page.route(/\/report\/history$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "report-1",
          machine_code: "ASC-C3",
          period: "7d",
          lang: "fr",
          titre: "Rapport ASC-C3 - Vue double - 14 mai",
          created_at: "2026-05-14T09:30:00.000Z",
        },
      ]),
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

const REVIEW_USER: E2EAppUser = {
  id: "e2e-review-user",
  fullName: "Review PrediTeq",
  email: "review@prediteq.test",
  role: "user",
  status: "pending",
  machineCode: "ASC-C3",
  createdAt: "2026-05-03T08:00:00.000Z",
};

const PENDING_USER: E2EAppUser = {
  id: "e2e-pending",
  fullName: "Pending PrediTeq",
  email: "pending@prediteq.test",
  role: "user",
  status: "pending",
  machineCode: "ASC-B2",
  machineName: "Machine 2",
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
    await page.route("**/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "text/plain",
        body: "Email ou mot de passe incorrect.",
      });
    });

    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/email ou mot de passe incorrect/i)).toBeVisible({ timeout: 10000 });
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

  test("landing actions navigate cleanly to login and signup", async ({ page }) => {
    await mockAuthMachineOptions(page);

    await page.goto("/landing");
    await page.getByRole("button", { name: /Connexion|Sign In/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/landing");
    await page.getByRole("button", { name: /Commencer|Get Started/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("signup page is accessible", async ({ page }) => {
    await mockAuthMachineOptions(page);
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("public signup requests reach the pending gate cleanly", async ({ page }) => {
    await mockAuthMachineOptions(page);
    let signupPayload: Record<string, unknown> | null = null;

    await page.route(/\/auth\/signup$/, async (route) => {
      signupPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending" }),
      });
    });

    await page.goto("/signup");
    await page.getByPlaceholder("Ahmed Ben Ali").fill("Demo Visitor");
    await page.getByPlaceholder("votre@email.com").fill("visitor@prediteq.test");

    const passwordInputs = page.locator('input[placeholder="********"]');
    await passwordInputs.nth(0).fill("Visitor123");
    await passwordInputs.nth(1).fill("Visitor123");
    await page.locator("select").selectOption("uuid-b2");
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/pending/);
    await expect(page.getByText(/Compte en cours de validation/i)).toBeVisible();
    expect(signupPayload).toMatchObject({
      full_name: "Demo Visitor",
      email: "visitor@prediteq.test",
      role: "user",
      machine_id: "uuid-b2",
    });
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
    await mockAuthMachineOptions(page);
    await seedAuth(page, PENDING_USER, [PENDING_USER]);
    await page.goto("/dashboard");
    await expect(page.getByText(PENDING_USER.email)).toBeVisible();
    await expect(page.getByText(PENDING_USER.fullName)).toBeVisible();
    await expect(page.getByText("Machine 2")).toBeVisible();

    await page.getByRole("button", { name: /Se d[ée]connecter/i }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
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
    await expect(page.getByRole("heading", { name: /Simulateur/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /D[ée]marrer/i })).toBeVisible();
  });

  test("lets admins approve a repeated AI action and see it in the maintenance calendar", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockPlannerCalendarFlow(page);

    const repeatedTaskTitle = "Intervention corrective ASC-C3 - Vibration moteur - reprise";

    await page.goto("/planner");
    await page.getByRole("button", { name: /Lancer le plan d'action/i }).click();

    await expect(page.getByText("Synthese planner backend pour la machine critique ASC-C3.")).toBeVisible();
    await expect(page.getByText(repeatedTaskTitle)).toBeVisible();
    await expect(page.getByText(/1 relance\(s\) ouverte\(s\)/i)).toBeVisible();
    await expect(page.getByText(/2 action\(s\) recente\(s\)/i)).toBeVisible();

    await page.getByRole("button", { name: /Valider et cr[ée]er dans le calendrier/i }).click();
    await expect(page.getByText(/Relance planner autorisee/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Valider et cr[ée]er dans le calendrier/i })).toHaveCount(0);

    await page.goto("/maintenance");
    await expect(page.getByText(/Calendrier des actions validees apres pronostic/i)).toBeVisible();
    await expect(page.getByText(repeatedTaskTitle).first()).toBeVisible();
    expect(await page.getByText(repeatedTaskTitle).count()).toBeGreaterThan(1);
  });

  test("keeps the selected machine stable when switching on the dashboard", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockDiagnosticsAndSensors(page);
    await mockSimulatorLifecycle(page);
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

  test("lets admins use dashboard and diagnostics shortcuts end to end", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockDiagnosticsAndSensors(page);
    await mockSimulatorLifecycle(page);

    await page.goto("/dashboard?machine=ASC-C3");
    await expect(page.getByRole("heading", { name: /Tableau de bord/i })).toBeVisible();

    await page.getByRole("button", { name: /Contexte d'exploitation/i }).click();
    await expect(page.getByText(/Cadre d'exploitation/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Ouvrir le diagnostic/i }).click();

    await expect(page).toHaveURL(/\/diagnostics\?machine=ASC-C3/);
    await expect(page.getByRole("heading", { name: /Diagnostic avanc/i })).toBeVisible();

    const machineSelect = page.locator('select:has(option[value="ASC-B2"])');
    await expect(machineSelect).toBeVisible();
    await machineSelect.selectOption("ASC-B2");
    await expect(page).toHaveURL(/machine=ASC-B2/);

    await page.getByRole("button", { name: /Retour au tableau de bord/i }).click();
    await expect(page).toHaveURL(/\/dashboard\?machine=ASC-B2/);

    await page.getByRole("button", { name: /Voir pourquoi/i }).click();
    await expect(
      page.getByText(/Éléments qui influencent le pronostic|Elements driving the prognosis/i),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Ouvrir le diagnostic/i }).first().click();
    await expect(page).toHaveURL(/\/diagnostics\?machine=ASC-B2/);
  });

  test("lets admins filter and acknowledge alerts without breaking the workflow", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockDiagnosticsAndSensors(page);

    await page.goto("/alertes");
    await expect(page.getByText(/Alertes issues du pronostic machine/i)).toBeVisible();

    const machineFilter = page.getByRole("main").locator("select").nth(1);
    await machineFilter.selectOption("ASC-B2");
    await expect(page.getByText("b2@prediteq.test")).toBeVisible();
    await expect(page.getByText("c3@prediteq.test")).toHaveCount(0);

    await page.getByRole("button", { name: /Voir les signaux actifs/i }).click();
    await page.getByRole("button", { name: /Acquitter les signaux/i }).click();
    await expect(page.getByText(/Aucun cas actif ne ressort avec les filtres courants/i)).toBeVisible();

    await page.getByRole("button", { name: /Afficher/i }).click();
    await expect(page.getByText(/Charge instable/i)).toBeVisible();

    await machineFilter.selectOption("ASC-C3");
    await page.getByRole("button", { name: /Voir diagnostic/i }).click();
    await expect(page).toHaveURL(/\/diagnostics\?machine=ASC-C3/);
  });

  test("lets admins export costs and follow the shortcut actions", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockCostsAndTasks(page);
    await mockDiagnosticsAndSensors(page);

    await page.goto("/couts");
    await expect(page.getByText(/Impact budgetaire du pronostic machine/i)).toBeVisible();

    await page.getByRole("button", { name: /Exporter CSV/i }).click();
    await expect(page.getByText(/Export CSV pr[eê]t/i)).toBeVisible();

    await page.getByRole("button", { name: /Voir diagnostic/i }).first().click();
    await expect(page).toHaveURL(/\/diagnostics\?machine=ASC-C3/);

    await page.goto("/couts");
    await page.getByRole("button", { name: /Ouvrir le plan d'action/i }).first().click();
    await expect(page).toHaveURL(/\/ia\?tab=planner/);
  });

  test("lets admins operate the simulator controls safely", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    const simulatorMock = await mockSimulatorLifecycle(page);

    await page.goto("/simulateur");
    await expect(page.getByText(/Piloter la démo/i)).toBeVisible();

    await page.getByRole("main").getByRole("combobox").selectOption("500");
    await page.getByRole("button", { name: /Réinitialiser/i }).click();
    await expect(page.getByRole("button", { name: /Annuler la réinitialisation/i })).toBeVisible();

    await page.getByRole("button", { name: /Démarrer|Relancer/i }).click();
    await expect.poll(() => simulatorMock.getLastStartRequest()).toContain("speed=500");
    await expect.poll(() => simulatorMock.getLastStartRequest()).toContain("reset=true");
    await expect(page.getByRole("button", { name: /Simulation lancée|Démarrage/i })).toBeVisible();

    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Pause/i }).click();
    await expect(page.getByText(/Dernière session arrêtée au pas|Last session stopped at tick/i)).toBeVisible();

    await page.getByRole("button", { name: /Rafraîchir/i }).click();
    await expect(page.getByRole("main").getByText(/^x500$/)).toBeVisible();
  });

  test("lets admins interact with the geo view without desynchronizing cards and map controls", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);

    await page.goto("/geo");
    await expect(page.getByText("Carte interactive", { exact: true })).toBeVisible();

    const satelliteButton = page.getByRole("button", { name: /Satellite/i });
    await satelliteButton.click();
    await expect(satelliteButton).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("main").getByRole("button", { name: /Machine 3/i }).first().click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("Machine 3");

    const mapButton = page.getByRole("button", { name: /Plan|Map/i });
    await mapButton.click();
    await expect(mapButton).toHaveAttribute("aria-pressed", "true");
  });

  test.fixme("lets admins run the experiment page over mocked Web Serial", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockEsp32Serial(page);

    await page.goto("/experiment?machine=ASC-C3");
    await expect(page.getByRole("heading", { name: /Exp[ée]rience ESP32/i }).first()).toBeVisible();

    await page.getByRole("button", { name: /Connecter l'ESP32|Connect ESP32/i }).click();
    await expect(page.getByRole("button", { name: /Reconnecter l'ESP32|Reconnect ESP32/i })).toBeVisible();
    await expect(page.getByText(/Initialisation ESP32|ESP32 startup/i)).toBeVisible();
    const sampleCard = page
      .getByText(/Ã‰chantillons reÃ§us|Échantillons reçus|Samples received/i)
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect
      .poll(async () => (await sampleCard.textContent()) ?? "")
      .toMatch(/[1-9]\d*\s*pkt/i);

    await page.getByRole("button", { name: /D[ée]connecter l'ESP32|Disconnect ESP32/i }).click();
    await expect(page.getByRole("button", { name: /Connecter l'ESP32|Connect ESP32/i })).toBeVisible();
    await expect(page.getByText(/Aucune session live active|No live session active/i)).toBeVisible();
  });

  test("loads the Web Serial experiment page and reads mocked ESP32 frames", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockEsp32Serial(page);

    await page.goto("/experiment?machine=ASC-C3");
    await expect(page.getByRole("heading", { name: /ESP32/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Connecter.*ESP32/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Recalibrer ACS \(c\)/i })).toBeDisabled();

    await page.getByRole("button", { name: /Connecter.*ESP32/i }).click();
    await expect(page.getByRole("button", { name: /D.*connecter.*ESP32/i })).toBeVisible();
    await expect(page.getByText(/VID 0x10c4/i)).toBeVisible();
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "")
      .toContain("0.342");
    await expect(page.getByText("ALARME", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Recalibrer ACS \(c\)/i })).toBeEnabled();

    await page.getByRole("button", { name: /Recalibrer ACS \(c\)/i }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { __espCommands?: string[] }).__espCommands ?? []),
      )
      .toContain("c\n");

    await page.getByRole("button", { name: /D.*connecter.*ESP32/i }).click();
    await expect(page.getByRole("button", { name: /Connecter.*ESP32/i })).toBeVisible();
  });

  test("loads the remaining admin demo pages without surprises", async ({ page }) => {
    await seedAuth(page, ADMIN_USER, [ADMIN_USER, OPERATOR_USER, REVIEW_USER]);
    await mockMachines(page);
    await mockAlertsData(page);
    await mockCostsAndTasks(page);
    await mockAdminSupportData(page);

    await page.goto("/machines");
    await expect(page).toHaveURL(/\/machines/);
    await expect(page.getByText(/Machine 3/i).first()).toBeVisible();

    await page.goto("/maintenance");
    await expect(page.getByText(/Calendrier des actions validees apres pronostic/i)).toBeVisible();

    await page.goto("/administration");
    await expect(page.getByText(/Gestion des comptes/i)).toBeVisible();
    await expect(page.getByText(/Review PrediTeq/i)).toBeVisible();

    await page.goto("/admin/users");
    await expect(page.getByText(/Comptes actifs/i)).toBeVisible();
    await expect(page.getByText(/Machine 3/i)).toBeVisible();

    await page.goto("/seuils");
    await expect(page.locator('input[value="manager@prediteq.test"]')).toBeVisible();

    await page.goto("/ia?tab=report");
    await expect(page.getByText(/Prediction, decision & rapport IA/i)).toBeVisible();
    await expect(page.getByText(/Rapport ASC-C3/i)).toBeVisible();
  });
});
