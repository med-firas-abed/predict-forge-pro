import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerPage } from "@/components/pages/PlannerPage";

const useAppMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const useFleetPredictiveInsightsMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const createGmaoTacheMock = vi.hoisted(() => vi.fn());
const listGmaoTachesMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/hooks/useFleetPredictiveInsights", () => ({
  useFleetPredictiveInsights: (...args: unknown[]) => useFleetPredictiveInsightsMock(...args),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/lib/runtimeDataRepository", () => ({
  createGmaoTache: (...args: unknown[]) => createGmaoTacheMock(...args),
  listGmaoTaches: (...args: unknown[]) => listGmaoTachesMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    warning: toastWarningMock,
  },
}));

function renderPage(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const machine = {
  id: "ASC-C3",
  name: "Machine 3",
  city: "Sousse",
  hi: 0.12,
  decision: {
    zone: "Critical",
    openTasks: 1,
  },
};

describe("PlannerPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({ lang: "fr" });
    useAuthMock.mockReturnValue({
      currentUser: {
        role: "admin",
        machineId: undefined,
      },
    });
    useMachinesMock.mockReturnValue({
      machines: [machine],
      isLoading: false,
    });
    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [],
    });

    apiFetchMock.mockReset();
    createGmaoTacheMock.mockReset();
    createGmaoTacheMock.mockResolvedValue({ mode: "queued" });
    listGmaoTachesMock.mockReset();
    listGmaoTachesMock.mockResolvedValue([]);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();
  });

  it("keeps already scheduled interventions out of the calendar approval list", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/planner/generate") {
        return Promise.resolve({
          generated_at: "2026-05-14T09:00:00.000Z",
          focus_machine: null,
          markdown: "Synthese backend",
          tasks: [
            {
              machine_code: "ASC-C3",
              titre: "Intervention corrective ASC-C3 - vibration - reprise",
              type: "corrective",
              priorite: "haute",
              date_planifiee: "2026-05-14",
              cout_estime: 480,
              description: "Action: Intervention immediate.",
              technicien: "",
            },
          ],
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
              summary: "Machine critique",
              recommended_action: "Intervention immediate",
              maintenance_window: "Controle terrain prioritaire",
              open_tasks: 1,
              data_source: "live_runtime",
              updated_at: "2026-05-14T09:00:00.000Z",
              is_stale: false,
              plain_reason: "Les indicateurs restent critiques.",
              impact: "Risque d'arret eleve.",
              evidence: ["HI 12 %", "RUL 4 j"],
              field_checks: ["Verifier les roulements."],
              projected_cost: 480,
              delayed_cost: 560,
              delay_penalty: 80,
              task_context:
                "Contexte calendrier: 1 tâche de intervention corrective est déjà ouverte sur cette machine; aucune nouvelle suggestion calendrier n'est émise tant qu'elles ne sont pas clôturées.",
              similar_open_tasks: 1,
              recent_completed_tasks: 2,
              task_suggestion: {
                machine_code: "ASC-C3",
                titre: "Intervention corrective ASC-C3 - vibration - reprise",
                type: "corrective",
                priorite: "haute",
                date_planifiee: "2026-05-14",
                cout_estime: 480,
                description: "Action: Intervention immediate.",
                technicien: "",
              },
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(await screen.findByText("Synthese backend")).toBeInTheDocument();
    expect(screen.getByText(/2 action\(s\) récente\(s\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Contexte calendrier: 1 tâche de intervention corrective est déjà ouverte/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    ).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/1 t.*che\(s\) prete\(s\) a validation/i),
    );
  });

  it("keeps recently completed similar interventions in cooldown instead of reproposing them", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/planner/generate") {
        return Promise.resolve({
          generated_at: "2026-05-14T09:00:00.000Z",
          focus_machine: null,
          markdown: "Synthese backend",
          tasks: [],
          fleet: [
            {
              machine_code: "ASC-B2",
              nom: "Machine 2",
              region: "Sfax",
              hi: 0.54,
              rul_days: 18,
              zone: "Degraded",
              risk_score: 67,
              risk_level: "priority",
              risk_label: "À planifier",
              summary: "Machine prioritaire",
              recommended_action: "Inspection ciblée",
              maintenance_window: "Fenêtre utile sous 48 h",
              open_tasks: 0,
              data_source: "live_runtime",
              updated_at: "2026-05-14T09:00:00.000Z",
              is_stale: false,
              plain_reason: "Les signaux restent présents mais non critiques.",
              impact: "Une reprise trop rapide ferait doublon.",
              evidence: ["HI 54 %", "RUL 18 j"],
              field_checks: ["Vérifier les points de charge."],
              projected_cost: 280,
              delayed_cost: 340,
              delay_penalty: 60,
              task_context:
                "Historique planner: une action similaire a été clôturée le 12/05/2026; le planner attend encore 12 j ou une escalade nette avant de reproposer la même intervention.",
              similar_open_tasks: 0,
              recent_completed_tasks: 1,
              repeat_cooldown_active: true,
              task_suggestion: null,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(await screen.findByText("Synthese backend")).toBeInTheDocument();
    expect(screen.getByText(/cooldown récent actif/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Historique planner: une action similaire a été clôturée le 12\/05\/2026/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    ).not.toBeInTheDocument();
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringMatching(/Aucune nouvelle t.*che à valider/i),
    );
  });

  it("falls back to a local plan without proposing duplicates that are already open", async () => {
    apiFetchMock.mockRejectedValue(new Error("API 502: planner offline"));
    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        {
          machine,
          stressValue: 0.72,
          stressBand: "critical",
          stressLabel: "Critique",
          dominantAxis: "Vibration",
          predictionMode: "prediction",
          rulDays: 6,
          confidence: "high",
          maintenanceWindow: "Contrôle terrain prioritaire",
          topDriver: "Vibration moteur",
          urgencyScore: 88,
          urgencyBand: "critical",
          urgencyLabel: "Urgent",
          urgencyHex: "#f43f5e",
          stopRecommended: true,
          summary: "Machine critique",
          plainReason: "Le risque de défaillance est élevé.",
          impact: "Fenêtre d'action très courte.",
          recommendedAction: "Programmer une reprise rapide.",
          trustNote: "Lecture exploitable",
          evidence: ["HI 12 %", "RUL 6 j", "1 tâche déjà ouverte"],
          fieldChecks: ["Vérifier les roulements et l'alignement."],
            taskTemplate: {
              type: "corrective",
              leadDays: 0,
              cooldownDays: 3,
              title: "Intervention corrective ASC-C3",
              summary: "Contrôle terrain immédiat",
            },
          budgetMultiplier: 1.2,
          delayMultiplier: 1.18,
          dataSource: "live_runtime",
          updatedAt: "2026-05-14T09:00:00.000Z",
          ageSeconds: 12,
          isStale: false,
        },
      ],
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(
      (await screen.findAllByText(
        /Contexte calendrier: 1 tâche\(s\) déjà ouverte\(s\) sur cette machine/i,
      )).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    ).toBeInTheDocument();
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("Service de plan indisponible"),
    );
  });

  it("keeps recent completed same-type tasks in cooldown in the local fallback plan", async () => {
    const cooldownMachine = {
      id: "ASC-B2",
      uuid: "machine-2",
      name: "Machine 2",
      city: "Sfax",
      hi: 0.54,
      anom: 1,
      decision: {
        zone: "Degraded",
        openTasks: 0,
        alerts24h: 1,
        policyContext: {
          scenario: { pressure: 0.42 },
          telemetry: { trustScore: 64 },
        },
      },
    };

    apiFetchMock.mockRejectedValue(new Error("API 502: planner offline"));
    listGmaoTachesMock.mockResolvedValue([
      {
        id: "task-1",
        machineId: "machine-2",
        machineCode: "ASC-B2",
        titre: "Inspection vibratoire ASC-B2",
        description: "",
        statut: "terminee",
        technicien: "",
        datePlanifiee: "2026-05-25",
        coutEstime: 280,
        type: "inspection",
        createdAt: "2026-05-25T09:00:00.000Z",
      },
    ]);
    useMachinesMock.mockReturnValue({
      machines: [cooldownMachine],
      isLoading: false,
    });
    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        {
          machine: cooldownMachine,
          stressValue: 0.45,
          stressBand: "moderate",
          stressLabel: "Modéré",
          dominantAxis: "Vibration",
          predictionMode: "initializing",
          rulDays: null,
          confidence: "medium",
          maintenanceWindow: "Fenêtre utile sous 48 h",
          topDriver: "Vibration moteur",
          urgencyScore: 67,
          urgencyBand: "priority",
          urgencyLabel: "À planifier",
          urgencyHex: "#f59e0b",
          stopRecommended: false,
          summary: "Machine prioritaire",
          plainReason: "Les signaux restent présents mais non critiques.",
          impact: "Une reprise trop rapide ferait doublon.",
          recommendedAction: "Inspection ciblée",
          trustNote: "Lecture prudente",
          evidence: ["HI 54 %", "1 action récente"],
          fieldChecks: ["Vérifier les points de charge."],
          taskTemplate: {
            type: "inspection",
            leadDays: 3,
            cooldownDays: 21,
            title: "Inspection vibratoire ASC-B2",
            summary: "Vérifier les signaux dominants.",
          },
          budgetMultiplier: 1.1,
          delayMultiplier: 1.2,
          dataSource: "live_runtime",
          updatedAt: "2026-05-27T09:00:00.000Z",
          ageSeconds: 12,
          isStale: false,
        },
      ],
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(await screen.findByText(/cooldown récent actif/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Historique planner: une action similaire a été clôturée/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    ).toBeInTheDocument();
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("Service de plan indisponible"),
    );
  });

  it("checks local task history before the GMAO fallback creates a duplicate", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/planner/generate") {
        return Promise.resolve({
          generated_at: "2026-05-14T09:00:00.000Z",
          focus_machine: null,
          markdown: "Synthese backend",
          tasks: [
            {
              machine_code: "ASC-C3",
              titre: "Intervention corrective ASC-C3 - vibration",
              type: "corrective",
              priorite: "haute",
              date_planifiee: "2026-05-14",
              cout_estime: 480,
              description: "Action: Intervention immediate.",
              technicien: "",
            },
          ],
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
              summary: "Machine critique",
              recommended_action: "Intervention immédiate",
              maintenance_window: "Contrôle terrain prioritaire",
              open_tasks: 0,
              data_source: "live_runtime",
              updated_at: "2026-05-14T09:00:00.000Z",
              is_stale: false,
              plain_reason: "Les indicateurs restent critiques.",
              impact: "Risque d'arrêt élevé.",
              evidence: ["HI 12 %", "RUL 4 j"],
              field_checks: ["Vérifier les roulements."],
              projected_cost: 480,
              delayed_cost: 560,
              delay_penalty: 80,
              task_context: null,
              similar_open_tasks: 0,
              recent_completed_tasks: 0,
              task_suggestion: {
                machine_code: "ASC-C3",
                titre: "Intervention corrective ASC-C3 - vibration",
                type: "corrective",
                priorite: "haute",
                date_planifiee: "2026-05-14",
                cout_estime: 480,
                description: "Action: Intervention immediate.",
                technicien: "",
              },
            },
          ],
        });
      }

      if (path === "/planner/approve") {
        return Promise.reject(new Error("API 503: planner approve unavailable"));
      }

      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });
    listGmaoTachesMock.mockResolvedValue([
      {
        id: "task-open-1",
        machineId: "machine-3",
        machineCode: "ASC-C3",
        titre: "Intervention corrective ASC-C3 - vibration",
        description: "",
        statut: "planifiee",
        technicien: "",
        datePlanifiee: "2026-05-14",
        coutEstime: 480,
        type: "corrective",
        createdAt: "2026-05-14T09:00:00.000Z",
      },
    ]);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(
      await screen.findByText(/Intervention corrective Machine 3 - vibration/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    );

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        expect.stringMatching(/gardée localement et prête à être synchronisée/i),
      );
    });

    expect(createGmaoTacheMock).toHaveBeenCalled();
  });

  it("does not fall back to direct task creation when approval is rejected as a duplicate", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/planner/generate") {
        return Promise.resolve({
          generated_at: "2026-05-14T09:00:00.000Z",
          focus_machine: null,
          markdown: "Synthese backend",
          tasks: [
            {
              machine_code: "ASC-C3",
              titre: "Intervention corrective ASC-C3 - vibration",
              type: "corrective",
              priorite: "haute",
              date_planifiee: "2026-05-14",
              cout_estime: 480,
              description: "Action: Intervention immediate.",
              technicien: "",
            },
          ],
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
              summary: "Machine critique",
              recommended_action: "Intervention immédiate",
              maintenance_window: "Contrôle terrain prioritaire",
              open_tasks: 0,
              data_source: "live_runtime",
              updated_at: "2026-05-14T09:00:00.000Z",
              is_stale: false,
              plain_reason: "Les indicateurs restent critiques.",
              impact: "Risque d'arrêt élevé.",
              evidence: ["HI 12 %", "RUL 4 j"],
              field_checks: ["Vérifier les roulements."],
              projected_cost: 480,
              delayed_cost: 560,
              delay_penalty: 80,
              task_context: null,
              similar_open_tasks: 0,
              recent_completed_tasks: 0,
              task_suggestion: {
                machine_code: "ASC-C3",
                titre: "Intervention corrective ASC-C3 - vibration",
                type: "corrective",
                priorite: "haute",
                date_planifiee: "2026-05-14",
                cout_estime: 480,
                description: "Action: Intervention immediate.",
                technicien: "",
              },
            },
          ],
        });
      }

      if (path === "/planner/approve") {
        return Promise.reject(
          new Error(
            "API 409: Une tâche ouverte de intervention corrective existe déjà dans le calendrier pour Machine 3.",
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /preparer les actions/i }));

    expect(
      await screen.findByText(/Intervention corrective Machine 3 - vibration/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    );

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        expect.stringMatching(/dans le calendrier/i),
      );
    });

    expect(createGmaoTacheMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /valider et cr(?:e|\u00e9)er dans le calendrier/i }),
    ).toBeInTheDocument();
  });
});
