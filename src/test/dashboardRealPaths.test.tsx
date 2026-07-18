import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import Dashboard from "../pages/Dashboard";
import { convexMock } from "./convexMock";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AppLayout>
        <Dashboard />
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("Dashboard — real editing paths UX", () => {
  it("renders a 'Try with sample' button on the dashboard header", () => {
    convexMock.query("projects:list", []);
    renderDashboard();
    expect(screen.getByTestId("try-with-sample")).toBeInTheDocument();
  });

  it("renders the source-picker buttons with captions that distinguish real vs mock", async () => {
    convexMock.query("projects:list", []);
    renderDashboard();
    const trigger = screen.getByText(/New project/i);
    await userEvent.click(trigger);
    const demo = screen.getByTestId("source-demo");
    const url = screen.getByTestId("source-url");
    const upload = screen.getByTestId("source-upload");
    expect(demo).toBeInTheDocument();
    expect(url).toBeInTheDocument();
    expect(upload).toBeInTheDocument();
    // Demo must say it's a mock so users don't mistake it for a real option.
    expect(demo.textContent ?? "").toMatch(/Mock/i);
    // URL and Upload must both say "real analysis" so users can see they're equivalent.
    expect(url.textContent ?? "").toMatch(/real analysis/i);
    expect(upload.textContent ?? "").toMatch(/real/i);
  });

  it("renders the 'Real upload' badge for upload-source cards", () => {
    convexMock.query("projects:list", [
      {
        _id: "p_up1",
        title: "Real upload demo",
        durationSec: 60 * 60,
        status: "ready" as const,
        progress: 100,
        source: "upload" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test",
        coverThumb: null,
      },
    ]);
    renderDashboard();
    expect(screen.getAllByText(/Real upload/i).length).toBeGreaterThan(0);
  });

  it("renders 'Real URL' badge for url-source cards and 'Real sample' for sample cards", () => {
    convexMock.query("projects:list", [
      {
        _id: "p_url1",
        title: "URL ingest demo",
        durationSec: 90,
        status: "ready" as const,
        progress: 100,
        source: "url" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test",
        coverThumb: null,
      },
      {
        _id: "p_sm1",
        title: "Sample tutorial",
        durationSec: 30,
        status: "ready" as const,
        progress: 100,
        source: "sample" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test",
        coverThumb: null,
      },
    ]);
    renderDashboard();
    expect(screen.getAllByText(/Real URL/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Real sample/i).length).toBeGreaterThan(0);
  });
});
