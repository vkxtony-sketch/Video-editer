import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Captions,
  Clapperboard,
  Cpu,
  Film,
  Gauge,
  Languages,
  Layers,
  Mic,
  ScanLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const features = [
  {
    icon: Cpu,
    title: "Adaptive chunk ingest",
    body: "Streams 12–24h+ recordings through adaptive windows — never loads the full file.",
  },
  {
    icon: ScanLine,
    title: "Multi-pass perception",
    body: "Fast scan → speech → narrative → vision → per-second scoring in one timeline.",
  },
  {
    icon: Brain,
    title: "Story-driven cuts",
    body: "Removes silence, filler, and dead air while preserving natural pacing & arcs.",
  },
  {
    icon: Captions,
    title: "Caption + metadata",
    body: "Word-level transcripts in 100+ languages with sentiment, titles, thumbnails.",
  },
  {
    icon: Wand2,
    title: "Shorts + chapters",
    body: "Auto-generated vertical shorts, chapters, and highlight reels in seconds.",
  },
  {
    icon: Gauge,
    title: "Built for scale",
    body: "Server-side Convex pipeline so the browser stays smooth at 24h.",
  },
];

const stages = [
  { k: "ingest", l: "Adaptive Chunk Ingest", i: Layers },
  { k: "scan", l: "Fast Scan · Frames · Audio", i: ScanLine },
  { k: "transcribe", l: "Speech Recognition", i: Mic },
  { k: "narrative", l: "LLM Narrative Reasoning", i: Brain },
  { k: "vision", l: "Computer Vision", i: Film },
  { k: "scoring", l: "Timeline Intelligence", i: Gauge },
  { k: "autocut", l: "Auto-Edit · Silence", i: Wand2 },
];

export default function Landing() {
  const navigate = useNavigate();
  const create = useMutation(api.projects.create);

  async function trySample() {
    try {
      const { projectId } = await create({
        ownerId: localStorage.getItem("neon:session") || "anon",
        title: "Sample Session · Long-form VOD",
        source: "sample",
        sourceLabel: "Sample · 12h Broadcast",
        durationSec: 12 * 3600,
        persona: "long-form broadcast",
      });
      navigate(`/studio/${projectId}`);
    } catch (_) {
      navigate("/dashboard");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5">
      <section className="relative pt-16 pb-24 md:pt-24 md:pb-32">
        <BackgroundFx />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Neon AI Lab · Demo Build
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.6 }}
            className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl"
          >
            <span className="gradient-text-neon">
              A 24-hour recording.
            </span>
            <br />
            <span className="text-foreground">A five-minute highlight.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.6 }}
            className="mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg"
          >
            Drop in a long VOD, a multi-cam podcast, or an all-day livestream.
            Neon AI Lab chunks it, scans every frame, transcribes in 100+
            languages, scores every second, and hands you a finished edit —
            highlights, shorts, chapters, captions, titles, thumbnails.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_0_30px_-5px_rgba(0,243,255,0.7)] transition hover:shadow-[0_0_30px_0_rgba(0,243,255,0.7)]"
            >
              <Clapperboard className="h-4 w-4" />
              Open Studio
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={trySample}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
            >
              <Sparkles className="h-4 w-4 text-accent" />
              Try the 12-hour sample
            </button>
          </motion.div>
          <Metrics />
        </div>
      </section>

      <section className="border-t border-border/60 py-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 p-5 backdrop-blur transition hover:border-primary/40"
            >
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/[0.06] to-accent/[0.06] opacity-0 transition group-hover:opacity-100" />
              <div className="inline-grid h-9 w-9 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              <span className="gradient-text-neon">Seven stages.</span>{" "}
              <span className="text-foreground">One stream of perception.</span>
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Each chunk of your video is processed by a dedicated stage.
              Adaptive ingest chunks it for memory safety, fast scan extracts
              frames + audio + OCR + scene cuts, then speech, narrative, and
              vision understand what actually happened. Timeline intelligence
              scores every second, auto-edit removes what doesn't belong.
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              Run a pipeline now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ol className="relative space-y-3">
            <span className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/70 via-accent/60 to-transparent" />
            {stages.map((s, i) => (
              <motion.li
                key={s.k}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                  <s.i className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Stage {i + 1}
                  </div>
                  <div className="text-sm font-medium">{s.l}</div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border/60 py-20">
        <div className="rounded-2xl border border-primary/30 bg-card/60 p-8 shadow-[0_0_60px_-20px_rgba(0,243,255,0.5)] md:p-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-accent">
                <Languages className="h-3.5 w-3.5" />
                Built for long content
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                Stop scrubbing. Start shipping.
              </h2>
              <p className="mt-3 max-w-xl text-muted-foreground">
                Tested with 12-hour livestream VODs, 6-hour podcast
                multi-cams, and 90-minute tutorials. Server-side chunking means
                the UI stays smooth while the model pipeline runs in the
                background.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/dashboard"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              >
                Open Studio <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={trySample}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3 text-sm font-medium"
              >
                <Sparkles className="h-4 w-4 text-accent" /> Try the sample
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metrics() {
  const stats = [
    { k: "Up to", v: "24h+" },
    { k: "Chunk size", v: "Adaptive" },
    { k: "Languages", v: "100+" },
    { k: "Stages", v: "7" },
  ];
  return (
    <motion.dl
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {stats.map((s) => (
        <div
          key={s.k}
          className="rounded-xl border border-border/60 bg-card/50 px-4 py-3"
        >
          <dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {s.k}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-glow-cyan">
            {s.v}
          </dd>
        </div>
      ))}
    </motion.dl>
  );
}

function BackgroundFx() {
  return (
    <>
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-60" />
    </>
  );
}
