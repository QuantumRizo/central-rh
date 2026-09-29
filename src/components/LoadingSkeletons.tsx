export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
export function LoginSkeleton() {
  return (
    <main className="login">
      <div className="card loading-card" aria-label="Cargando aplicación">
        <Skeleton className="skeleton-logo" />
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-subtitle" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-button" />
      </div>
    </main>
  );
}
export function SheetSkeleton() {
  return (
    <div className="sheet-skeleton" aria-label="Cargando captura diaria">
      <Skeleton className="skeleton-section-title" />
      <div className="skeleton-grid">
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
      </div>
      <Skeleton className="skeleton-divider" />
      <Skeleton className="skeleton-section-title short" />
      <Skeleton className="skeleton-row" />
      <Skeleton className="skeleton-button small" />
    </div>
  );
}
export function AdminSkeleton() {
  return (
    <div className="admin-skeleton" aria-label="Cargando panel">
      <div className="skeleton-metrics">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="skeleton-metric" />
        ))}
      </div>
      <div className="skeleton-admin-grid">
        <Skeleton className="skeleton-admin-card" />
        <Skeleton className="skeleton-admin-card" />
      </div>
      <Skeleton className="skeleton-table" />
    </div>
  );
}
