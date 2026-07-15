import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-secondary/60 bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(0,243,255,0.12)_50%,rgba(255,255,255,0)_100%)] bg-[length:200%_100%] animate-shimmer border border-border/50",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
