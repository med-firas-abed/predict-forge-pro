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
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();
  });

  it("uses backend planner output and approves repeated interventions into the calendar", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

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
              description:
                "Action: Intervention immediate. Etat: HI 12%, RUL 4 j. Contexte calendrier: 1 tache deja ouverte.",
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
                "Contexte calendrier: 1 tache de intervention corrective est deja ouverte sur cette machine.",
              similar_open_tasks: 1,
              recent_completed_tasks: 2,
              task_suggestion: {
                machine_code: "ASC-C3",
                titre: "Intervention corrective ASC-C3 - vibration - reprise",
                type: "corrective",
                priorite: "haute",
                date_planifiee: "2026-05-14",
                cout_estime: 480,
                description:
                  "Action: Intervention immediate. Etat: HI 12%, RUL 4 j. Contexte calendrier: 1 tache deja ouverte.",
                technicien: "",
              },
            },
          ],
        });
      }

      if (path === "/planner/approve") {
        return Promise.resolve({
          status: "ok",
          machine_code: "ASC-C3",
          repeat_note:
            "Relance planner autorisee: 1 tache au meme titre est deja ouverte; la nouvelle insertion reste permise.",
        });
      }

      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    renderPage(queryClient);

    fireEvent.click(screen.getByRole("button", { name: /lancer le plan d'action/i }));

    expect(await screen.findByText("Synthese backend")).toBeInTheDocument();
    expect(
      screen.getByText(/Intervention corrective ASC-C3 - vibration - reprise/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 relance\(s\) ouverte\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2 action\(s\) recente\(s\)/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /valider et cr(?:e|é)er dans le calendrier/i }),
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });

    const approveCall = apiFetchMock.mock.calls[1];
    expect(approveCall[0]).toBe("/planner/approve");
    expect(JSON.parse((approveCall[1] as { body: string }).body)).toMatchObject({
      machine_code: "ASC-C3",
      titre: "Intervention corrective ASC-C3 - vibration - reprise",
      type: "corrective",
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /valider et cr(?:e|é)er dans le calendrier/i }),
      ).not.toBeInTheDocument();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["gmao_taches"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["machines"] });
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("Relance planner autorisee"),
    );
  });

  it("falls back to a local dynamic plan when backend generation fails", async () => {
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
          maintenanceWindow: "Controle terrain prioritaire",
          topDriver: "Vibration moteur",
          urgencyScore: 88,
          urgencyBand: "critical",
          urgencyLabel: "Urgent",
          urgencyHex: "#f43f5e",
          stopRecommended: true,
          summary: "Machine critique",
          plainReason: "Le risque de defaillance est eleve.",
          impact: "Fenetre d'action tres courte.",
          recommendedAction: "Programmer une reprise rapide.",
          trustNote: "Lecture exploitable",
          evidence: ["HI 12 %", "RUL 6 j", "1 tache deja ouverte"],
          fieldChecks: ["Verifier les roulements et l'alignement."],
          taskTemplate: {
            type: "corrective",
            leadDays: 0,
            title: "Intervention corrective ASC-C3",
            summary: "Controle terrain immediat",
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

    fireEvent.click(screen.getByRole("button", { name: /lancer le plan d'action/i }));

    expect(
      await screen.findByText(/Intervention corrective ASC-C3 - Vibration moteur - RUL 6 j - reprise/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Contexte calendrier: 1 tache\(s\) deja ouverte\(s\) sur cette machine/i).length,
    ).toBeGreaterThan(0);
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("Plan backend indisponible"),
    );
  });
});
