import { MemoryRouter } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Render a component inside the production chrome (AppLayout) and a
 * MemoryRouter so useNavigate/useParams resolve correctly in tests.
 */
export function renderWithApp(
  ui: ReactElement,
  initialEntries: string[] = ["/"],
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppLayout>{ui}</AppLayout>
    </MemoryRouter>,
  );
}

export { renderWithApp as render };

export type { RenderOptions };
