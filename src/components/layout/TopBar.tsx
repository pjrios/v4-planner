import type { ReactNode } from 'react';
import { CalendarDays, Info, Sun } from 'lucide-react';

export interface BreadcrumbItem {
  id: string;
  label: string;
}

export interface TopBarProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  meta?: ReactNode;
}

export function TopBar({ title, subtitle, breadcrumbs, actions, meta }: TopBarProps) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 text-slate-100 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.id} className="flex items-center gap-2">
                {index > 0 ? <span className="text-slate-700">/</span> : null}
                <span>{crumb.label}</span>
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold text-white sm:text-xl">{title}</h2>
        </div>
        {subtitle ? <p className="max-w-2xl text-sm text-slate-400">{subtitle}</p> : null}
        {meta ? <div className="text-xs text-slate-400">{meta}</div> : null}
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-300 md:items-end">
        {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
          <Sun className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          <span>Week 1 • Trimester planning kickoff</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/10"
          >
            <Info className="h-3 w-3" aria-hidden />
            View roadmap
          </button>
        </div>
      </div>
    </div>
  );
}
