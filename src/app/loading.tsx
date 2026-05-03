export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/2 rounded bg-neutral-200" />
        <div className="h-4 w-2/3 rounded bg-neutral-200" />
        <div className="h-64 rounded-2xl bg-neutral-200" />
      </div>
    </div>
  );
}
