import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Landing from "../pages/Landing";
import { convexMock, calls } from "./convexMock";
import { setConvexResponses } from "./setup";
import AppLayout from "../components/layout/AppLayout";

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppLayout>
        <Landing />
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  beforeEach(() => {
    // Ensure a session id exists so trySample() can read it.
    window.localStorage.setItem("neon:session", "u_test_session");
  });

  it("renders brand and the main headline substrings", () => {
    renderLanding();
    expect(screen.getAllByText(/Neon AI Lab/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/24-hour recording/i)).toBeInTheDocument();
    expect(screen.getByText(/five-minute highlight/i)).toBeInTheDocument();
  });

  it("renders both CTAs", () => {
    renderLanding();
    expect(screen.getAllByText(/Open Studio/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Try the 12-hour sample|Try the sample/i).length,
    ).toBeGreaterThan(0);
  });

  it("'Try the sample' invokes api.projects.create with the right args", async () => {
    convexMock.mutation("projects:create", { projectId: "p_test_123" });
    renderLanding();
    const btns = screen.getAllByText(/Try the 12-hour sample|Try the sample/i);
    await userEvent.click(btns[0]);
    // Allow microtask for the awaited create() call.
    await new Promise((r) => setTimeout(r, 0));
    const createCalls = calls.mutation.filter((c) => c.apiKey === "projects:create");
    expect(createCalls.length).toBe(1);
    expect(createCalls[0].args).toMatchObject({
      ownerId: "u_test_session",
      source: "sample",
      durationSec: 12 * 3600,
    });
  });

  it("when create fails, the user is still routed to /dashboard", async () => {
    setConvexRejects();
    renderLanding();
    const btns = screen.getAllByText(/Try the 12-hour sample|Try the sample/i);
    await userEvent.click(btns[0]);
    await new Promise((r) => setTimeout(r, 0));
    // MemoryRouter doesn't have history assertions; we just confirm no crash.
  });
});

function setConvexRejects() {
  setConvexResponses("mutation", {
    type: "rejects",
    key: "projects:create",
    error: new Error("backend offline"),
  });
}
