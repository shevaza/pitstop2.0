type LoadingStateProps = { label?: string; compact?: boolean };

export default function LoadingState({ label = "Loading page", compact = false }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={compact ? "flex items-center justify-center p-4" : "flex min-h-[45vh] items-center justify-center p-6"}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col items-center gap-6">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--glass)] shadow-[var(--shadow-soft)]">
          <span className="absolute h-11 w-11 rounded-full border-[3px] border-[var(--primary-surface)]" />
          <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-transparent border-t-[var(--primary)] border-r-[var(--primary)] motion-reduce:animate-none" />
          <span className="absolute h-2 w-2 rounded-full bg-[var(--primary)]" />
        </div>
        {!compact && <div className="flex w-48 animate-pulse flex-col items-center gap-2 motion-reduce:animate-none">
          <span className="h-2 w-full rounded-full bg-[var(--primary-surface)]" />
          <span className="h-2 w-28 rounded-full bg-[var(--primary-surface)]" />
        </div>}
      </div>
    </div>
  );
}
