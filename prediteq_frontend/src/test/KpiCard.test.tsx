import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard, TrendBadge } from "@/components/industrial/KpiCard";

function Icon() {
  return <svg data-testid="kpi-icon" />;
}

describe("KpiCard", () => {
  const baseProps = {
    icon: <Icon />,
    label: "Health Index",
    value: "87%",
    sub: "Dernière mise à jour il y a 5 min",
    variant: "green" as const,
  };

  it("renders label, value and sub text", () => {
    render(<KpiCard {...baseProps} />);
    expect(screen.getByText("Health Index")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("Dernière mise à jour il y a 5 min")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<KpiCard {...baseProps} />);
    expect(screen.getByTestId("kpi-icon")).toBeInTheDocument();
  });

  it("applies variant-specific accent class on value", () => {
    const { container } = render(<KpiCard {...baseProps} variant="danger" />);
    const valueEl = container.querySelector(".kpi-value");
    expect(valueEl).toHaveClass("text-destructive");
  });

  it("renders trend badge when provided", () => {
    render(
      <KpiCard {...baseProps} trend={<TrendBadge variant="up">+2%</TrendBadge>} />
    );
    expect(screen.getByText("+2%")).toBeInTheDocument();
  });

  it("does not render trend when omitted", () => {
    const { container } = render(<KpiCard {...baseProps} />);
    // The trend wrapper only appears conditionally
    const trendWrappers = container.querySelectorAll(".absolute.top-4.right-4");
    expect(trendWrappers.length).toBe(0);
  });

  it("renders children slot", () => {
    render(
      <KpiCard {...baseProps}>
        <div data-testid="child">Extra content</div>
      </KpiCard>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it.each(["blue", "green", "warn", "danger"] as const)(
    "renders with %s variant without crashing",
    (variant) => {
      const { container } = render(<KpiCard {...baseProps} variant={variant} />);
      expect(container.firstChild).toBeTruthy();
    }
  );
});

describe("TrendBadge", () => {
  it("renders children text", () => {
    render(<TrendBadge variant="up">+5.2%</TrendBadge>);
    expect(screen.getByText("+5.2%")).toBeInTheDocument();
  });

  it("applies success color for 'up' variant", () => {
    const { container } = render(<TrendBadge variant="up">+1%</TrendBadge>);
    expect(container.firstChild).toHaveClass("text-success");
  });

  it("applies destructive color for 'down' variant", () => {
    const { container } = render(<TrendBadge variant="down">-3%</TrendBadge>);
    expect(container.firstChild).toHaveClass("text-destructive");
  });
});
