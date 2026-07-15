import { motion } from "framer-motion";
import { ListVideo, Smartphone, Tag } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatTimestamp } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type HighlightItem = {
  _id: Id<"clips">;
  kind: "highlight" | "short" | "chapter" | "cut";
  title: string;
  startSec: number;
  endSec: number;
  score: number;
  rationale: string;
  tags: string[];
};

export default function HighlightsList({
  items,
  activeId,
  onSelect,
}: {
  items: HighlightItem[];
  activeId: string | null;
  onSelect: (item: HighlightItem) => void;
}) {
  const ordered = [...items].sort((a, b) => {
    if (a.kind === "short" && b.kind !== "short") return -1;
    if (b.kind === "short" && a.kind !== "short") return 1;
    return b.score - a.score;
  });
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <ListVideo className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium">Highlights & Shorts</span>
        <span className="ml-2 rounded border border-border/80 bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2.5">
        {ordered.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            Clips appear here as soon as the pipeline is past scoring.
          </p>
        ) : (
          <ul className="space-y-2">
            {ordered.map((it, i) => (
              <motion.li
                key={it._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02, duration: 0.3 }}
              >
                <button
                  onClick={() => onSelect(it)}
                  className={`group relative w-full overflow-hidden rounded-lg border bg-secondary/40 p-3 text-left transition ${
                    activeId === it._id
                      ? "border-accent/70 ring-glow-magenta"
                      : "border-border/70 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <KindBadge kind={it.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium leading-snug">
                        {it.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                        <span>{formatTimestamp(it.startSec)}</span>
                        <span className="text-border">→</span>
                        <span>{formatTimestamp(it.endSec)}</span>
                        <span className="ml-auto rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary">
                          score {Math.round(it.score * 100)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {it.rationale}
                      </p>
                      {it.tags?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {it.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-0.5 rounded border border-border/80 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              <Tag className="h-2.5 w-2.5" /> {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: HighlightItem["kind"] }) {
  if (kind === "short")
    return (
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-accent/40 bg-accent/15 text-accent">
        <Smartphone className="h-3 w-3" />
      </span>
    );
  if (kind === "highlight")
    return (
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/15 text-primary">
        <ListVideo className="h-3 w-3" />
      </span>
    );
  return (
    <Badge variant="outline" className="mt-0.5 h-6 w-6 shrink-0 justify-center">
      {kind[0].toUpperCase()}
    </Badge>
  );
}
