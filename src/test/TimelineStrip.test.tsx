import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimelineStrip, { TimelineClip } from "../components/studio/TimelineStrip";

const clips: TimelineClip[] = [
  {
    _id: "c_1" as any,
    kind: "highlight",
    title: "Hook moment",
    startSec: 7200,
    endSec: 7500,
    score: 0.91,
    tags: ["viral-hook"],
  },
  {
    _id: "c_2" as any,
    kind: "short",
    title: "Watch this part",
    startSec: 18000,
    endSec: 18060,
    score: 0.78,
    tags: ["vertical"],
  },
  {
    _id: "c_3" as any,
    kind: "cut",
    title: "Dead air",
    startSec: 3600,
    endSec: 3606,
    score: 0.2,
    tags: ["auto-cut"],
  },
];

describe("TimelineStrip", () => {
  it("renders the Timeline header + total duration label", () => {
    render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    expect(screen.getByText(/Timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/12:00:00/)).toBeInTheDocument();
  });

  it("renders clip titles in the overlay bars", () => {
    const { container } = render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    expect(screen.getByTitle("Hook moment")).toBeInTheDocument();
    expect(screen.getByTitle("Watch this part")).toBeInTheDocument();
  });

  it("clicking a clip overlay fires onScrub at the clip's midpoint", () => {
    const onScrub = vi.fn();
    render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={null}
        onScrub={onScrub}
      />,
    );
    fireEvent.click(screen.getByTitle("Hook moment"));
    // Mid of 7200..7500 = 7350
    expect(onScrub).toHaveBeenCalled();
    const arg = onScrub.mock.calls[0][0] as number;
    expect(Math.abs(arg - 7350)).toBeLessThan(10);
  });

  it("renders the playhead at the right percent when scrubToSec is set", () => {
    const { container } = render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={6 * 3600}
        onScrub={() => {}}
      />,
    );
    const playhead = container.querySelector('[style*="left: 50%"]');
    expect(playhead).toBeTruthy();
  });

  it("renders dashed vertical markers when sceneMarks are provided", () => {
    const { container } = render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        sceneMarks={[
          { tSec: 2 * 3600, distance: 22 },
          { tSec: 7 * 3600, distance: 30 },
        ]}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    const markers = container.querySelectorAll('[data-testid="scene-marker"]');
    expect(markers.length).toBe(2);
  });

  it("pulses the playhead when isPlaying=true", () => {
    const { container } = render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={6 * 3600}
        isPlaying
        onScrub={() => {}}
      />,
    );
    const playhead = container.querySelector('[data-testid="timeline-playhead"]');
    expect(playhead).toBeTruthy();
    expect(playhead?.className).toMatch(/animate-pulse-soft/);
  });

  it("does NOT pulse the playhead when isPlaying is omitted", () => {
    const { container } = render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={clips}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    const playhead = container.querySelector('[data-testid="timeline-playhead"]');
    expect(playhead).toBeTruthy();
    expect(playhead?.className).not.toMatch(/animate-pulse-soft/);
  });
});
