import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";

function renderApp(children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppLayout>{children}</AppLayout>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it("renders the Neon AI Lab brand", () => {
    renderApp(<div />);
    expect(screen.getAllByText(/Neon AI Lab/i).length).toBeGreaterThan(0);
  });

  it("renders the demo badge", () => {
    renderApp(<div />);
    expect(screen.getByText(/Demo Mode/i)).toBeInTheDocument();
  });

  it("shows a Studio link", () => {
    renderApp(<div />);
    const links = screen.getAllByRole("link", { name: /Studio/i });
    expect(links.length).toBeGreaterThan(0);
  });
});
