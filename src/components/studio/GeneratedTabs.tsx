import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Captions, Captions as CaptionsIcon, Image as ImageIcon, Type } from "lucide-react";
import { motion } from "framer-motion";
import { formatTimestamp } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type TitleItem = {
  _id: Id<"titles">;
  label: string;
  body: string;
  score: number;
  style: string;
};

export type ThumbItem = {
  _id: Id<"thumbnails">;
  headline: string;
  subtext: string;
  palette: string;
  score: number;
};

export type CaptionItem = {
  _id: Id<"captions">;
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
  sentiment: string;
};

export default function GeneratedTabs({
  titles,
  thumbnails,
  captions,
}: {
  titles: TitleItem[];
  thumbnails: ThumbItem[];
  captions: CaptionItem[];
}) {
  return (
    <Tabs defaultValue="titles" className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="text-sm font-medium">Generated</div>
        <TabsList>
          <TabsTrigger value="titles" className="gap-1.5">
            <Type className="h-3.5 w-3.5" />
            Titles <span className="font-mono text-[10px]">{titles.length}</span>
          </TabsTrigger>
          <TabsTrigger value="thumbs" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Thumbs <span className="font-mono text-[10px]">{thumbnails.length}</span>
          </TabsTrigger>
          <TabsTrigger value="captions" className="gap-1.5">
            <CaptionsIcon className="h-3.5 w-3.5" />
            Captions <span className="font-mono text-[10px]">{captions.length}</span>
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <TabsContent value="titles" className="m-0">
          {titles.length === 0 ? (
            <Empty msg="Titles will appear after the LLM narrative stage." />
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {titles.map((t, i) => (
                <motion.li
                  key={t._id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                  className="rounded-lg border border-border/70 bg-secondary/40 p-3 transition hover:border-primary/40"
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    <span>{t.label}</span>
                    <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary">
                      {Math.round(t.score * 100)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium leading-snug">{t.body}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    style · {t.style}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="thumbs" className="m-0">
          {thumbnails.length === 0 ? (
            <Empty msg="Thumbnails will appear after the vision + narrative stages." />
          ) : (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {thumbnails.map((t, i) => (
                <motion.li
                  key={t._id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="overflow-hidden rounded-lg border border-border/70"
                >
                  <div
                    className={`relative aspect-video ${paletteFor(t.palette)}`}
                  >
                    <div className="absolute inset-0 border-grid opacity-30" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="font-serif text-lg font-extrabold leading-tight text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]">
                        {t.headline}
                      </div>
                      <div className="mt-0.5 text-xs text-white/90 drop-shadow-[0_0_4px_rgba(0,0,0,0.5)]">
                        {t.subtext}
                      </div>
                    </div>
                    <span className="absolute right-2 top-2 rounded border border-foreground/40 bg-background/40 px-1.5 py-0.5 text-[10px] font-mono text-foreground/90 backdrop-blur">
                      CTR · {Math.round(t.score * 100)}
                    </span>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="captions" className="m-0">
          {captions.length === 0 ? (
            <Empty msg="Captions appear once transcribe stage finishes." />
          ) : (
            <ul className="space-y-1.5 font-mono text-xs">
              {captions.map((c, i) => (
                <motion.li
                  key={c._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.012, duration: 0.2 }}
                  className="grid grid-cols-[64px_80px_1fr] gap-2 rounded border border-border/60 bg-secondary/30 px-2 py-1.5"
                >
                  <span className="text-muted-foreground">{formatTimestamp(c.startSec)}</span>
                  <span className={`text-${sentimentColor(c.sentiment)}-400 truncate`}>
                    {c.speaker}
                  </span>
                  <span>{c.text}</span>
                </motion.li>
              ))}
            </ul>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center text-xs text-muted-foreground">
      <p>{msg}</p>
    </div>
  );
}

function paletteFor(p: string): string {
  switch (p) {
    case "violet-amber":
      return "bg-gradient-to-br from-violet-700 via-fuchsia-600 to-amber-400";
    case "violet":
      return "bg-gradient-to-br from-violet-700 via-indigo-700 to-fuchsia-700";
    case "amber-magenta":
      return "bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-600";
    case "cyan-lime":
      return "bg-gradient-to-br from-cyan-400 via-sky-500 to-lime-400";
    case "cyan-lab":
      return "bg-gradient-to-br from-cyan-500 via-blue-700 to-purple-700";
    case "cyan-magenta":
    default:
      return "bg-gradient-to-br from-cyan-400 via-purple-600 to-pink-500";
  }
}

function sentimentColor(s: string): string {
  if (s.includes("warm") || s.includes("intense") || s.includes("surprised"))
    return "pink";
  if (s.includes("calm") || s.includes("neutral"))
    return "cyan";
  return "yellow";
}
