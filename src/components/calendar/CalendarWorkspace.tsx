import { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type FullCalendarClass from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { DatesSetArg, EventInput } from '@fullcalendar/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataStore } from '../../data/db';
import type {
  Group,
  Lesson,
  LessonStatus,
  Level,
  PlaceholderSlot,
  Topic,
} from '../../data/types';

type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

const VIEW_OPTIONS: { id: CalendarViewType; label: string }[] = [
  { id: 'dayGridMonth', label: 'Month' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'timeGridDay', label: 'Day' },
];

const DEFAULT_ACCENT = '#6366f1';

const STATUS_THEME: Record<LessonStatus, { backgroundAlpha: number; borderAlpha: number; textColor: string }> = {
  draft: { backgroundAlpha: 0.1, borderAlpha: 0.35, textColor: '#e2e8f0' },
  planned: { backgroundAlpha: 0.18, borderAlpha: 0.5, textColor: '#0f172a' },
  in_progress: { backgroundAlpha: 0.28, borderAlpha: 0.65, textColor: '#0f172a' },
  completed: { backgroundAlpha: 0.35, borderAlpha: 0.75, textColor: '#0f172a' },
  cancelled: { backgroundAlpha: 0.16, borderAlpha: 0.4, textColor: '#f8fafc' },
};

function toDateTime(date: string, time: string) {
  if (!time) {
    return date;
  }
  const suffix = time.includes(':') && time.length === 5 ? `${time}:00` : time;
  return `${date}T${suffix}`;
}

function hexToRgba(hexColor: string | undefined | null, alpha: number) {
  if (!hexColor) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  let sanitized = hexColor.trim();
  if (sanitized.startsWith('#')) {
    sanitized = sanitized.slice(1);
  }

  if (sanitized.length === 3) {
    sanitized = sanitized
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  if (sanitized.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function titleCaseStatus(status: LessonStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function createLessonEvents(
  lessons: Lesson[],
  groupsById: Map<string, Group>,
  levelsById: Map<string, Level>,
  topicsById: Map<string, Topic>
) {
  const result: EventInput[] = [];
  const keys = new Set<string>();

  for (const lesson of lessons) {
    const group = groupsById.get(lesson.groupId);
    const level = group ? levelsById.get(group.levelId) : undefined;
    const topic = topicsById.get(lesson.topicId);

    const baseColor = topic?.color ?? level?.color ?? DEFAULT_ACCENT;
    const theme = STATUS_THEME[lesson.status] ?? STATUS_THEME.planned;
    const start = toDateTime(lesson.date, lesson.startTime);
    const end = toDateTime(lesson.date, lesson.endTime);
    const key = `${lesson.groupId}_${lesson.date}_${lesson.startTime}_${lesson.endTime}`;

    result.push({
      id: lesson.id,
      title: `${group?.displayName ?? 'Lesson'} • ${topic?.name ?? 'Untitled lesson'}`,
      start,
      end,
      display: 'block',
      classNames: ['lesson-event'],
      backgroundColor: hexToRgba(baseColor, theme.backgroundAlpha),
      borderColor: hexToRgba(baseColor, theme.borderAlpha),
      textColor: theme.textColor,
      extendedProps: {
        kind: 'lesson',
        status: lesson.status,
        statusLabel: titleCaseStatus(lesson.status),
        groupName: group?.displayName ?? 'Unknown group',
        topicName: topic?.name ?? 'Untitled lesson',
      },
    });

    keys.add(key);
  }

  return { events: result, lessonKeys: keys };
}

function createPlaceholderEvents(
  placeholders: PlaceholderSlot[],
  groupsById: Map<string, Group>,
  levelsById: Map<string, Level>,
  existingLessonKeys: Set<string>
) {
  const result: EventInput[] = [];

  for (const slot of placeholders) {
    const key = `${slot.groupId}_${slot.date}_${slot.startTime}_${slot.endTime}`;
    if (existingLessonKeys.has(key)) {
      continue;
    }

    const group = groupsById.get(slot.groupId);
    const level = group ? levelsById.get(group.levelId) : undefined;
    const accent = level?.color ?? DEFAULT_ACCENT;

    result.push({
      id: slot.id,
      title: `${group?.displayName ?? 'Group'} • Scheduled slot`,
      start: toDateTime(slot.date, slot.startTime),
      end: toDateTime(slot.date, slot.endTime),
      display: 'block',
      classNames: ['placeholder-event'],
      backgroundColor: hexToRgba(accent, 0.12),
      borderColor: hexToRgba(accent, 0.35),
      textColor: '#cbd5f5',
      extendedProps: {
        kind: 'placeholder',
        groupName: group?.displayName ?? 'Unknown group',
        levelColor: accent,
      },
    });
  }

  return result;
}

export function CalendarWorkspace() {
  const calendarRef = useRef<FullCalendarClass | null>(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [activeView, setActiveView] = useState<CalendarViewType>('dayGridMonth');
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCalendarData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [groups, levels, lessons, placeholders, topics] = await Promise.all([
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('lessons'),
        DataStore.getAll('placeholderSlots'),
        DataStore.getAll('topics'),
      ]);

      const groupsById = new Map(groups.map((group) => [group.id, group]));
      const levelsById = new Map(levels.map((level) => [level.id, level]));
      const topicsById = new Map(topics.map((topic) => [topic.id, topic]));

      const { events: lessonEvents, lessonKeys } = createLessonEvents(
        lessons,
        groupsById,
        levelsById,
        topicsById
      );

      const placeholderEvents = createPlaceholderEvents(
        placeholders,
        groupsById,
        levelsById,
        lessonKeys
      );

      setEvents([...lessonEvents, ...placeholderEvents]);
    } catch (error) {
      console.error('Failed to load calendar events', error);
      setLoadError('Unable to load calendar data. Please try again.');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData]);

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
      {isLoading ? (
        <p className="rounded-2xl bg-surface/60 p-4 text-sm text-slate-300 ring-1 ring-white/10">
          Loading calendar events…
        </p>
      ) : loadError ? (
        <p className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/40">
          {loadError}
        </p>
      ) : events.length === 0 ? (
        <p className="rounded-2xl bg-surface/60 p-4 text-sm text-slate-400 ring-1 ring-white/10">
          No calendar events to show yet. Configure schedules or lessons to populate this view.
        </p>
      ) : null}
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
          events={events}
          eventDisplay="block"
        />
      </div>
    </section>
  );
}
