import { useCallback, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type FullCalendarClass from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { DatesSetArg } from '@fullcalendar/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

const VIEW_OPTIONS: { id: CalendarViewType; label: string }[] = [
  { id: 'dayGridMonth', label: 'Month' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'timeGridDay', label: 'Day' },
];

export function CalendarWorkspace() {
  const calendarRef = useRef<FullCalendarClass | null>(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [activeView, setActiveView] = useState<CalendarViewType>('dayGridMonth');

  const syncFromApi = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }

    setCurrentTitle(api.view.title);
    setActiveView(api.view.type as CalendarViewType);
  }, []);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setCurrentTitle(arg.view.title);
    setActiveView(arg.view.type as CalendarViewType);
  }, []);

  const handlePrev = useCallback(() => {
    calendarRef.current?.getApi().prev();
    syncFromApi();
  }, [syncFromApi]);

  const handleNext = useCallback(() => {
    calendarRef.current?.getApi().next();
    syncFromApi();
  }, [syncFromApi]);

  const handleToday = useCallback(() => {
    const api = calendarRef.current?.getApi();
    api?.today();
    syncFromApi();
  }, [syncFromApi]);

  const handleViewChange = useCallback((view: CalendarViewType) => {
    const api = calendarRef.current?.getApi();
    if (!api || api.view.type === view) {
      return;
    }

    api.changeView(view);
    syncFromApi();
  }, [syncFromApi]);

  return (
    <section
      aria-labelledby="calendar-workspace-heading"
      className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 id="calendar-workspace-heading" className="text-xl font-semibold text-white">
              Calendar workspace
            </h2>
            <p className="text-sm text-slate-400">
              Explore the agenda across month, week, and day views while we wire schedules and lessons into each slot.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleToday}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/20 hover:text-white"
          >
            Today
          </button>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-slate-200">
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center justify-center rounded-full p-2 hover:bg-white/10"
              aria-label="Go to previous period"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="px-3 text-sm font-medium text-white" aria-live="polite">
              {currentTitle || 'Loading calendar…'}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center justify-center rounded-full p-2 hover:bg-white/10"
              aria-label="Go to next period"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {VIEW_OPTIONS.map((option) => {
              const isActive = activeView === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleViewChange(option.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? 'bg-accent/20 text-accent shadow-[0_0_0_1px_rgba(99,102,241,0.4)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-white/10">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="auto"
          weekends
          expandRows
          dayMaxEvents
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="18:00:00"
          datesSet={handleDatesSet}
        />
      </div>
    </section>
  );
}
