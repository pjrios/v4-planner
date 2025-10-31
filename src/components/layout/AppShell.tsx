import type { ReactNode } from 'react';

export interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-72 border-r border-white/10 bg-slate-950/90 lg:block">
        {sidebar}
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur">
          {topBar}
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-900/60">
          {children}
        </main>
      </div>
    </div>
  );
}
