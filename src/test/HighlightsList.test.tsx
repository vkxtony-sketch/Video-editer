import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HighlightsList, { HighlightItem } from "../components/studio/HighlightsList";

const items: HighlightItem[] = [
  { _id: "h1" as any, kind: "highlight", title: "Big reveal", startSec: 100, endSec: 200, score: 0.6, rationale: "Strong moment", tags: ["viral"] },
  { _id: "h2" as any, kind: "short", title: "Vertical clip", startSec: 300, endSec: 360, score: 0.6, rationale: "Vertical", tags: ["vertical"] },
  { _id: "h3" as any, kind: "highlight", title: "Higher score moment", startSec: 400, endSec: 500, score: 0.92, rationale: "Top", tags: ["viral"] },
];

describe("HighlightsList", () => {
  it("renders sorted: shorts first, then highlights by score desc", () => {
    render(
      <HighlightsList
        items={items}
        activeId={null}
        onSelect={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const titles = buttons.map((b) => b.textContent || "");
    // First card should be the short (Vertical clip)
    expect(titles[0]).toMatch(/Vertical clip/);
    // Then Higher score moment before Big reveal
    const hsIdx = titles.findIndex((t) => /Higher score/.test(t));
    const brIdx = titles.findIndex((t) => /Big reveal/.test(t));
    expect(hsIdx).toBeLessThan(brIdx);
  });

  it("clicking a card calls onSelect with that item", () => {
    const onSelect = vi.fn();
    render(
      <HighlightsList
        items={items}
        activeId={null}
        onSelect={onSelect}
      />,
    );
    const buttons = screen.getAllByRole("button");
    // find the Higher score card
    const target = buttons.find((b) => /Higher score moment/.test(b.textContent || ""));
    expect(target).toBeDefined();
    fireEvent.click(target!);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "h3", title: "Higher score moment" }),
    );
  });

  it("renders an empty placeholder when items=[]", () => {
    render(<HighlightsList items={[]} activeId={null} onSelect={() => {}} />);
    expect(screen.getByText(/Clips appear here/i)).toBeInTheDocument();
  });
});
