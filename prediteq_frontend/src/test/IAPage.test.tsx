import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IAPage } from "@/components/pages/IAPage";

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@/components/pages/PlannerPage", () => ({
  PlannerPage: () => <div>Planner page</div>,
}));

vi.mock("@/components/pages/RapportIAPage", () => ({
  RapportIAPage: () => <div>Report page</div>,
}));

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <IAPage />
    </MemoryRouter>,
  );
}

describe("IAPage", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({ lang: "fr" });
  });

  it("shows the planner view when opening /planner", () => {
    renderPage("/planner");

    expect(screen.getByText("Plan d'action")).toBeInTheDocument();
    expect(screen.getByText("Planner page")).toBeInTheDocument();
    expect(screen.queryByText("Report page")).not.toBeInTheDocument();
  });

  it("keeps the report view available", () => {
    renderPage("/ia?tab=report");

    expect(screen.getByText("Rapports")).toBeInTheDocument();
    expect(screen.getByText("Report page")).toBeInTheDocument();
    expect(screen.queryByText("Planner page")).not.toBeInTheDocument();
  });
});
