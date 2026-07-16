import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProjectHeader from "../components/studio/ProjectHeader";
import type { RenderPreset } from "../lib/useLocalStorage";

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
    expect(screen.getByTestId("badge-llm-real")).toHaveTextContent(/Groq/);
  });

  it("renders the EXACT badge text 'Real LLM narrative · Groq · llama-3.1-8b-instant' when wired to a real Groq key", () => {
    // This is the user's success criterion: paste GROQ_API_KEY → Studio
    // header shows this exact label.
    renderHeader({ llmMode: "real", llmProvider: "groq · llama-3.1-8b-instant" });
    const badge = screen.getByTestId("badge-llm-real");
    expect(badge).toHaveTextContent("Real LLM narrative · Groq · llama-3.1-8b-instant");
    // Negative assertions: the other two variants must NOT be rendered.
    expect(screen.queryByTestId("badge-llm-fixture")).toBeNull();
    expect(screen.queryByTestId("badge-llm-deterministic")).toBeNull();
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

  describe("preset legend", () => {
    it("renders legend beneath the PresetPicker when clipCount + totalSec are provided", () => {
      renderHeader({
        preset: "ultrafast",
        onPresetChange: vi.fn(),
        clipCount: 12,
        totalSec: 72,
      });
      const legend = screen.getByTestId("preset-legend");
      expect(legend).toBeInTheDocument();
      // 5 Mbps × 72s ÷ 8 → 45.0 MB; encode @ 0.25× = 18s
      expect(legend).toHaveTextContent("12 clips");
      expect(legend).toHaveTextContent("~6s avg");
      expect(legend).toHaveTextContent("45.0 MB");
      expect(legend).toHaveTextContent("18s encode");
      expect(legend).toHaveTextContent("(est. 720p30)");
    });

    it("renders the dash placeholder when clipCount is 0", () => {
      renderHeader({
        preset: "ultrafast",
        onPresetChange: vi.fn(),
        clipCount: 0,
        totalSec: 0,
      });
      expect(screen.getByTestId("preset-legend")).toHaveTextContent("—");
    });

    it("renders medium-preset numbers (smaller file, longer encode) in the legend", () => {
      renderHeader({
        preset: "medium",
        onPresetChange: vi.fn(),
        clipCount: 12,
        totalSec: 72,
      });
      // medium: 1.5 Mbps × 72s ÷ 8 = 13.5 MB; encode @ 2.5× = 180s = 3 min
      const legend = screen.getByTestId("preset-legend");
      expect(legend).toHaveTextContent("13.5 MB");
      expect(legend).toHaveTextContent("3 min encode");
    });

    it("reacts to preset change by re-rendering the legend", async () => {
      const user = userEvent.setup();
      function Wrapper() {
        const [p, setP] = useState<RenderPreset>("ultrafast");
        return (
          <ProjectHeader
            title="t"
            durationSec={3600}
            status="ready"
            progress={100}
            activeStage="Idle"
            demoMode={true}
            onRerun={vi.fn()}
            onReset={vi.fn()}
            preset={p}
            onPresetChange={setP}
            clipCount={12}
            totalSec={72}
          />
        );
      }
      render(
        <MemoryRouter>
          <Wrapper />
        </MemoryRouter>,
      );
      // Open the picker → click "Smallest file" = medium → legend should flip
      await user.click(screen.getByRole("button", { name: /Fastest/i }));
      await user.click(screen.getByRole("option", { name: /Smallest file/i }));
      const legend = screen.getByTestId("preset-legend");
      expect(legend).toHaveTextContent("13.5 MB");
      expect(legend).toHaveTextContent("3 min encode");
    });
  });
});
