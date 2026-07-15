import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import VideoPreview, {
  type VideoControlRef,
} from "../components/studio/VideoPreview";

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

describe("VideoPreview playback controls", () => {
  beforeEach(() => {
    // Make HTMLVideoElement deterministic: writable currentTime/playbackRate,
    // a stable paused state and a defined duration.
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() {
        return (this as any).__ct ?? 0;
      },
      set(v: number) {
        (this as any).__ct = v;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return (this as any).__dur ?? 0;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() {
        return (this as any).__paused ?? true;
      },
      set(v: boolean) {
        (this as any).__paused = v;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
      configurable: true,
      get() {
        return (this as any).__rate ?? 1;
      },
      set(v: number) {
        (this as any).__rate = v;
      },
    });
    // jsdom leaves play() unimplemented (returns a Promise). Stub it.
    (HTMLMediaElement.prototype as any).play = function (this: HTMLMediaElement) {
      (this as any).__paused = false;
      return Promise.resolve();
    };
    (HTMLMediaElement.prototype as any).pause = function (this: HTMLMediaElement) {
      (this as any).__paused = true;
    };
  });

  it("renders speed buttons and marks the active rate", () => {
    render(
      <VideoPreview
        videoUrl="blob:http://localhost/test"
        durationSec={600}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    expect(screen.getByTestId("speed-0.25")).toBeInTheDocument();
    expect(screen.getByTestId("speed-0.5")).toBeInTheDocument();
    expect(screen.getByTestId("speed-1")).toBeInTheDocument();
    expect(screen.getByTestId("speed-1.5")).toBeInTheDocument();
    expect(screen.getByTestId("speed-2")).toBeInTheDocument();
    expect(screen.getByTestId("speed-1").getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByTestId("speed-2"));
    expect(screen.getByTestId("speed-2").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("speed-1").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("renders frame-step buttons and increments currentTime when clicked", () => {
    render(
      <VideoPreview
        videoUrl="blob:http://localhost/test"
        durationSec={60}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    const v = document.querySelector("video") as HTMLVideoElement & {
      __ct?: number;
    };
    v.__ct = 5;
    fireEvent.click(screen.getByTestId("frame-forward"));
    // Default step = +1 frame at 1/30s ≈ +0.0333 — jsdom rounds but stays > 5
    expect((v.__ct ?? 0) > 5).toBe(true);
  });

  it("exposes setPlaybackRate + stepFrame on the imperative handle", () => {
    const ref = createRef<VideoControlRef>();
    render(
      <VideoPreview
        ref={ref}
        videoUrl="blob:http://localhost/test"
        durationSec={60}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
      />,
    );
    expect(ref.current?.setPlaybackRate).toBeTypeOf("function");
    expect(ref.current?.stepFrame).toBeTypeOf("function");
    expect(ref.current?.isPlaying).toBeTypeOf("function");
    // Calling setPlaybackRate should propagate to the speed button aria state.
    ref.current?.setPlaybackRate(1.5);
    // Allow React to flush state
    return Promise.resolve().then(() => {
      expect(
        screen.getByTestId("speed-1.5").getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });

  it("bubble play state to the parent via onPlayChange", () => {
    const onPlayChange = vi.fn();
    render(
      <VideoPreview
        videoUrl="blob:http://localhost/test"
        durationSec={60}
        progress={0}
        activeStage=""
        status="ready"
        scrubToSec={null}
        onPlayChange={onPlayChange}
      />,
    );
    const v = document.querySelector("video") as HTMLVideoElement;
    fireEvent.play(v);
    fireEvent.pause(v);
    // The child fires update twice (play -> true, pause -> false). Last call wins.
    expect(onPlayChange).toHaveBeenCalled();
    const last = onPlayChange.mock.calls[onPlayChange.mock.calls.length - 1]?.[0];
    expect(last).toBe(false);
  });
});
