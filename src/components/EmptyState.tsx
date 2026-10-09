export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{body}</p>
    </div>
  );
}
