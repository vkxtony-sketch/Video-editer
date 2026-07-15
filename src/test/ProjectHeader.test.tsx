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

  it("renders the Real LLM narrative badge when llmMode is 'real'", () => {
    renderHeader({ llmMode: "real", llmProvider: "groq · llama-3.1-8b-instant" });
    expect(screen.getByTestId("badge-llm-real")).toBeInTheDocument();
    expect(screen.getByTestId("badge-llm-real")).toHaveTextContent(/groq/);
  });

  it("renders the fixture-mode badge when llmProvider contains 'fixture'", () => {
    renderHeader({ llmMode: "real", llmProvider: "groq · fixture (no API call)" });
    expect(screen.getByTestId("badge-llm-fixture")).toBeInTheDocument();
    expect(screen.getByTestId("badge-llm-fixture")).toHaveTextContent(/GROQ_DEMO_MODE/);
    expect(screen.queryByTestId("badge-llm-real")).toBeNull();
  });

  it("renders the deterministic fallback badge when llmMode is 'deterministic'", () => {
    renderHeader({ llmMode: "deterministic" });
    expect(screen.getByTestId("badge-llm-deterministic")).toBeInTheDocument();
    expect(screen.getByTestId("badge-llm-deterministic")).toHaveTextContent(
      /GROQ_API_KEY/,
    );
  });

  it("omits the LLM badge when llmMode is not provided", () => {
    renderHeader({});
    expect(screen.queryByTestId("badge-llm-real")).toBeNull();
    expect(screen.queryByTestId("badge-llm-deterministic")).toBeNull();
    expect(screen.queryByTestId("badge-llm-fixture")).toBeNull();
  });
});
