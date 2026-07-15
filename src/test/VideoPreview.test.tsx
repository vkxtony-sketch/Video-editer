import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VideoPreview from "../components/studio/VideoPreview";

describe("VideoPreview", () => {
  it("renders an iframe when given a YouTube URL", () => {
    render(
      <VideoPreview
        videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        durationSec={600}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toMatch(
      /youtube\.com\/embed\/dQw4w9WgXcQ/,
    );
  });

  it("renders the canvas placeholder when no videoUrl is given", () => {
    render(
      <VideoPreview
        durationSec={600}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/AUDIO STREAM READY/i)).toBeInTheDocument();
  });

  it("renders progress percent badge during processing", () => {
    render(
      <VideoPreview
        durationSec={600}
        progress={47}
        activeStage="Scoring"
        status="processing"
        scrubToSec={null}
      />,
    );
    // 47% shows up both in the corner badge and the audio waveform caption.
    expect(screen.getAllByText(/47%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Scoring/i).length).toBeGreaterThanOrEqual(1);
  });
});
