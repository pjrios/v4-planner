import { useState } from 'react';
import { CalendarDays, CalendarPlus, CalendarRange, GraduationCap, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TrimesterManager } from '../trimester';
import { LevelManager } from '../level';
import { GroupManager } from '../group';
import { ScheduleBuilder } from '../schedule';
import { HolidayManager } from '../holiday';

type ManagerType = 'trimester' | 'level' | 'group' | 'schedule' | 'holiday';

type ManagerTile = {
  id: ManagerType;
  title: string;
  description: string;
  icon: LucideIcon;
};

const MANAGERS: ManagerTile[] = [
  {
    id: 'trimester',
    title: 'Trimester manager',
    description: 'Track academic periods and timelines',
    icon: CalendarDays,
  },
  {
    id: 'level',
    title: 'Level manager',
    description: 'Define grade and subject combinations',
    icon: GraduationCap,
  },
  {
    id: 'group',
    title: 'Group manager',
    description: 'Organize class groups and sections',
    icon: Users,
  },
  {
    id: 'schedule',
    title: 'Schedule builder',
    description: 'Map weekly sessions and validate overlaps',
    icon: CalendarRange,
  },
  {
    id: 'holiday',
    title: 'Holiday manager',
    description: 'Manage closures and school events',
    icon: CalendarPlus,
  },
];

export function StructureWorkspace() {
  const [activeManager, setActiveManager] = useState<ManagerType | null>(null);

  const handleTileClick = (managerId: ManagerType) => {
    setActiveManager(managerId);
  };

  const handleBack = () => {
    setActiveManager(null);
  };

  if (activeManager) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
        >
          ← Back to structure
        </button>
        {activeManager === 'trimester' && <TrimesterManager />}
        {activeManager === 'level' && <LevelManager />}
        {activeManager === 'group' && <GroupManager />}
        {activeManager === 'schedule' && <ScheduleBuilder />}
        {activeManager === 'holiday' && <HolidayManager />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {MANAGERS.map((manager) => {
          const Icon = manager.icon;
          return (
            <button
              key={manager.id}
              type="button"
              onClick={() => handleTileClick(manager.id)}
              className="group relative flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-left transition hover:border-accent/60 hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent transition group-hover:bg-accent/20">
                <Icon className="h-8 w-8" aria-hidden />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">{manager.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{manager.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

