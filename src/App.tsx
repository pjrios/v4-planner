import { CalendarClock, Sparkles } from 'lucide-react';

const highlights = [
  'Plan lessons with structured pre/while/post activities',
  'Keep class schedules and holidays in sync automatically',
  'Stay organized offline with secure local storage',
];

export default function App() {
  return (
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
