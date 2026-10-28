export default function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-[var(--border)] motion-reduce:animate-none ${className}`} />;
}

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return <>
    <tr><td colSpan={columns} className="p-0"><span role="status" className="sr-only">Loading records</span></td></tr>
    {Array.from({ length: rows }, (_, row) => (
      <tr key={row} aria-hidden="true" className="border-t border-[var(--border)]/80">
        {Array.from({ length: columns }, (_, column) => (
          <td key={column} className="px-3 py-3"><Skeleton className={`h-4 ${column === 0 ? "w-3/4 min-w-24" : "w-2/3 min-w-12"}`} /></td>
        ))}
      </tr>
    ))}
  </>;
}
