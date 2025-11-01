import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { addDays, format, getISODay, isValid, parseISO, startOfDay } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import type FullCalendarClass from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
  MoreLinkArg,
  MoreLinkContentArg,
} from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2, X } from 'lucide-react';
import { DataStore, db } from '../../data/db';
import { getActiveTrimesterSpan, getExpectedSlotsForRange } from '../../data/placeholders';
import type {
  Group,
  Holiday,
  Lesson,
  LessonStatus,
  Level,
  PlaceholderSlot,
  Schedule,
  Topic,
  Trimester,
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

const LESSON_STATUS_OPTIONS: { id: LessonStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'planned', label: 'Planned' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

type CalendarDataState = {
  trimesters: Trimester[];
  levels: Level[];
  groups: Group[];
  schedules: Schedule[];
  holidays: Holiday[];
  lessons: Lesson[];
  placeholders: PlaceholderSlot[];
  topics: Topic[];
};

const ISO_DATE_FORMAT = 'yyyy-MM-dd';
const RANGE_PADDING_DAYS = 7;

type TooltipPlacement = 'top' | 'bottom';

type TooltipState = {
  eventId: string;
  kind: 'lesson' | 'placeholder';
  title: string;
  subtitle: string;
  timeLabel: string | null;
  statusLabel: string | null;
  accentColor: string;
  top: number;
  left: number;
  placement: TooltipPlacement;
};

type ActiveDayDetailsState = {
  date: string;
  initialEventId?: string | null;
};

type DayDetailEntry =
  | {
      kind: 'lesson';
      id: string;
      title: string;
      subtitle: string;
      levelLabel: string | null;
      timeLabel: string;
      statusLabel: string | null;
      accentColor: string;
      startSortKey: string;
      deleteLabel: string;
      canDelete: true;
      lesson: Lesson;
    }
  | {
      kind: 'placeholder';
      id: string;
      title: string;
      subtitle: string;
      levelLabel: string | null;
      timeLabel: string;
      statusLabel: string | null;
      accentColor: string;
      startSortKey: string;
      deleteLabel: string;
      canDelete: boolean;
      placeholderSource: PlaceholderSlot['source'];
      slot: PlaceholderSlot;
    };

function toDateTime(date: string, time: string) {
  if (!time) {
    return date;
  }
  const suffix = time.includes(':') && time.length === 5 ? `${time}:00` : time;
  return `${date}T${suffix}`;
}

function escapeHtml(value: string | undefined | null) {
  if (!value) {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeLabel(time: string | undefined | null) {
  if (!time) {
    return '';
  }

  const [rawHour, rawMinute] = time.split(':');
  const hour = Number.parseInt(rawHour ?? '', 10);
  const minute = Number.parseInt(rawMinute ?? '', 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? 'p' : 'a';
  const normalizedHour = ((hour + 11) % 12) + 1;
  const paddedMinute = minute.toString().padStart(2, '0');

  return `${normalizedHour}:${paddedMinute}${suffix}`;
}

function formatTimeRange(startTime: string | undefined | null, endTime: string | undefined | null) {
  const startLabel = formatTimeLabel(startTime);
  const endLabel = formatTimeLabel(endTime);

  if (startLabel && endLabel) {
    return `${startLabel}–${endLabel}`;
  }

  return startLabel || endLabel || '';
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

type HolidayWindow = {
  id: string;
  start: Date;
  end: Date;
  appliesToAll: boolean;
  targets: Set<string>;
};

function normalizeTarget(value: string) {
  return value.trim().toLowerCase();
}

function mapHolidayToWindow(holiday: Holiday): HolidayWindow | null {
  const start = parseISO(holiday.startDate);
  const end = parseISO(holiday.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  const targets = new Set(holiday.affectsGroups.map(normalizeTarget));

  return {
    id: holiday.id,
    start: startOfDay(start),
    end: startOfDay(end),
    appliesToAll: targets.has('all'),
    targets,
  };
}

function holidayCoversGroup(window: HolidayWindow, group: Group) {
  if (window.appliesToAll) {
    return true;
  }

  const comparisons = [group.id, group.displayName, group.levelId].map(normalizeTarget);
  return comparisons.some((value) => window.targets.has(value));
}

function dateFallsInside(date: Date, window: HolidayWindow) {
  return date >= window.start && date <= window.end;
}

function computeNextOccurrenceOnOrAfter(start: Date, desiredIsoDay: number) {
  const isoDay = getISODay(start);
  const offset = (desiredIsoDay - isoDay + 7) % 7;
  return startOfDay(addDays(start, offset));
}

function findEarliestScheduledDate(
  schedules: Schedule[],
  trimesters: Trimester[],
  groups: Group[],
  holidays: Holiday[]
) {
  if (!schedules.length || !trimesters.length || !groups.length) {
    return null as string | null;
  }

  const trimesterMap = new Map(trimesters.map((trimester) => [trimester.id, trimester]));
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const holidayWindows = holidays
    .map(mapHolidayToWindow)
    .filter((window): window is HolidayWindow => window !== null);

  const today = startOfDay(new Date());
  let best: string | null = null;

  for (const schedule of schedules) {
    const trimester = trimesterMap.get(schedule.trimesterId);
    const group = groupMap.get(schedule.groupId);

    if (!trimester || !group) {
      continue;
    }

    const trimesterStart = parseISO(trimester.startDate);
    const trimesterEnd = parseISO(trimester.endDate);

    if (
      Number.isNaN(trimesterStart.getTime()) ||
      Number.isNaN(trimesterEnd.getTime()) ||
      trimesterStart > trimesterEnd
    ) {
      continue;
    }

    const searchStart = startOfDay(trimesterStart > today ? trimesterStart : today);
    const searchEnd = startOfDay(trimesterEnd);

    if (searchStart > searchEnd) {
      continue;
    }

    const relevantHolidays = holidayWindows.filter((window) => holidayCoversGroup(window, group));

    for (const session of schedule.sessions) {
      if (!session || typeof session.dayOfWeek !== 'number') {
        continue;
      }

      let occurrence = computeNextOccurrenceOnOrAfter(searchStart, session.dayOfWeek);

      while (occurrence <= searchEnd) {
        const blocked = relevantHolidays.some((window) => dateFallsInside(occurrence, window));
        if (!blocked) {
          const isoDate = format(occurrence, ISO_DATE_FORMAT);
          if (!best || isoDate < best) {
            best = isoDate;
          }
          break;
        }

        occurrence = addDays(occurrence, 7);
      }
    }
  }

  return best;
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
        accentColor: baseColor,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        date: lesson.date,
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
    const isScheduled = slot.source === 'expected' || slot.source === 'schedule';
    const placeholderLabel = isScheduled ? 'Scheduled session' : 'Placeholder slot';
    const background = hexToRgba(accent, isScheduled ? 0.18 : 0.24);
    const border = hexToRgba(accent, isScheduled ? 0.45 : 0.55);
    const classNames = [
      'placeholder-event',
      isScheduled ? 'placeholder-event-expected' : 'placeholder-event-saved',
    ];

    result.push({
      id: slot.id,
      title: `${group?.displayName ?? 'Group'} • ${placeholderLabel}`,
      start: toDateTime(slot.date, slot.startTime),
      end: toDateTime(slot.date, slot.endTime),
      display: 'block',
      classNames,
      backgroundColor: background,
      borderColor: border,
      textColor: '#f8fafc',
      extendedProps: {
        kind: 'placeholder',
        groupName: group?.displayName ?? 'Unknown group',
        levelColor: accent,
        accentColor: accent,
        startTime: slot.startTime,
        endTime: slot.endTime,
        placeholderSource: slot.source,
        placeholderLabel,
        date: slot.date,
      },
    });
  }

  return result;
}

export function CalendarWorkspace() {
  const calendarRef = useRef<FullCalendarClass | null>(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [activeView, setActiveView] = useState<CalendarViewType>('dayGridMonth');
  const [calendarData, setCalendarData] = useState<CalendarDataState>({
    trimesters: [],
    levels: [],
    groups: [],
    schedules: [],
    holidays: [],
    lessons: [],
    placeholders: [],
    topics: [],
  });
  const [selectedTrimesterId, setSelectedTrimesterId] = useState<string>('all');
  const [selectedLevelId, setSelectedLevelId] = useState<string>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<LessonStatus[]>(() =>
    LESSON_STATUS_OPTIONS.map((option) => option.id)
  );
  const [isBaseLoading, setIsBaseLoading] = useState(true);
  const [isRangeLoading, setIsRangeLoading] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [activeDayDetails, setActiveDayDetails] = useState<ActiveDayDetailsState | null>(null);
  const [dayActionError, setDayActionError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const lastPrefetchedRange = useRef<{ start: string; end: string } | null>(null);
  const latestRequestedRange = useRef<{ key: string; token: number } | null>(null);
  const nextRangeRequestToken = useRef(0);
  const inFlightRangeKeys = useRef(new Set<string>());
  const currentVisibleRange = useRef<{ start: Date; end: Date } | null>(null);
  const lastAutoFocusedDate = useRef<string | null>(null);
  const shouldAutoFocusEarliest = useRef(true);
  const pendingAutoFocusDate = useRef<string | null>(null);
  const calendarWrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipHandlersRef = useRef(
    new WeakMap<HTMLElement, { show: () => void; hide: () => void; click?: (event: MouseEvent) => void }>()
  );
  const tooltipSourceRef = useRef<HTMLElement | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);
  const dayDrawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadStaticCollections = useCallback(async () => {
    setIsBaseLoading(true);
    setBaseError(null);

    try {
      const [trimesters, groups, levels, topics, schedules, holidays] = await Promise.all([
        DataStore.getAll('trimesters'),
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('topics'),
        DataStore.getAll('schedules'),
        DataStore.getAll('holidays'),
      ]);

      setCalendarData((current) => ({
        ...current,
        trimesters,
        groups,
        levels,
        topics,
        schedules,
        holidays,
      }));
      setBaseError(null);
    } catch (error) {
      console.error('Failed to load calendar references', error);
      setBaseError('Unable to load calendar setup data. Please try again.');
      setCalendarData((current) => ({
        ...current,
        trimesters: [],
        groups: [],
        levels: [],
        topics: [],
        schedules: [],
        holidays: [],
      }));
    } finally {
      setIsBaseLoading(false);
    }
  }, []);

  const prefetchRange = useCallback(
    async (startInput: Date, endInput: Date) => {
      const [rangeStart, rangeEnd] =
        startInput.getTime() <= endInput.getTime() ? [startInput, endInput] : [endInput, startInput];
      const inclusiveEnd =
        rangeEnd.getTime() === rangeStart.getTime() ? rangeEnd : addDays(rangeEnd, -1);
      const paddedStart = format(addDays(rangeStart, -RANGE_PADDING_DAYS), ISO_DATE_FORMAT);
      const paddedEnd = format(addDays(inclusiveEnd, RANGE_PADDING_DAYS), ISO_DATE_FORMAT);
      const rangeKey = `${paddedStart}_${paddedEnd}`;

      const requestToken = ++nextRangeRequestToken.current;
      const descriptor = { key: rangeKey, token: requestToken };

      const previous = lastPrefetchedRange.current;
      if (previous && paddedStart >= previous.start && paddedEnd <= previous.end) {
        latestRequestedRange.current = descriptor;
        setRangeError(null);
        setIsRangeLoading(false);
        return;
      }

      if (inFlightRangeKeys.current.has(rangeKey)) {
        return;
      }

      latestRequestedRange.current = descriptor;
      inFlightRangeKeys.current.add(rangeKey);
      setIsRangeLoading(true);
      setRangeError(null);

      try {
        const [lessons, placeholders] = await Promise.all([
          DataStore.getInDateRange('lessons', paddedStart, paddedEnd),
          DataStore.getInDateRange('placeholderSlots', paddedStart, paddedEnd),
        ]);

        if (
          latestRequestedRange.current?.key === rangeKey &&
          latestRequestedRange.current?.token === requestToken
        ) {
          setCalendarData((current) => ({
            ...current,
            lessons,
            placeholders,
          }));
          lastPrefetchedRange.current = { start: paddedStart, end: paddedEnd };
          setRangeError(null);
        }
      } catch (error) {
        if (
          latestRequestedRange.current?.key === rangeKey &&
          latestRequestedRange.current?.token === requestToken
        ) {
          console.error('Failed to load calendar events for range', error);
          setRangeError('Unable to load calendar events for the selected range. Please try again.');
          setCalendarData((current) => ({
            ...current,
            lessons: [],
            placeholders: [],
          }));
        }
      } finally {
        inFlightRangeKeys.current.delete(rangeKey);
        if (
          latestRequestedRange.current?.key === rangeKey &&
          latestRequestedRange.current?.token === requestToken
        ) {
          setIsRangeLoading(false);
        }
      }
    },
    []
  );

  const markManualNavigation = useCallback(() => {
    shouldAutoFocusEarliest.current = false;
    pendingAutoFocusDate.current = null;
  }, []);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setCurrentTitle(arg.view.title);
      setActiveView(arg.view.type as CalendarViewType);
      currentVisibleRange.current = { start: arg.start, end: arg.end };

      if (pendingAutoFocusDate.current) {
        const pendingDate = parseISO(pendingAutoFocusDate.current);
        if (isValid(pendingDate) && pendingDate >= arg.start && pendingDate <= arg.end) {
          pendingAutoFocusDate.current = null;
        }
      }

      void prefetchRange(arg.start, arg.end);
    },
    [prefetchRange]
  );

  const handlePrev = useCallback(() => {
    markManualNavigation();
    calendarRef.current?.getApi().prev();
  }, [markManualNavigation]);

  const handleNext = useCallback(() => {
    markManualNavigation();
    calendarRef.current?.getApi().next();
  }, [markManualNavigation]);

  const handleToday = useCallback(() => {
    markManualNavigation();
    const api = calendarRef.current?.getApi();
    api?.today();
  }, [markManualNavigation]);

  const handleViewChange = useCallback(
    (view: CalendarViewType) => {
      const api = calendarRef.current?.getApi();
      if (!api || api.view.type === view) {
        return;
      }

      markManualNavigation();
      setActiveView(view);
      api.changeView(view);
    },
    [markManualNavigation]
  );

  const handleTrimesterChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedTrimesterId(event.target.value);
  }, []);

  const handleLevelChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedLevelId(event.target.value);
  }, []);

  const handleGroupChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedGroupId(event.target.value);
  }, []);

  const handleStatusToggle = useCallback((status: LessonStatus) => {
    setSelectedStatuses((current) => {
      if (current.includes(status)) {
        return current.filter((item) => item !== status);
      }

      return [...current, status];
    });
  }, []);

  const clearTooltip = useCallback(() => {
    const element = tooltipSourceRef.current;
    if (element) {
      const previous = element.dataset.calendarTooltipPrev ?? '';
      if (previous) {
        element.setAttribute('aria-describedby', previous);
      } else {
        element.removeAttribute('aria-describedby');
      }

      delete element.dataset.calendarTooltipPrev;
      tooltipSourceRef.current = null;
    }

    setActiveTooltip(null);
  }, []);

  useEffect(() => {
    void loadStaticCollections();
  }, [loadStaticCollections]);

  useEffect(() => {
    const handler = (changes: Array<{ table: string | undefined }>) => {
      let shouldReloadStatic = false;
      let shouldRefreshRange = false;

      for (const change of changes) {
        switch (change.table) {
          case 'trimesters':
          case 'groups':
          case 'levels':
          case 'topics':
          case 'schedules':
          case 'holidays':
            shouldReloadStatic = true;
            break;
          case 'placeholderSlots':
          case 'lessons':
            shouldRefreshRange = true;
            break;
          default:
            break;
        }
      }

      if (shouldReloadStatic) {
        void loadStaticCollections();
      }

      if (shouldReloadStatic || shouldRefreshRange) {
        lastPrefetchedRange.current = null;
        latestRequestedRange.current = null;
        const range = currentVisibleRange.current;
        if (range) {
          void prefetchRange(range.start, range.end);
        }
      }
    };

    const rawOn = db.on as unknown;

    const changeEventSource =
      rawOn && typeof rawOn === 'object' && 'changes' in rawOn
        ? (rawOn as {
            changes?: {
              subscribe?: (listener: typeof handler) => void;
              unsubscribe?: (listener: typeof handler) => void;
            };
          }).changes
        : undefined;

    if (changeEventSource && typeof changeEventSource.subscribe === 'function') {
      changeEventSource.subscribe(handler);
      return () => {
        changeEventSource.unsubscribe?.(handler);
      };
    }

    if (typeof rawOn === 'function' && rawOn && 'changes' in rawOn) {
      try {
        const directOn = rawOn as unknown as (eventName: string, subscriber: typeof handler) => void;
        directOn('changes', handler);
      } catch {
        return () => undefined;
      }

      return () => {
        const maybeChanges =
          typeof rawOn === 'function' && rawOn && 'changes' in rawOn
            ? (rawOn as unknown as { changes?: { unsubscribe?: (listener: typeof handler) => void } }).changes
            : undefined;
        maybeChanges?.unsubscribe?.(handler);
      };
    }

    const fallbackCleanups: Array<() => void> = [];
    const tablesToWatch = [
      ['trimesters', db.trimesters.hook],
      ['groups', db.groups.hook],
      ['levels', db.levels.hook],
      ['topics', db.topics.hook],
      ['schedules', db.schedules.hook],
      ['holidays', db.holidays.hook],
      ['placeholderSlots', db.placeholderSlots.hook],
      ['lessons', db.lessons.hook],
    ] as const;

    for (const [table, hooks] of tablesToWatch) {
      if (!hooks) {
        continue;
      }

      const emit = () => {
        handler([{ table }]);
      };

      const subscribeToHook = (
        hook: typeof hooks.creating,
        subscriber: () => void
      ) => {
        const subscribeFn = hook?.subscribe;
        if (typeof subscribeFn !== 'function') {
          return;
        }

        subscribeFn.call(hook, subscriber);
        fallbackCleanups.push(() => {
          try {
            const unsubscribeFn = hook?.unsubscribe;
            if (typeof unsubscribeFn === 'function') {
              unsubscribeFn.call(hook, subscriber);
            }
          } catch (error) {
            console.warn('Failed to remove Dexie table hook listener', error);
          }
        });
      };

      subscribeToHook(hooks.creating, emit);
      subscribeToHook(hooks.updating, emit);
      subscribeToHook(hooks.deleting, emit);
    }

    return () => {
      for (const cleanup of fallbackCleanups) {
        cleanup();
      }
    };
  }, [loadStaticCollections, prefetchRange]);

  useEffect(() => {
    if (selectedTrimesterId === 'all') {
      return;
    }

    const exists = calendarData.trimesters.some((trimester) => trimester.id === selectedTrimesterId);
    if (!exists) {
      setSelectedTrimesterId('all');
    }
  }, [calendarData.trimesters, selectedTrimesterId]);

  useEffect(() => {
    if (selectedLevelId === 'all') {
      return;
    }

    const exists = calendarData.levels.some((level) => level.id === selectedLevelId);
    if (!exists) {
      setSelectedLevelId('all');
    }
  }, [calendarData.levels, selectedLevelId]);

  useEffect(() => {
    if (selectedGroupId === 'all') {
      return;
    }

    const group = calendarData.groups.find((item) => item.id === selectedGroupId);
    if (!group) {
      setSelectedGroupId('all');
      return;
    }

    if (selectedLevelId !== 'all' && group.levelId !== selectedLevelId) {
      setSelectedGroupId('all');
    }
  }, [calendarData.groups, selectedGroupId, selectedLevelId]);

  useEffect(() => {
    lastAutoFocusedDate.current = null;
    shouldAutoFocusEarliest.current = true;
    pendingAutoFocusDate.current = null;
  }, [selectedGroupId, selectedLevelId, selectedTrimesterId]);

  const scheduleSpan = useMemo(() => {
    const span = getActiveTrimesterSpan(calendarData.trimesters);
    if (!span) {
      return null;
    }

    return { start: span.start, end: span.end };
  }, [calendarData.trimesters]);

  const expectedScheduleSlots = useMemo(() => {
    if (!scheduleSpan) {
      return [] as PlaceholderSlot[];
    }

    return getExpectedSlotsForRange(
      calendarData.schedules,
      calendarData.trimesters,
      calendarData.groups,
      calendarData.holidays,
      scheduleSpan.start,
      scheduleSpan.end
    );
  }, [
    calendarData.groups,
    calendarData.holidays,
    calendarData.schedules,
    calendarData.trimesters,
    scheduleSpan,
  ]);

  const availablePlaceholders = useMemo(() => {
    const combined = new Map<string, PlaceholderSlot>();
    const schedulePatterns = new Map<string, Set<string>>();

    for (const slot of expectedScheduleSlots) {
      const key = `${slot.groupId}_${slot.date}_${slot.startTime}_${slot.endTime}`;
      combined.set(key, slot);
    }

    for (const schedule of calendarData.schedules) {
      if (!schedule) continue;
      const patterns = new Set<string>();
      for (const session of schedule.sessions ?? []) {
        if (!session) continue;
        const pattern = `${session.dayOfWeek}_${session.startTime}_${session.endTime}`;
        patterns.add(pattern);
      }
      schedulePatterns.set(schedule.id, patterns);
    }

    for (const slot of calendarData.placeholders) {
      const key = `${slot.groupId}_${slot.date}_${slot.startTime}_${slot.endTime}`;
      const isScheduleDerived = slot.source === 'schedule' || slot.source === 'expected';

      if (isScheduleDerived && schedulePatterns.size > 0) {
        const patterns = schedulePatterns.get(slot.scheduleId);
        const patternKey = `${slot.dayOfWeek}_${slot.startTime}_${slot.endTime}`;

        if (!patterns || !patterns.has(patternKey)) {
          continue;
        }
      }

      combined.set(key, slot);
    }

    return Array.from(combined.values()).sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      if (a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }

      return a.groupId.localeCompare(b.groupId);
    });
  }, [calendarData.placeholders, expectedScheduleSlots]);

  const lessons = calendarData.lessons;

  const earliestScheduledSlotDate = useMemo(
    () =>
      findEarliestScheduledDate(
        calendarData.schedules,
        calendarData.trimesters,
        calendarData.groups,
        calendarData.holidays
      ),
    [
      calendarData.groups,
      calendarData.holidays,
      calendarData.schedules,
      calendarData.trimesters,
    ]
  );

  const groupsById = useMemo(
    () => new Map(calendarData.groups.map((group) => [group.id, group])),
    [calendarData.groups]
  );
  const levelsById = useMemo(
    () => new Map(calendarData.levels.map((level) => [level.id, level])),
    [calendarData.levels]
  );
  const topicsById = useMemo(
    () => new Map(calendarData.topics.map((topic) => [topic.id, topic])),
    [calendarData.topics]
  );
  const selectedStatusSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);

  const lessonMatchesFilters = useCallback(
    (lesson: Lesson) => {
      if (selectedTrimesterId !== 'all' && lesson.trimesterId !== selectedTrimesterId) {
        return false;
      }

      if (selectedGroupId !== 'all' && lesson.groupId !== selectedGroupId) {
        return false;
      }

      const group = groupsById.get(lesson.groupId);
      if (!group) {
        return false;
      }

      if (selectedLevelId !== 'all' && group.levelId !== selectedLevelId) {
        return false;
      }

      if (selectedStatusSet.size > 0 && !selectedStatusSet.has(lesson.status)) {
        return false;
      }

      return true;
    },
    [groupsById, selectedGroupId, selectedLevelId, selectedStatusSet, selectedTrimesterId]
  );

  const placeholderMatchesFilters = useCallback(
    (slot: PlaceholderSlot) => {
      if (selectedTrimesterId !== 'all' && slot.trimesterId !== selectedTrimesterId) {
        return false;
      }

      if (selectedGroupId !== 'all' && slot.groupId !== selectedGroupId) {
        return false;
      }

      const group = groupsById.get(slot.groupId);
      if (!group) {
        return false;
      }

      if (selectedLevelId !== 'all' && group.levelId !== selectedLevelId) {
        return false;
      }

      return true;
    },
    [groupsById, selectedGroupId, selectedLevelId, selectedTrimesterId]
  );

  useEffect(() => {
    if (!lessons.length && !availablePlaceholders.length && !earliestScheduledSlotDate) {
      return;
    }

    const allDates: string[] = [];
    for (const lesson of lessons) {
      if (lesson.date) {
        allDates.push(lesson.date);
      }
    }
    for (const slot of availablePlaceholders) {
      if (slot.date) {
        allDates.push(slot.date);
      }
    }

    if (earliestScheduledSlotDate) {
      allDates.push(earliestScheduledSlotDate);
    }

    if (allDates.length === 0) {
      return;
    }

    const earliestDate = allDates.reduce<string | null>((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return current < earliest ? current : earliest;
    }, null);

    if (!earliestDate || earliestDate === lastAutoFocusedDate.current) {
      if (!shouldAutoFocusEarliest.current && earliestDate) {
        lastAutoFocusedDate.current = earliestDate;
      }
      return;
    }

    const target = parseISO(earliestDate);
    if (!isValid(target)) {
      lastAutoFocusedDate.current = earliestDate;
      return;
    }

    const range = currentVisibleRange.current;
    if (range && target >= range.start && target <= range.end) {
      lastAutoFocusedDate.current = earliestDate;
      return;
    }

    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }

    if (!shouldAutoFocusEarliest.current) {
      lastAutoFocusedDate.current = earliestDate;
      return;
    }

    pendingAutoFocusDate.current = earliestDate;
    api.gotoDate(target);
    void prefetchRange(target, target);
    lastAutoFocusedDate.current = earliestDate;
    shouldAutoFocusEarliest.current = false;
  }, [availablePlaceholders, earliestScheduledSlotDate, lessons, prefetchRange]);

  useEffect(() => {
    if (activeView === 'dayGridMonth') {
      clearTooltip();
    }
  }, [activeView, clearTooltip]);

  useEffect(() => {
    const handleDismiss = () => {
      clearTooltip();
    };

    window.addEventListener('resize', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);

    return () => {
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [clearTooltip]);

  const trimesterOptions = useMemo(
    () => [
      { id: 'all', label: 'All trimesters' },
      ...calendarData.trimesters.map((trimester) => ({
        id: trimester.id,
        label: trimester.name,
      })),
    ],
    [calendarData.trimesters]
  );

  const levelOptions = useMemo(
    () => [
      { id: 'all', label: 'All levels' },
      ...calendarData.levels.map((level) => ({
        id: level.id,
        label: `Grade ${level.gradeNumber} • ${level.subject}`,
      })),
    ],
    [calendarData.levels]
  );

  const groupOptions = useMemo(() => {
    const groupsForLevel =
      selectedLevelId === 'all'
        ? calendarData.groups
        : calendarData.groups.filter((group) => group.levelId === selectedLevelId);

    return [
      { id: 'all', label: selectedLevelId === 'all' ? 'All groups' : 'All groups in level' },
      ...groupsForLevel.map((group) => ({ id: group.id, label: group.displayName })),
    ];
  }, [calendarData.groups, selectedLevelId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const role = target.getAttribute('role');
        if (
          target.isContentEditable ||
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          role === 'textbox'
        ) {
          return;
        }
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (!event.shiftKey && event.key === '[') {
        event.preventDefault();
        handlePrev();
        return;
      }

      if (!event.shiftKey && event.key === ']') {
        event.preventDefault();
        handleNext();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 't') {
        event.preventDefault();
        handleToday();
        return;
      }

      if (key === 'm') {
        event.preventDefault();
        handleViewChange('dayGridMonth');
        return;
      }

      if (key === 'w') {
        event.preventDefault();
        handleViewChange('timeGridWeek');
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        handleViewChange('timeGridDay');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNext, handlePrev, handleToday, handleViewChange]);

  const filteredEvents = useMemo<EventInput[]>(() => {
    const lessonsMatchingFilters = calendarData.lessons.filter(lessonMatchesFilters);

    const { events: lessonEvents } = createLessonEvents(
      lessonsMatchingFilters,
      groupsById,
      levelsById,
      topicsById
    );

    const { lessonKeys } = createLessonEvents(
      calendarData.lessons,
      groupsById,
      levelsById,
      topicsById
    );

    const placeholdersMatchingFilters = availablePlaceholders.filter(placeholderMatchesFilters);

    const placeholderEvents = createPlaceholderEvents(
      placeholdersMatchingFilters,
      groupsById,
      levelsById,
      lessonKeys
    );

    return [...lessonEvents, ...placeholderEvents];
  }, [
    availablePlaceholders,
    calendarData.lessons,
    groupsById,
    lessonMatchesFilters,
    levelsById,
    placeholderMatchesFilters,
    topicsById,
  ]);

  const dayDetailEntries = useMemo<DayDetailEntry[] | null>(() => {
    if (!activeDayDetails) {
      return null;
    }

    const { date } = activeDayDetails;
    const entries: DayDetailEntry[] = [];

    for (const lesson of calendarData.lessons) {
      if (lesson.date !== date) {
        continue;
      }

      if (!lessonMatchesFilters(lesson)) {
        continue;
      }

      const group = groupsById.get(lesson.groupId);
      const level = group ? levelsById.get(group.levelId) : undefined;
      const topic = topicsById.get(lesson.topicId);
      const accentColor = topic?.color ?? level?.color ?? DEFAULT_ACCENT;
      const timeLabel = formatTimeRange(lesson.startTime, lesson.endTime) || 'Time not set';
      const levelLabel = level
        ? `Grade ${level.gradeNumber} ${level.subject}`
        : group
        ? 'Unassigned level'
        : null;

      entries.push({
        kind: 'lesson',
        id: lesson.id,
        title: topic?.name ?? 'Untitled lesson',
        subtitle: group?.displayName ?? 'Unknown group',
        levelLabel,
        timeLabel,
        statusLabel: titleCaseStatus(lesson.status),
        accentColor,
        startSortKey: lesson.startTime ?? '99:99',
        deleteLabel: 'Delete lesson',
        canDelete: true,
        lesson,
      });
    }

    for (const slot of availablePlaceholders) {
      if (slot.date !== date) {
        continue;
      }

      if (!placeholderMatchesFilters(slot)) {
        continue;
      }

      const group = groupsById.get(slot.groupId);
      const level = group ? levelsById.get(group.levelId) : undefined;
      const accentColor = level?.color ?? DEFAULT_ACCENT;
      const timeLabel = formatTimeRange(slot.startTime, slot.endTime) || 'Time not set';
      const levelLabel = level
        ? `Grade ${level.gradeNumber} ${level.subject}`
        : group
        ? 'Unassigned level'
        : null;
      const statusLabel =
        slot.source === 'schedule'
          ? 'From schedule plan'
          : slot.source === 'expected'
          ? 'Projected from recurrence'
          : null;

      entries.push({
        kind: 'placeholder',
        id: slot.id,
        title:
          slot.source === 'schedule' || slot.source === 'expected'
            ? 'Scheduled session'
            : 'Placeholder slot',
        subtitle: group?.displayName ?? 'Unknown group',
        levelLabel,
        timeLabel,
        statusLabel,
        accentColor,
        startSortKey: slot.startTime ?? '99:99',
        deleteLabel: slot.source === 'schedule' ? 'Skip this session' : 'Remove placeholder',
        canDelete: slot.source !== 'expected',
        placeholderSource: slot.source,
        slot,
      });
    }

    return entries.sort((a, b) => {
      if (a.startSortKey !== b.startSortKey) {
        return a.startSortKey.localeCompare(b.startSortKey);
      }

      if (a.subtitle !== b.subtitle) {
        return a.subtitle.localeCompare(b.subtitle);
      }

      return a.title.localeCompare(b.title);
    });
  }, [
    activeDayDetails,
    availablePlaceholders,
    calendarData.lessons,
    groupsById,
    lessonMatchesFilters,
    levelsById,
    placeholderMatchesFilters,
    topicsById,
  ]);

  useEffect(() => {
    if (!activeTooltip) {
      return;
    }

    const stillVisible = filteredEvents.some((event) => event.id === activeTooltip.eventId);
    if (!stillVisible) {
      clearTooltip();
    }
  }, [activeTooltip, filteredEvents, clearTooltip]);

  useEffect(() => {
    if (activeDayDetails && dayDrawerCloseButtonRef.current) {
      dayDrawerCloseButtonRef.current.focus();
    }
  }, [activeDayDetails]);

  const hasAnyData = calendarData.lessons.length > 0 || availablePlaceholders.length > 0;
  const loadError = baseError ?? rangeError;
  const isLoading = (isBaseLoading || isRangeLoading) && loadError === null;

  const renderEventContent = useCallback(
    (arg: EventContentArg) => {
      if (activeView !== 'dayGridMonth') {
        return undefined;
      }

      const { event } = arg;
      const kind = (event.extendedProps.kind as string | undefined) ?? 'lesson';
      const lessonStatusLabel = event.extendedProps.statusLabel as string | undefined;
      const groupName = event.extendedProps.groupName as string | undefined;
      const topicName = event.extendedProps.topicName as string | undefined;
      const startTime = event.extendedProps.startTime as string | undefined;
      const endTime = event.extendedProps.endTime as string | undefined;
      const placeholderLabel = event.extendedProps.placeholderLabel as string | undefined;
      const placeholderSource = event.extendedProps.placeholderSource as
        | 'expected'
        | 'schedule'
        | undefined;
      const timeLabel = formatTimeRange(startTime, endTime);
      const accentColor =
        (event.extendedProps.accentColor as string | undefined) ?? event.backgroundColor ?? DEFAULT_ACCENT;

      const label =
        kind === 'lesson'
          ? `${groupName ?? 'Lesson'}${topicName ? ` • ${topicName}` : ''}`
          : `${groupName ?? 'Group'} • ${placeholderLabel ?? 'Slot'}`;

      const tooltipParts = [label];
      if (timeLabel) {
        tooltipParts.push(timeLabel);
      }
      if (kind === 'lesson' && lessonStatusLabel) {
        tooltipParts.push(lessonStatusLabel);
      } else if (kind === 'placeholder' && placeholderLabel) {
        tooltipParts.push(placeholderLabel);
      }

      const tooltip = tooltipParts.join(' • ');
      const backgroundColor = event.backgroundColor ?? 'rgba(148, 163, 184, 0.15)';
      const borderColor = event.borderColor ?? 'rgba(148, 163, 184, 0.25)';
      const textColor = event.textColor ?? '#e2e8f0';

      const indicatorHtml = `<span class="fc-month-chip-indicator" style="background:${accentColor};"></span>`;
      const labelHtml = `<span class="fc-month-chip-label">${escapeHtml(label)}</span>`;
      const timeHtml = timeLabel ? `<span class="fc-month-chip-time">${escapeHtml(timeLabel)}</span>` : '';
      const statusHtml =
        kind === 'lesson'
          ? lessonStatusLabel
            ? `<span class="fc-month-chip-status">${escapeHtml(lessonStatusLabel)}</span>`
            : ''
          : placeholderLabel
            ? `<span class="fc-month-chip-status">${escapeHtml(placeholderLabel)}</span>`
            : '';

      const chipClasses = ['fc-month-chip'];
      if (kind === 'lesson') {
        chipClasses.push('fc-month-chip-lesson');
      } else {
        chipClasses.push('fc-month-chip-placeholder');
        chipClasses.push(
          placeholderSource === 'expected'
            ? 'fc-month-chip-placeholder-expected'
            : 'fc-month-chip-placeholder-saved'
        );
      }

      const html = `<div class="${chipClasses.join(' ')}" style="background:${backgroundColor};border-color:${borderColor};color:${textColor};" title="${escapeHtml(tooltip)}">${indicatorHtml}${labelHtml}${timeHtml}${statusHtml}</div>`;

      return { html };
    },
    [activeView]
  );

  const renderMoreLinkContent = useCallback(
    (arg: MoreLinkContentArg) => {
      if (activeView !== 'dayGridMonth') {
        return arg.text;
      }

      return `+${arg.num} more`;
    },
    [activeView]
  );

  const openDayDetails = useCallback((inputDate: string | undefined, eventId?: string | null) => {
    if (!inputDate) {
      return;
    }

    let normalized = inputDate.slice(0, 10);
    const parsed = parseISO(inputDate);
    if (isValid(parsed)) {
      normalized = format(startOfDay(parsed), ISO_DATE_FORMAT);
    }

    setActiveDayDetails({ date: normalized, initialEventId: eventId ?? null });
    setDayActionError(null);
    setPendingDeleteId(null);
  }, []);

  const closeDayDetails = useCallback(() => {
    setActiveDayDetails(null);
    setDayActionError(null);
    setPendingDeleteId(null);
  }, []);

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      arg.jsEvent.preventDefault();
      clearTooltip();
      const dateProp = (arg.event.extendedProps.date as string | undefined) ?? arg.event.startStr;
      openDayDetails(dateProp, arg.event.id);
    },
    [clearTooltip, openDayDetails]
  );

  const handleDateClick = useCallback(
    (arg: DateClickArg) => {
      markManualNavigation();
      const isoDate = format(startOfDay(arg.date), ISO_DATE_FORMAT);
      openDayDetails(isoDate);
    },
    [markManualNavigation, openDayDetails]
  );

  const handleMoreLinkClick = useCallback(
    (arg: MoreLinkArg) => {
      clearTooltip();
      const isoDate = format(startOfDay(arg.date), ISO_DATE_FORMAT);
      openDayDetails(isoDate);
      return 'none';
    },
    [clearTooltip, openDayDetails]
  );

  const handleDeleteEntry = useCallback(
    async (entry: DayDetailEntry) => {
      if (!entry.canDelete) {
        return;
      }

      const confirmationMessage =
        entry.kind === 'lesson'
          ? 'Delete this lesson? This action cannot be undone.'
          : entry.placeholderSource === 'schedule'
          ? 'Skip this scheduled session? It will no longer appear on the calendar.'
          : 'Remove this placeholder slot?';

      const confirmed = window.confirm(confirmationMessage);
      if (!confirmed) {
        return;
      }

      try {
        setPendingDeleteId(entry.id);
        setDayActionError(null);

        if (entry.kind === 'lesson') {
          await DataStore.remove('lessons', entry.id);
        } else {
          await DataStore.remove('placeholderSlots', entry.id);
        }
      } catch (error) {
        console.error('Failed to delete calendar entry', error);
        setDayActionError('Unable to delete this entry. Please try again.');
      } finally {
        setPendingDeleteId(null);
      }
    },
    []
  );

  const handleEventDidMount = useCallback(
    (arg: EventMountArg) => {
      const { event, el } = arg;
      const rawKind = event.extendedProps.kind as string | undefined;
      const kind: 'lesson' | 'placeholder' = rawKind === 'placeholder' ? 'placeholder' : 'lesson';
      const groupName = (event.extendedProps.groupName as string | undefined) ?? 'Unknown group';
      const topicName = event.extendedProps.topicName as string | undefined;
      const lessonStatusLabel = (event.extendedProps.statusLabel as string | undefined) ?? null;
      const placeholderLabel = event.extendedProps.placeholderLabel as string | undefined;
      const placeholderSource = event.extendedProps.placeholderSource as
        | 'expected'
        | 'schedule'
        | undefined;
      const startTime = event.extendedProps.startTime as string | undefined;
      const endTime = event.extendedProps.endTime as string | undefined;
      const timeLabel = formatTimeRange(startTime, endTime);
      const accentColor =
        (event.extendedProps.accentColor as string | undefined) ??
        event.backgroundColor ??
        DEFAULT_ACCENT;

      const title =
        kind === 'lesson'
          ? topicName ?? 'Untitled lesson'
          : placeholderLabel ?? (placeholderSource === 'expected' ? 'Scheduled session' : 'Placeholder slot');
      const subtitle = kind === 'lesson' ? groupName : groupName;
      const computedStatusLabel =
        kind === 'lesson'
          ? lessonStatusLabel
          : placeholderLabel ?? (placeholderSource === 'expected' ? 'Scheduled session' : null);

      const fallbackParts = [title];
      if (subtitle) {
        fallbackParts.push(subtitle);
      }
      if (timeLabel) {
        fallbackParts.push(timeLabel);
      }
      if (computedStatusLabel && computedStatusLabel !== title && computedStatusLabel !== subtitle) {
        fallbackParts.push(computedStatusLabel);
      }
      el.setAttribute('title', fallbackParts.join(' • '));

      const show = () => {
        const wrapper = calendarWrapperRef.current;
        if (!wrapper) {
          return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        const eventRect = el.getBoundingClientRect();
        const centerX = eventRect.left - wrapperRect.left + eventRect.width / 2;
        const preferTop = eventRect.top > window.innerHeight / 2;
        const placement: TooltipPlacement = preferTop ? 'top' : 'bottom';
        const referenceTop =
          placement === 'top'
            ? eventRect.top - wrapperRect.top
            : eventRect.bottom - wrapperRect.top;

        const previousSource = tooltipSourceRef.current;
        if (previousSource && previousSource !== el) {
          const previousDescriptor = previousSource.dataset.calendarTooltipPrev ?? '';
          if (previousDescriptor) {
            previousSource.setAttribute('aria-describedby', previousDescriptor);
          } else {
            previousSource.removeAttribute('aria-describedby');
          }
          delete previousSource.dataset.calendarTooltipPrev;
        }

        const existingDescriptor = el.getAttribute('aria-describedby') ?? '';
        const baseDescriptors = existingDescriptor
          .split(' ')
          .map((item) => item.trim())
          .filter((item) => item && item !== 'calendar-event-tooltip');
        el.dataset.calendarTooltipPrev = baseDescriptors.join(' ');
        const nextDescriptor = [...baseDescriptors, 'calendar-event-tooltip'].join(' ').trim();
        el.setAttribute('aria-describedby', nextDescriptor || 'calendar-event-tooltip');
        tooltipSourceRef.current = el;

        setActiveTooltip({
          eventId: event.id,
          kind,
          title,
          subtitle,
          timeLabel: timeLabel || null,
          statusLabel: computedStatusLabel,
          accentColor,
          top: referenceTop,
          left: centerX,
          placement,
        });
      };

      const hide = () => {
        if (tooltipSourceRef.current === el) {
          clearTooltip();
        }
      };

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        if (tooltipSourceRef.current === el) {
          hide();
        } else {
          show();
        }
      };

      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
      el.addEventListener('click', handleClick);

      tooltipHandlersRef.current.set(el, { show, hide, click: handleClick });
    },
    [clearTooltip]
  );

  const handleEventWillUnmount = useCallback(
    (arg: EventMountArg) => {
      const handlers = tooltipHandlersRef.current.get(arg.el);
      if (handlers) {
        arg.el.removeEventListener('mouseenter', handlers.show);
        arg.el.removeEventListener('mouseleave', handlers.hide);
        arg.el.removeEventListener('focus', handlers.show);
        arg.el.removeEventListener('blur', handlers.hide);
        if (handlers.click) {
          arg.el.removeEventListener('click', handlers.click);
        }
        tooltipHandlersRef.current.delete(arg.el);
      }

      if (tooltipSourceRef.current === arg.el) {
        clearTooltip();
      }
    },
    [clearTooltip]
  );

  const moreLinkClassNames = useMemo(() => (activeView === 'dayGridMonth' ? ['fc-more-chip'] : []), [activeView]);
  const dayMaxEventsValue: number | boolean = activeView === 'dayGridMonth' ? 3 : false;
  const dayMaxEventRowsValue: number | boolean = activeView === 'dayGridMonth' ? 3 : false;

  return (
    <section
      aria-labelledby="calendar-workspace-heading"
      aria-describedby="calendar-workspace-description calendar-workspace-shortcuts"
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
            <p id="calendar-workspace-description" className="text-sm text-slate-400">
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
      <p id="calendar-workspace-shortcuts" className="sr-only">
        Keyboard shortcuts: press T for today, [ and ] to move between periods, and M, W, or D to switch views.
      </p>
      <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-white/10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <span>Trimester</span>
            <select
              value={selectedTrimesterId}
              onChange={handleTrimesterChange}
              className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {trimesterOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-slate-900 text-slate-100">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <span>Level</span>
            <select
              value={selectedLevelId}
              onChange={handleLevelChange}
              className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {levelOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-slate-900 text-slate-100">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <span>Group</span>
            <select
              value={selectedGroupId}
              onChange={handleGroupChange}
              className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {groupOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-slate-900 text-slate-100">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Lesson status
            </legend>
            <div className="flex flex-wrap gap-2">
              {LESSON_STATUS_OPTIONS.map((option) => {
                const isActive = selectedStatuses.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleStatusToggle(option.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isActive
                        ? 'bg-accent/20 text-accent shadow-[0_0_0_1px_rgba(99,102,241,0.45)]'
                        : 'border border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:text-white'
                    }`}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>
      {isLoading ? (
        <p className="rounded-2xl bg-surface/60 p-4 text-sm text-slate-300 ring-1 ring-white/10">
          Loading calendar events…
        </p>
      ) : loadError ? (
        <p className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/40">
          {loadError}
        </p>
      ) : filteredEvents.length === 0 ? (
        <p className="rounded-2xl bg-surface/60 p-4 text-sm text-slate-400 ring-1 ring-white/10">
          {hasAnyData
            ? 'No calendar events match the current filters.'
            : 'No calendar events to show yet. Configure schedules or lessons to populate this view.'}
        </p>
      ) : null}
      <div ref={calendarWrapperRef} className="relative rounded-2xl bg-surface/60 p-4 ring-1 ring-white/10">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="auto"
          weekends
          expandRows
          dayMaxEvents={dayMaxEventsValue}
          dayMaxEventRows={dayMaxEventRowsValue}
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="18:00:00"
          datesSet={handleDatesSet}
          events={filteredEvents}
          eventDisplay="block"
          eventContent={renderEventContent}
          moreLinkContent={renderMoreLinkContent}
          moreLinkClassNames={moreLinkClassNames}
          eventDidMount={handleEventDidMount}
          eventWillUnmount={handleEventWillUnmount}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          moreLinkClick={handleMoreLinkClick}
        />
        {activeTooltip ? (
          <div
            id="calendar-event-tooltip"
            role="tooltip"
            className={`calendar-tooltip ${
              activeTooltip.kind === 'lesson'
                ? 'calendar-tooltip-lesson'
                : 'calendar-tooltip-placeholder'
            }`}
            data-placement={activeTooltip.placement}
            style={{
              top: activeTooltip.top,
              left: activeTooltip.left,
              transform:
                activeTooltip.placement === 'top'
                  ? 'translate(-50%, calc(-100% - 12px))'
                  : 'translate(-50%, 12px)',
            }}
          >
            <span
              className="calendar-tooltip-indicator"
              style={{ backgroundColor: activeTooltip.accentColor }}
            />
            <div className="calendar-tooltip-body">
              <p className="calendar-tooltip-title">{activeTooltip.title}</p>
              <p className="calendar-tooltip-subtitle">{activeTooltip.subtitle}</p>
              <div className="calendar-tooltip-meta">
                {activeTooltip.timeLabel ? (
                  <span>{activeTooltip.timeLabel}</span>
                ) : null}
                {activeTooltip.statusLabel ? (
                  <span>{activeTooltip.statusLabel}</span>
                ) : null}
              </div>
            </div>
            <span
              className={`calendar-tooltip-arrow ${
                activeTooltip.placement === 'top'
                  ? 'calendar-tooltip-arrow-bottom'
                  : 'calendar-tooltip-arrow-top'
              }`}
            />
          </div>
        ) : null}
      </div>
      {activeDayDetails ? (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            aria-label="Close day details"
            className="flex-1 bg-slate-950/60 backdrop-blur-sm"
            onClick={closeDayDetails}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-drawer-title"
            className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-6 border-b border-white/10 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm uppercase tracking-wide text-accent/80">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  {(() => {
                    const parsed = parseISO(activeDayDetails.date);
                    return isValid(parsed)
                      ? format(parsed, 'EEEE, MMMM d, yyyy')
                      : activeDayDetails.date;
                  })()}
                </div>
                <h3 id="calendar-day-drawer-title" className="text-2xl font-semibold text-white">
                  Day overview
                </h3>
                <p className="text-sm text-slate-400">
                  Review lessons and scheduled sessions for this day. Delete options remove only the
                  selected occurrence.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeDayDetails}
                  ref={dayDrawerCloseButtonRef}
                  className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {dayActionError ? (
                <p className="mb-4 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/40">
                  {dayActionError}
                </p>
              ) : null}
              {dayDetailEntries && dayDetailEntries.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {dayDetailEntries.map((entry) => {
                    const isHighlighted =
                      activeDayDetails.initialEventId &&
                      activeDayDetails.initialEventId === entry.id;
                    return (
                      <li key={`${entry.kind}_${entry.id}`}>
                        <article
                          className={`group relative overflow-hidden rounded-2xl border bg-white/5 p-4 transition hover:border-accent/50 ${
                            isHighlighted
                              ? 'border-accent/70 bg-accent/10 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
                              : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <span
                              aria-hidden
                              className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                              style={{ backgroundColor: entry.accentColor }}
                            >
                              {entry.kind === 'lesson' ? 'L' : 'S'}
                            </span>
                            <div className="flex-1 space-y-2">
                              <div>
                                <p className="text-sm font-semibold uppercase tracking-wide text-accent/80">
                                  {entry.kind === 'lesson' ? 'Lesson' : 'Session'}
                                </p>
                                <h4 className="text-lg font-semibold text-white">{entry.title}</h4>
                                <p className="text-sm text-slate-300">{entry.subtitle}</p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                  <Clock className="h-3.5 w-3.5" aria-hidden />
                                  {entry.timeLabel}
                                </span>
                                {entry.levelLabel ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                    {entry.levelLabel}
                                  </span>
                                ) : null}
                                {entry.statusLabel ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                    {entry.statusLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {entry.canDelete ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                  onClick={() => handleDeleteEntry(entry)}
                                  disabled={pendingDeleteId === entry.id}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  {pendingDeleteId === entry.id ? 'Removing…' : entry.deleteLabel}
                                </button>
                              ) : (
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  From schedule pattern
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 bg-surface/40 p-6 text-center text-sm text-slate-300">
                  No lessons or sessions scheduled for this day yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
