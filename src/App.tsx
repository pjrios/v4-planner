import type { LucideIcon } from 'lucide-react';
import { CalendarClock, CopyCheck, GraduationCap, Layers3 } from 'lucide-react';
import { AppShell, Sidebar, TopBar } from './components/layout';
import type { SidebarSection } from './components/layout';

const planningSections: SidebarSection[] = [
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
        badge: 'soon',
      },
      {
        id: 'settings',
        label: 'Settings',
        description: 'Preferences & backups',
      },
    ],
  },
];

const dailyFocus: { icon: LucideIcon; title: string; description: string; actions: string[] }[] = [
  {
    icon: GraduationCap,
    title: 'Academic structure',
    description: 'Define trimesters, levels, and teaching groups to unlock schedule automation.',
    actions: ['setup'],
  },
  {
    icon: CopyCheck,
    title: 'Lesson authoring',
    description: 'Draft lessons with pre/while/post sections, rubrics, and reusable templates.',
    actions: ['in-progress'],
  },
  {
    icon: CalendarClock,
    title: 'Calendar intelligence',
    description: 'Preview how holidays and events cascade through your weekly sessions.',
    actions: ['up next'],
  },
import { CalendarClock, Sparkles } from 'lucide-react';

const highlights = [
  'Plan lessons with structured pre/while/post activities',
  'Keep class schedules and holidays in sync automatically',
  'Stay organized offline with secure local storage',
];

export default function App() {
  return (
    <AppShell
      sidebar={<Sidebar sections={planningSections} />}
      topBar={
        <TopBar
          title="Agenda overview"
          subtitle="Offline-first workspace for planning, scheduling, and tracking every class."
          breadcrumbs={[{ id: 'home', label: 'Home' }, { id: 'overview', label: 'Overview' }]}
        />
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="grid gap-6 md:grid-cols-3">
          {dailyFocus.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-slate-200 shadow-lg shadow-slate-950/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                </div>
                <p className="text-sm text-slate-400">{item.description}</p>
                <div className="flex flex-wrap gap-2">
                  {item.actions.map((action) => (
                    <span
                      key={action}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs uppercase tracking-wide text-slate-200"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Why this scaffold?</h2>
                <p className="text-sm text-slate-400">
                  Start from an opinionated layout that mirrors the final product: sidebar navigation, actionable top bar, and
                  room for schedule-aware dashboards.
                </p>
              </div>
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                foundation
              </span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li>• Split view for navigation, top-level context, and workspace content.</li>
              <li>• Responsive design that adapts to large desktop or narrow laptop screens.</li>
              <li>• Theming aligned with the dark UI direction in the planning docs.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Dev momentum</h3>
              <p className="mt-2 text-sm text-slate-300">
                Seed data now loads automatically in development, so upcoming calendar and lesson flows have meaningful
                content to render.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Next milestones</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-300">
                <li>• Build setup forms for trimesters, holidays, and group schedules.</li>
                <li>• Connect calendar views to Dexie data via selectors.</li>
                <li>• Ship lesson editor scaffolding with activity templates.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
    <div className="min-h-screen bg-background text-slate-100">
      <main className="flex flex-col items-center justify-center px-6 py-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 text-center">
          <div className="flex flex-col items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-4 py-2 text-sm font-semibold text-accent ring-1 ring-accent/30">
              <CalendarClock className="h-4 w-4" />
              Offline-first agenda planner
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Stay ahead of every class across levels and trimesters
            </h1>
            <p className="max-w-2xl text-lg text-slate-300">
              Build a structured teaching agenda that mirrors your classroom reality. Visualize
              schedules, craft rich lessons, and adapt instantly when plans change.
            </p>
          </div>

          <div className="grid gap-4 text-left sm:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex flex-col gap-3 rounded-2xl bg-surface/60 p-6 ring-1 ring-white/10 backdrop-blur"
              >
                <Sparkles className="h-5 w-5 text-accent" />
                <p className="text-sm font-medium text-slate-200">{item}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-accent/90 via-accent to-indigo-500 px-8 py-10 text-left text-white shadow-2xl">
            <h2 className="text-2xl font-semibold">Next up</h2>
            <p className="max-w-xl text-base text-indigo-100">
              Configure the academic structure, connect schedules, and power the calendar views.
              This starter interface ships with TailwindCSS, ESLint, and TypeScript so you can dive
              straight into building the teacher-focused experience.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
