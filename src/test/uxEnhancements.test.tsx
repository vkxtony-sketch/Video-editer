import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import Studio from "../pages/Studio";
import TimelineStrip from "../components/studio/TimelineStrip";
import VideoPreview from "../components/studio/VideoPreview";
import { convexMock, calls } from "./convexMock";

/**
 * jsdom reports getBoundingClientRect with all zero widths. Stub it so the
 * hover-scrub tooltip math (rect.width > 0 check) has something to work
 * against. We restore the original after the suite.
 */
const originalGetRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    const w = (this as HTMLElement).clientWidth || 800;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: w,
      bottom: 100,
      width: w,
      height: 100,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetRect;
});

describe("TimelineStrip hover-scrub tooltip", () => {
  it("shows a formatted timestamp near the cursor", () => {
    render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={[]}
        sceneMarks={[]}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );

    const track = screen.getByTestId("timeline-track");

    // Fire a mouseMove at clientX = halfway across the track.
    fireEvent.mouseMove(track, { clientX: 400 });

    const tooltip = screen.getByTestId("timeline-hover-tooltip");
    expect(tooltip).toBeInTheDocument();
    // 12h / 2 = 6:00:00
    expect(tooltip.textContent).toMatch(/6:00:00/);
    // Tooltip must be horizontally centered on the cursor (-translate-x-1/2)
    expect(tooltip.className).toMatch(/-translate-x-1\/2/);
  });

  it("hides the tooltip when the cursor leaves", () => {
    render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={[]}
        sceneMarks={[]}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    const track = screen.getByTestId("timeline-track");
    fireEvent.mouseMove(track, { clientX: 250 });
    expect(screen.getByTestId("timeline-hover-tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(track);
    expect(screen.queryByTestId("timeline-hover-tooltip")).toBeNull();
  });

  it("clamps the formatted timestamp at the start and end", () => {
    render(
      <TimelineStrip
        durationSec={12 * 3600}
        clips={[]}
        sceneMarks={[]}
        activeClipId={null}
        scrubToSec={null}
        onScrub={() => {}}
      />,
    );
    const track = screen.getByTestId("timeline-track");
    fireEvent.mouseMove(track, { clientX: -200 });
    expect(screen.getByTestId("timeline-hover-tooltip").textContent).toMatch(
      /^00:00:00$/,
    );
    fireEvent.mouseMove(track, { clientX: 100_000 });
    expect(screen.getByTestId("timeline-hover-tooltip").textContent).toMatch(
      /^12:00:00$/,
    );
  });

  it("marks the track as a slider with current value", () => {
    render(
      <TimelineStrip
        durationSec={7200}
        clips={[]}
        sceneMarks={[]}
        activeClipId={null}
        scrubToSec={1234}
        onScrub={() => {}}
      />,
    );
    const track = screen.getByTestId("timeline-track");
    expect(track.getAttribute("role")).toBe("slider");
    expect(track.getAttribute("aria-valuemax")).toBe("7200");
    expect(track.getAttribute("aria-valuenow")).toBe("1234");
    expect(track.getAttribute("aria-label")).toMatch(/scrubber/i);
  });
});

describe("VideoPreview waveform-canvas placement", () => {
  it("positions the waveform canvas above the playback controls (bottom-24)", () => {
    render(
      <VideoPreview
        videoUrl="blob:http://localhost/fake-test-source.mp4"
        durationSec={120}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    const canvas = screen.getByTestId("waveform-canvas");
    // The wrapper div carries the bottom utility class.
    const wrapper = canvas.parentElement as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toMatch(/\bbottom-24\b/);
    // Sanity: the playback-controls still live at bottom-12 (unchanged).
    const controls = screen.getByTestId("playback-controls");
    expect(controls.className).toMatch(/\bbottom-12\b/);
  });
});

function primeProjectMocksReady() {
  const project = {
    _id: "p_xyz789",
    _creationTime: Date.now(),
    title: "Re-run Copy Test",
    durationSec: 12 * 3600,
    status: "ready" as const,
    progress: 100,
    summary: "ok",
    persona: "long-form broadcast",
    ownerId: "u_test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "demo" as const,
  };
  convexMock.query("projects:get", project);
  convexMock.query("queries:listLogs", []);
  convexMock.query("queries:listClips", []);
  convexMock.query("queries:listTitles", []);
  convexMock.query("queries:listThumbnails", []);
  convexMock.query("queries:listCaptions", []);
  convexMock.query("queries:latestRun", null);
  convexMock.query("queries:listSceneMarks", []);
}

describe("Studio share-link feedback", () => {
  it("flips the button label to 'Copied' for ~1.5s after a successful copy", async () => {
    // We need status=='ready' so Studio doesn't immediately call run(),
    // leaving the ShortcutLegend on screen for interaction.
    primeProjectMocksReady();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(
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

    const shareBtn = await screen.findByTestId("copy-share-link");
    expect(shareBtn.textContent).toMatch(/Copy share link/);
    expect(shareBtn.getAttribute("data-copied")).toBe("false");

    await act(async () => {
      fireEvent.click(shareBtn);
      // Allow the .then() microtask to resolve.
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(shareBtn.textContent).toMatch(/Copied/);
    expect(shareBtn.getAttribute("data-copied")).toBe("true");

    // The 1.5s revert window: assert before it elapses across the timer.
    await waitFor(
      () => {
        expect(shareBtn.getAttribute("data-copied")).toBe("false");
      },
      { timeout: 2500 },
    );
    expect(shareBtn.textContent).toMatch(/Copy share link/);
  });

  it("keeps the button label stable when clipboard.writeText rejects", async () => {
    primeProjectMocksReady();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(
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

    const shareBtn = await screen.findByTestId("copy-share-link");
    await act(async () => {
      fireEvent.click(shareBtn);
      // let the rejection microtask resolve
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalled();
    expect(shareBtn.getAttribute("data-copied")).toBe("false");
    expect(shareBtn.textContent).toMatch(/Copy share link/);
  });
});
