import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../pages/Dashboard";
import AppLayout from "../components/layout/AppLayout";
import { convexMock, calls } from "./convexMock";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AppLayout>
        <Dashboard />
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  it("renders the New project trigger", () => {
    renderDashboard();
    expect(screen.getByText(/New project/i)).toBeInTheDocument();
  });

  it("shows the empty state when projects list returns []", () => {
    convexMock.query("projects:list", []);
    renderDashboard();
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });

  it("renders a project card when projects list returns 1 project", () => {
    convexMock.query("projects:list", [
      {
        _id: "p_abc123",
        title: "Sunday stream",
        durationSec: 12 * 3600,
        status: "ready" as const,
        progress: 100,
        summary: "12-hour recording · 12 highlights · 8 shorts",
        persona: "long-form broadcast",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test_session",
        coverThumb: null,
      },
    ]);
    renderDashboard();
    expect(screen.getByText("Sunday stream")).toBeInTheDocument();
    expect(screen.getByText(/12:00:00/)).toBeInTheDocument();
    expect(screen.getByText(/12\s+highlights/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
  });

  it("renders a real-frame cover when coverThumb is provided", () => {
    convexMock.query("projects:list", [
      {
        _id: "p_cover1",
        title: "Vlog daily",
        durationSec: 60 * 60,
        status: "ready" as const,
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test_session",
        coverThumb: {
          headline: "Peak at 0:04:32",
          // 1×1 transparent PNG so jsdom doesn't complain
          imageDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      },
    ]);
    renderDashboard();
    const cover = screen.getByTestId("project-cover");
    expect(cover).toBeInTheDocument();
    expect(cover.tagName).toBe("IMG");
    expect((cover as HTMLImageElement).src).toContain("data:image/png");
    expect(screen.getByText(/Real frame/i)).toBeInTheDocument();
  });

  it("omits the cover image but still renders the card when coverThumb is null", () => {
    convexMock.query("projects:list", [
      {
        _id: "p_nocover",
        title: "Demo source",
        durationSec: 12 * 3600,
        status: "ready" as const,
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test_session",
        coverThumb: null,
      },
    ]);
    renderDashboard();
    expect(screen.queryByTestId("project-cover")).toBeNull();
    expect(screen.getByText("Demo source")).toBeInTheDocument();
  });

  it("clicking Delete calls api.projects.remove with the project id", async () => {
    convexMock.query("projects:list", [
      {
        _id: "p_xyz789",
        title: "Studio dispatch",
        durationSec: 60 * 60,
        status: "ready" as const,
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "u_test_session",
      },
    ]);
    convexMock.mutation("projects:remove", undefined);
    renderDashboard();
    const del = screen.getByText(/Delete/i);
    await userEvent.click(del);
    await new Promise((r) => setTimeout(r, 0));
    const removes = calls.mutation.filter((c: { apiKey: string }) => c.apiKey === "projects.remove");
    expect(removes.length).toBe(1);
    expect((removes[0].args as { id: string }).id).toBe("p_xyz789");
  });
});
