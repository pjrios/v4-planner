import { useState, type ReactNode } from 'react';
import { X, Menu } from 'lucide-react';

export interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-72 border-r border-white/10 bg-slate-950/90 lg:block">
        {sidebar}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 flex h-full w-72 flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/30 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sidebar}
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="relative border-b border-white/10 bg-slate-950/90 backdrop-blur">
          {/* Mobile Menu Button */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/30 hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          {topBar}
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-950/95">
          {children}
        </main>
      </div>
    </div>
  );
}
