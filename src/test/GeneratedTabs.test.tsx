import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GeneratedTabs from "../components/studio/GeneratedTabs";

const titles = [
  { _id: "t1" as any, label: "YouTube Title", body: "I tried this for 30 days", score: 0.91, style: "plain" },
];
const thumbnails = [
  { _id: "th1" as any, headline: "It actually works.", subtext: "and here's the receipts", palette: "cyan-magenta", score: 0.82 },
];
const captions = [
  { _id: "cap1" as any, startSec: 60, endSec: 64, speaker: "Speaker A", text: "Hello world", sentiment: "calm" },
];

describe("GeneratedTabs", () => {
  it("defaults to the Titles tab and renders titles", () => {
    render(<GeneratedTabs titles={titles} thumbnails={thumbnails} captions={captions} />);
    expect(screen.getByText(/I tried this for 30 days/i)).toBeInTheDocument();
  });

  it("clicking Thumbs shows thumbnails", async () => {
    render(<GeneratedTabs titles={titles} thumbnails={thumbnails} captions={captions} />);
    await userEvent.click(screen.getByRole("tab", { name: /Thumbs/ }));
    expect(screen.getByText(/It actually works/i)).toBeInTheDocument();
  });

  it("clicking Captions shows captions", async () => {
    render(<GeneratedTabs titles={titles} thumbnails={thumbnails} captions={captions} />);
    await userEvent.click(screen.getByRole("tab", { name: /Captions/ }));
    expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
  });
});
