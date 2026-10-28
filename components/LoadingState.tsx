import Skeleton from "@/components/Skeleton";

type LoadingStateProps = { label?: string; compact?: boolean; variant?: "page" | "cards" | "chart" };

export default function LoadingState({ label = "Loading page", compact = false, variant = "page" }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={compact ? "w-full space-y-3 p-3" : "w-full space-y-6 p-6"}>
      <span className="sr-only">{label}</span>
      {variant === "chart" ? (
        <div aria-hidden="true" className="flex h-52 items-end gap-4 border-b border-l border-[var(--border)] px-4 pb-2">
          {[45, 70, 55, 90, 65, 80, 50, 60].map((height, index) => <div key={index} className="flex h-full flex-1 items-end"><span className="block w-full animate-pulse rounded-t-md bg-[var(--border)] motion-reduce:animate-none" style={{ height: `${height}%` }} /></div>)}
        </div>
      ) : (
        <>
          {!compact && variant === "page" && <div className="space-y-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64 max-w-full" /></div>}
          <div aria-hidden="true" className={!compact && variant === "page" ? "grid gap-4 sm:grid-cols-3" : "space-y-3"}>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--glass)] p-4">
                <Skeleton className="h-4 w-2/5" /><Skeleton className="h-6 w-3/5" /><Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
          {!compact && variant === "page" && <div aria-hidden="true" className="space-y-5 rounded-xl border border-[var(--border)] p-5">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-5 w-full" />)}</div>}
        </>
      )}
    </div>
  );
}
