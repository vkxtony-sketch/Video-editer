import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import Studio from "../pages/Studio";
import { convexMock, calls } from "./convexMock";

function makeProject(
  overrides: Partial<{
    status: "queued" | "processing" | "ready" | "failed";
    progress: number;
    title: string;
    durationSec: number;
    persona: string;
    summary: string;
  }> = {},
) {
  return {
    _id: "p_xyz789",
    _creationTime: Date.now(),
    title: overrides.title ?? "Test Project",
    durationSec: overrides.durationSec ?? 12 * 3600,
    status: overrides.status ?? "queued",
    progress: overrides.progress ?? 0,
    summary: overrides.summary,
    persona: overrides.persona ?? "long-form broadcast",
    ownerId: "u_test_session",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "demo" as const,
  };
}

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={["/studio/p_xyz789"]}>
      <Routes>
        <Route
          path="/studio/:id"
          element={
            <AppLayout>
              <Studio />
            </AppLayout>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function primeProjectMocks(p: ReturnType<typeof makeProject>) {
  // Module:function API paths (e.g. "queries:listLogs" -> "queries.listLogs"
  // after our pathKey normalisation in setup.ts).
  convexMock.query("projects:get", p);
  convexMock.query("queries:listLogs", []);
  convexMock.query("queries:listClips", []);
  convexMock.query("queries:listTitles", []);
  convexMock.query("queries:listThumbnails", []);
  convexMock.query("queries:listCaptions", []);
}

describe("Studio", () => {
  it("calls runPipeline action once when status is 'queued'", async () => {
    primeProjectMocks(makeProject({ status: "queued" }));
    convexMock.query("queries:latestRun", { _id: "r1" as any, activeStage: "Ingest" });
    convexMock.action("pipeline:runPipeline", undefined);
    renderStudio();
    await waitFor(() => {
      const runs = calls.action.filter((c: { apiKey: string }) => c.apiKey === "pipeline.runPipeline");
      expect(runs.length).toBe(1);
    });
    expect((calls.action[0].args as { projectId: string }).projectId).toBe("p_xyz789");
  });

  it("does NOT call runPipeline when status is 'ready'", async () => {
    primeProjectMocks(makeProject({ status: "ready", progress: 100 }));
    convexMock.query("queries:latestRun", null);
    renderStudio();
    await new Promise((r) => setTimeout(r, 30));
    expect(
      calls.action.filter((c: { apiKey: string }) => c.apiKey === "pipeline.runPipeline").length,
    ).toBe(0);
  });

  it("displays title and progress", () => {
    primeProjectMocks(makeProject({ status: "processing", progress: 42 }));
    convexMock.query("queries:latestRun", null);
    renderStudio();
    expect(screen.getByText("Test Project")).toBeInTheDocument();
    // progress digits -> "42%" appears in the ProjectHeader's progress label
    // AND in the VideoPreview's processing badge, so use getAllByText.
    expect(screen.getAllByText(/42%/).length).toBeGreaterThanOrEqual(1);
  });
});
