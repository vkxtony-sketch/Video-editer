import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProjectHeader from "../components/studio/ProjectHeader";

describe("ProjectHeader", () => {
  function renderHeader(props: Partial<Parameters<typeof ProjectHeader>[0]> = {}) {
    return render(
      <MemoryRouter>
        <ProjectHeader
          title="Monday stream"
          durationSec={12 * 3600}
          status="ready"
          progress={100}
          activeStage="Idle"
          demoMode={true}
          onRerun={vi.fn()}
          onReset={vi.fn()}
          {...props}
        />
      </MemoryRouter>,
    );
  }

  it("renders title, duration, and demo badge", () => {
    renderHeader();
    expect(screen.getByText("Monday stream")).toBeInTheDocument();
    expect(screen.getByText(/12:00:00/)).toBeInTheDocument();
    expect(screen.getByText(/simulated pipeline/i)).toBeInTheDocument();
  });

  it("Re-run button invokes onRerun", async () => {
    const onRerun = vi.fn();
    renderHeader({ onRerun });
    await userEvent.click(screen.getByRole("button", { name: /Re-run/i }));
    expect(onRerun).toHaveBeenCalled();
  });

  it("Reset button invokes onReset", async () => {
    const onReset = vi.fn();
    renderHeader({ onReset });
    await userEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it("Export button is disabled until status is ready", () => {
    renderHeader({ status: "processing", progress: 50 });
    const exp = screen.getByRole("button", { name: /Export/i });
    expect(exp).toBeDisabled();
  });
});
