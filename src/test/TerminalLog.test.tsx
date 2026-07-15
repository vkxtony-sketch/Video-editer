import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TerminalLog, { LogLine } from "../components/studio/TerminalLog";

const logs: LogLine[] = [
  { _id: "l1", stage: "ingest", level: "info", message: "▶ Ingest starting", ts: 1_700_000_000_000 },
  { _id: "l2", stage: "scan", level: "ok", message: "✓ Scan complete", ts: 1_700_000_010_000 },
  { _id: "l3", stage: "transcribe", level: "warn", message: "! Low audio", ts: 1_700_000_020_000 },
];

describe("TerminalLog", () => {
  it("renders each log line", () => {
    render(<TerminalLog logs={logs} activeStage="Scoring" />);
    expect(screen.getByText(/Ingest starting/i)).toBeInTheDocument();
    expect(screen.getByText(/Scan complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Low audio/i)).toBeInTheDocument();
  });

  it("applies the cyan highlight class to the latest line", () => {
    render(<TerminalLog logs={logs} activeStage="Scoring" />);
    const latest = screen.getByText(/Low audio/i).closest("li");
    expect(latest?.className).toMatch(/text-glow-cyan/);
  });

  it("shows 'Idle' when activeStage is empty and 0 entries", () => {
    render(<TerminalLog logs={[]} activeStage="" />);
    expect(screen.getAllByText(/Idle/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Awaiting first stage/i)).toBeInTheDocument();
  });
});
