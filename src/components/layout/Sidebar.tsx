import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, BookOpen, CalendarClock, Layers3, Settings } from 'lucide-react';

export interface SidebarSection {
  id: string;
  label: string;
  items: NavigationItem[];
}

export interface NavigationItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  icon?: LucideIcon;
  isActive?: boolean;
  badge?: string;
}

export interface SidebarProps {
  sections?: SidebarSection[];
  footer?: ReactNode;
}

const defaultSections: SidebarSection[] = [
  {
    id: 'planning',
    label: 'Planning',
    items: [
      {
        id: 'calendar',
        label: 'Calendar',
        description: 'Month, week, and day views',
        icon: CalendarClock,
        isActive: true,
      },
      {
        id: 'lessons',
        label: 'Lessons',
        description: 'Templates, rubrics, resources',
        icon: BookOpen,
      },
      {
        id: 'structure',
        label: 'Levels & schedules',
        description: 'Trimesters, holidays, groups',
        icon: Layers3,
      },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      {
        id: 'reports',
        label: 'Reports',
        description: 'Coverage, pacing, workload',
        icon: BadgeCheck,
        badge: 'soon',
      },
      {
        id: 'settings',
        label: 'Settings',
        description: 'Preferences & backups',
        icon: Settings,
      },
    ],
  },
];

export function Sidebar({ sections = defaultSections, footer }: SidebarProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="space-y-8 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Agenda Planner</p>
          <h1 className="text-xl font-semibold text-white">Teacher workspace</h1>
          <p className="text-sm text-slate-400">
            Navigate between setup, planning, and insight tools.
          </p>
        </div>

        <nav className="space-y-6">
          {sections.map((section) => (
            <Fragment key={section.id}>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {section.label}
                </p>
                <ul className="space-y-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <a
                          href={item.href ?? '#'}
                          className={`group flex flex-col gap-1 rounded-2xl border border-transparent px-4 py-3 transition hover:border-white/10 hover:bg-white/5 ${
                            item.isActive ? 'border-white/10 bg-white/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                              {Icon ? <Icon className="h-4 w-4 text-accent" aria-hidden /> : null}
                              {item.label}
                            </div>
                            {item.badge ? (
                              <span className="rounded-full bg-white/10 px-2 text-xs uppercase tracking-wide text-slate-200">
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                          {item.description ? (
                            <p className="text-xs text-slate-400">{item.description}</p>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Fragment>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/10 p-6 text-xs text-slate-500">
        {footer ?? (
          <p>
            Built for offline-first lesson planning. Connect schedules, lessons, and reports as you ship new features.
          </p>
        )}
      </div>
    </div>
  );
}

export type { NavigationItem as SidebarNavigationItem };
