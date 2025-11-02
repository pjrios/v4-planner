import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
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
  ActivityTemplate,
  Group,
  Holiday,
  Lesson,
  LessonPhase,
  LessonStatus,
  LessonPhaseType,
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
  templates: ActivityTemplate[];
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

type DayDetailLessonPreview = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  statusLabel: string | null;
  accentColor: string;
};

type EditingLessonState = {
  lesson: Lesson;
  status: LessonStatus;
  slot: PlaceholderSlot | null;
  objectives: string;
  instructions: string;
  reflection: string;
  notes: string;
};

type LessonEditField = Exclude<keyof EditingLessonState, 'lesson' | 'slot'>;

type DayDetailTemplatePreview = {
  id: string;
  name: string;
  phaseLabel: string;
  summary: string | null;
};

type DayDetailLessonEntry = {
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
  objectives: string[];
  instructions: string | null;
  reflection: string | null;
  completionNotes: string | null;
};

type DayDetailPlaceholderEntry = {
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
  relatedLesson: DayDetailLessonPreview | null;
  templatePreview: DayDetailTemplatePreview | null;
  group: Group | null;
  level: Level | null;
  availableTopics: Topic[];
};

type DayDetailEntry = DayDetailLessonEntry | DayDetailPlaceholderEntry;

type QuickLessonDraftState = {
  slotId: string;
  topicId: string;
  status: LessonStatus;
  focus: string;
  activityNotes: string;
  studySuggestion: string;
};

type QuickLessonDraftField = keyof Omit<QuickLessonDraftState, 'slotId'>;

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

function formatDateLabel(date: string | undefined | null) {
  if (!date) {
    return '';
  }

  const parsed = parseISO(date);
  if (!isValid(parsed)) {
    return date;
  }

  return format(parsed, 'EEE, MMM d');
}

function parseObjectivesList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPhase(
  base: LessonPhase | undefined,
  updates: Partial<LessonPhase>
): LessonPhase | undefined {
  const next: Record<string, unknown> = { ...(base ?? {}) };

  for (const [key, rawValue] of Object.entries(updates)) {
    const typedKey = key as keyof LessonPhase;
    const value = rawValue as LessonPhase[typeof typedKey];

    if (Array.isArray(value)) {
      const filtered = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item.length > 0);

      if (filtered.length > 0) {
        next[typedKey as string] = filtered;
      } else {
        delete next[typedKey as string];
      }
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        next[typedKey as string] = trimmed;
      } else {
        delete next[typedKey as string];
      }
      continue;
    }

    if (value === undefined || value === null) {
      delete next[typedKey as string];
      continue;
    }

    next[typedKey as string] = value as unknown;
  }

  return Object.keys(next).length > 0 ? (next as LessonPhase) : undefined;
}

function formatTemplatePhase(phase: LessonPhaseType) {
  switch (phase) {
    case 'pre':
      return 'Pre-activity';
    case 'while':
      return 'During lesson';
    case 'post':
      return 'Post-activity';
    default:
      return phase;
  }
}

function summarizeTemplate(template: ActivityTemplate) {
  const entries = Object.entries(template.fields ?? {});
  if (entries.length === 0) {
    return null;
  }

  const parts = entries.slice(0, 2).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.slice(0, 3).join(', ')}`;
    }

    if (value && typeof value === 'object') {
      return `${key}: …`;
    }

    return `${key}: ${String(value)}`;
  });

  return parts.join(' • ');
}

function parseTimeToMinutes(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
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

function formatOrdinalGrade(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let suffix = 'th';

  if (mod10 === 1 && mod100 !== 11) {
    suffix = 'st';
  } else if (mod10 === 2 && mod100 !== 12) {
    suffix = 'nd';
  } else if (mod10 === 3 && mod100 !== 13) {
    suffix = 'rd';
  }

  return `${value}${suffix}`;
}

function buildLevelGroupLabel(level: Level | undefined, group: Group | undefined) {
  const gradeLabel = formatOrdinalGrade(level?.gradeNumber ?? undefined);

  if (gradeLabel) {
    const letter = group?.letter ? ` ${group.letter}` : '';
    return `${gradeLabel}${letter}`.trim();
  }

  if (group?.displayName) {
    return group.displayName;
  }

  return 'Class';
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
        levelGroupLabel: buildLevelGroupLabel(level, group),
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
        levelGroupLabel: buildLevelGroupLabel(level, group),
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
    templates: [],
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
  const [editingPlaceholder, setEditingPlaceholder] = useState<
    { id: string; startTime: string; endTime: string }
  | null>(null);
  const [editingLesson, setEditingLesson] = useState<EditingLessonState | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const [focusedDayEntryId, setFocusedDayEntryId] = useState<string | null>(null);
  const [creatingLessonDraft, setCreatingLessonDraft] = useState<QuickLessonDraftState | null>(null);
  const [createLessonError, setCreateLessonError] = useState<string | null>(null);
  const [isCreatingLesson, setIsCreatingLesson] = useState(false);
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
  const dayDrawerScrollRef = useRef<HTMLDivElement | null>(null);
  const dayEntryRefs = useRef(new Map<string, HTMLLIElement>());

  const loadStaticCollections = useCallback(async () => {
    setIsBaseLoading(true);
    setBaseError(null);

    try {
      const [trimesters, groups, levels, topics, schedules, holidays, templates] = await Promise.all([
        DataStore.getAll('trimesters'),
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('topics'),
        DataStore.getAll('schedules'),
        DataStore.getAll('holidays'),
        DataStore.getAll('templates'),
      ]);

      setCalendarData((current) => ({
        ...current,
        trimesters,
        groups,
        levels,
        topics,
        schedules,
        holidays,
        templates,
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
        templates: [],
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
          case 'templates':
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
      ['templates', db.templates.hook],
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

  const placeholderById = useMemo(
    () => new Map(calendarData.placeholders.map((slot) => [slot.id, slot])),
    [calendarData.placeholders]
  );

  const placeholderKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of calendarData.placeholders) {
      const key = `${slot.groupId}_${slot.date}_${slot.startTime}_${slot.endTime}`;
      map.set(key, slot.id);
    }
    return map;
  }, [calendarData.placeholders]);

  const resolveLessonSlot = useCallback(
    (lesson: Lesson) => {
      if (lesson.placeholderId) {
        const direct = placeholderById.get(lesson.placeholderId);
        if (direct) {
          return direct;
        }
      }

      const fallbackKey = `${lesson.groupId}_${lesson.date}_${lesson.startTime}_${lesson.endTime}`;
      const fallbackId = placeholderKeyMap.get(fallbackKey);
      return fallbackId ? placeholderById.get(fallbackId) ?? null : null;
    },
    [placeholderById, placeholderKeyMap]
  );

  const lessonsBySlotKey = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of calendarData.lessons) {
      if (!lesson) continue;
      const key = `${lesson.groupId}_${lesson.date}_${lesson.startTime}_${lesson.endTime}`;
      const current = map.get(key);
      if (current) {
        current.push(lesson);
      } else {
        map.set(key, [lesson]);
      }
    }
    return map;
  }, [calendarData.lessons]);

  const lessonsByGroupAndDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of calendarData.lessons) {
      if (!lesson) continue;
      const key = `${lesson.groupId}_${lesson.date}`;
      const current = map.get(key);
      if (current) {
        current.push(lesson);
      } else {
        map.set(key, [lesson]);
      }
    }
    return map;
  }, [calendarData.lessons]);

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

  const filteredEvents = useMemo((): EventInput[] => {
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
        relatedLesson,
        templatePreview,
        group: group ?? null,
        level: level ?? null,
        availableTopics,
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

  const dayDetailEntries = useMemo((): DayDetailEntry[] | null => {
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
      const slot = resolveLessonSlot(lesson);
      const slotTimeLabel = formatTimeRange(slot?.startTime, slot?.endTime);
      const timeLabel = slotTimeLabel || 'Time not set';
      const levelLabel = level
        ? `Grade ${level.gradeNumber} ${level.subject}`
        : group
        ? 'Unassigned level'
        : null;
      const objectives = [
        ...(lesson.preActivity?.objectives ?? []),
        ...(lesson.whileActivity?.objectives ?? []),
        ...(lesson.postActivity?.objectives ?? []),
      ];
      const instructions = lesson.whileActivity?.instructions ?? null;
      const reflection = lesson.postActivity?.reflection ?? null;
      const completionNotes = lesson.completionNotes ?? null;

      entries.push({
        kind: 'lesson',
        id: lesson.id,
        title: topic?.name ?? 'Untitled lesson',
        subtitle: group?.displayName ?? 'Unknown group',
        levelLabel,
        timeLabel,
        statusLabel: titleCaseStatus(lesson.status),
        accentColor,
        startSortKey: slot?.startTime ?? lesson.startTime ?? '99:99',
        deleteLabel: 'Delete lesson',
        canDelete: true,
        lesson,
        objectives,
        instructions,
        reflection,
        completionNotes,
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

      const slotKey = `${slot.groupId}_${slot.date}_${slot.startTime}_${slot.endTime}`;
      const matchingLessons = lessonsBySlotKey.get(slotKey) ?? [];
      const groupDayKey = `${slot.groupId}_${slot.date}`;
      const fallbackLessons = lessonsByGroupAndDate.get(groupDayKey) ?? [];
      const relatedLessonRaw = matchingLessons[0] ?? fallbackLessons[0] ?? null;

      let relatedLesson: DayDetailLessonPreview | null = null;
      if (relatedLessonRaw) {
        const relatedGroup = groupsById.get(relatedLessonRaw.groupId) ?? group;
        const relatedLevel = relatedGroup ? levelsById.get(relatedGroup.levelId) : level;
        const relatedTopic = topicsById.get(relatedLessonRaw.topicId);
        const relatedAccent = relatedTopic?.color ?? relatedLevel?.color ?? accentColor;
        const relatedSlot = resolveLessonSlot(relatedLessonRaw);
        const relatedTime =
          formatTimeRange(relatedSlot?.startTime, relatedSlot?.endTime) ||
          formatTimeRange(relatedLessonRaw.startTime, relatedLessonRaw.endTime) ||
          'Time not set';

        relatedLesson = {
          id: relatedLessonRaw.id,
          title: relatedTopic?.name ?? 'Untitled lesson',
          subtitle: relatedGroup?.displayName ?? 'Unknown group',
          statusLabel: titleCaseStatus(relatedLessonRaw.status),
          timeLabel: relatedTime,
          accentColor: relatedAccent,
        } as DayDetailLessonPreview;
      }

      let templatePreview: DayDetailTemplatePreview | null = null;
      if (!relatedLesson) {
        const preferredTemplate =
          calendarData.templates.find((template) => template.phase === 'while') ??
          calendarData.templates[0] ??
          null;

        if (preferredTemplate) {
          templatePreview = {
            id: preferredTemplate.id,
            name: preferredTemplate.name,
            phaseLabel: formatTemplatePhase(preferredTemplate.phase),
            summary: summarizeTemplate(preferredTemplate),
          } as DayDetailTemplatePreview;
        }
      }

      const availableTopics = calendarData.topics
        .filter((topic) => {
          if (topic.trimesterId !== slot.trimesterId) {
            return false;
          }
          if (!group) {
            return true;
          }
          return topic.levelIds.includes(group.levelId);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

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
        relatedLesson,
        templatePreview,
        group: group ?? null,
        level: level ?? null,
        availableTopics,
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
    lessonsByGroupAndDate,
    lessonsBySlotKey,
    levelsById,
    placeholderMatchesFilters,
    resolveLessonSlot,
    topicsById,
    calendarData.templates,
    calendarData.topics,
  ]);

  const displayedDayEntries = useMemo((): DayDetailEntry[] => {
    if (!dayDetailEntries) {
      return [];
    }

    if (!focusedDayEntryId) {
      return dayDetailEntries;
    }

    const match = dayDetailEntries.find((entry) => entry.id === focusedDayEntryId);
    return match ? [match] : dayDetailEntries;
  }, [dayDetailEntries, focusedDayEntryId]);

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
    if (!activeDayDetails) {
      return;
    }

    const targetId = focusedDayEntryId ?? activeDayDetails.initialEventId ?? null;
    if (!targetId) {
      return;
    }

    const container = dayDrawerScrollRef.current;
    const element = dayEntryRefs.current.get(targetId);
    if (!container || !element) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const delta = elementRect.top - containerRect.top;
    const targetScroll =
      container.scrollTop + delta - container.clientHeight / 2 + element.clientHeight / 2;
    const nextPosition = Math.max(0, targetScroll);

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: nextPosition, behavior: 'smooth' });
    } else {
      container.scrollTop = nextPosition;
    }
  }, [activeDayDetails, displayedDayEntries, focusedDayEntryId]);

  const isSingleEntryFocused = useMemo(() => {
    if (!dayDetailEntries) {
      return false;
    }

    if (!focusedDayEntryId) {
      return false;
    }

    if (!dayDetailEntries.some((entry) => entry.id === focusedDayEntryId)) {
      return false;
    }

    return dayDetailEntries.length > 1 && displayedDayEntries.length === 1;
  }, [dayDetailEntries, displayedDayEntries, focusedDayEntryId]);

  const totalDayEntries = dayDetailEntries?.length ?? 0;

  useEffect(() => {
    if (activeDayDetails && dayDrawerCloseButtonRef.current) {
      dayDrawerCloseButtonRef.current.focus();
    }
  }, [activeDayDetails]);

  useEffect(() => {
    if (!activeDayDetails) {
      setEditingPlaceholder(null);
      setEditingLesson(null);
      setPendingUpdateId(null);
      setDayActionError(null);
      setCreatingLessonDraft(null);
      setCreateLessonError(null);
      setIsCreatingLesson(false);
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
      const levelGroupLabel = event.extendedProps.levelGroupLabel as string | undefined;
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

      const monthLabel = levelGroupLabel ?? groupName ?? (kind === 'lesson' ? 'Lesson' : 'Session');
      const detailLabel =
        kind === 'lesson'
          ? `${groupName ?? 'Lesson'}${topicName ? ` • ${topicName}` : ''}`
          : `${groupName ?? 'Group'} • ${placeholderLabel ?? 'Slot'}`;

      const tooltipParts = [detailLabel];
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
      const labelHtml = `<span class="fc-month-chip-label">${escapeHtml(monthLabel)}</span>`;
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

      const html = `<div class="${chipClasses.join(' ')}" style="background:${backgroundColor};border-color:${borderColor};color:${textColor};" title="${escapeHtml(tooltip)}">${indicatorHtml}${labelHtml}${statusHtml}</div>`;

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
    setFocusedDayEntryId(eventId ?? null);
    dayEntryRefs.current.clear();
  }, []);

  const closeDayDetails = useCallback(() => {
    setActiveDayDetails(null);
    setDayActionError(null);
    setPendingDeleteId(null);
    setFocusedDayEntryId(null);
    dayEntryRefs.current.clear();
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

  const openLessonWorkspace = useCallback(
    (lessonId?: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      window.dispatchEvent(
        new CustomEvent('planner:navigate', { detail: { workspace: 'lessons' } })
      );

      if (lessonId) {
        window.dispatchEvent(new CustomEvent('planner:openLesson', { detail: { lessonId } }));
      }

      closeDayDetails();
    },
    [closeDayDetails]
  );

  const startEditingPlaceholder = useCallback((entry: Extract<DayDetailEntry, { kind: 'placeholder' }>) => {
    setEditingPlaceholder({
      id: entry.id,
      startTime: entry.slot.startTime ?? '',
      endTime: entry.slot.endTime ?? '',
    });
    setEditingLesson(null);
    setCreatingLessonDraft(null);
    setCreateLessonError(null);
    setDayActionError(null);
  }, []);

  const startEditingLesson = useCallback(
    (entry: Extract<DayDetailEntry, { kind: 'lesson' }>) => {
      const { lesson } = entry;
      const slot = resolveLessonSlot(lesson);
      setEditingPlaceholder(null);
      setEditingLesson({
        lesson,
        status: lesson.status,
        slot,
        objectives: (lesson.preActivity?.objectives ?? []).join('\n'),
        instructions: lesson.whileActivity?.instructions ?? '',
        reflection: lesson.postActivity?.reflection ?? '',
        notes: lesson.completionNotes ?? '',
      });
      setCreatingLessonDraft(null);
      setCreateLessonError(null);
      setDayActionError(null);
    },
    [resolveLessonSlot]
  );

  const cancelPlaceholderEdit = useCallback(() => {
    setEditingPlaceholder(null);
  }, []);

  const cancelLessonEdit = useCallback(() => {
    setEditingLesson(null);
    setDayActionError(null);
  }, []);

  const startCreatingLessonForSlot = useCallback(
    (entry: DayDetailPlaceholderEntry) => {
      const defaultTopicId = entry.availableTopics[0]?.id ?? '';
      setCreatingLessonDraft({
        slotId: entry.id,
        topicId: defaultTopicId,
        status: 'planned',
        focus: '',
        activityNotes: entry.templatePreview?.summary ?? '',
        studySuggestion: '',
      });
      setEditingPlaceholder(null);
      setEditingLesson(null);
      setDayActionError(null);
      setCreateLessonError(null);
    },
    []
  );

  const cancelCreatingLesson = useCallback(() => {
    setCreatingLessonDraft(null);
    setCreateLessonError(null);
    setIsCreatingLesson(false);
  }, []);

  const handleCreateLessonFieldChange = useCallback(
    <K extends QuickLessonDraftField>(field: K, value: QuickLessonDraftState[K]) => {
      setCreatingLessonDraft((current) => {
        if (!current) {
          return current;
        }

        return { ...current, [field]: value };
      });
    },
    []
  );

  const handleSaveQuickLesson = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!creatingLessonDraft) {
        return;
      }

      const slot = availablePlaceholders.find((placeholder) => placeholder.id === creatingLessonDraft.slotId);
      if (!slot) {
        setCreateLessonError('This session is no longer available. Refresh the calendar and try again.');
        return;
      }

      if (calendarData.lessons.some((lesson) => lesson.placeholderId === slot.id)) {
        setCreateLessonError('A lesson is already linked to this session.');
        return;
      }

      const group = groupsById.get(slot.groupId);
      if (!group) {
        setCreateLessonError('Unable to determine the class group for this session.');
        return;
      }

      const topicId = creatingLessonDraft.topicId;
      if (!topicId) {
        setCreateLessonError('Select a topic before saving this lesson.');
        return;
      }

      const topic = topicsById.get(topicId);
      if (!topic) {
        setCreateLessonError('Choose a valid topic before saving this lesson.');
        return;
      }

      const status = creatingLessonDraft.status;
      const objectiveLines = creatingLessonDraft.focus
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const instructions = creatingLessonDraft.activityNotes.trim();
      const studySuggestion = creatingLessonDraft.studySuggestion.trim();

      const lessonId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `lesson_${Date.now()}`;

      const newLesson: Lesson = {
        id: lessonId,
        groupId: slot.groupId,
        topicId,
        trimesterId: slot.trimesterId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        placeholderId: slot.id,
        status,
        preActivity: objectiveLines.length > 0 ? { objectives: objectiveLines } : undefined,
        whileActivity: instructions ? { instructions } : undefined,
        postActivity: studySuggestion ? { reflection: studySuggestion } : undefined,
        resourceIds: [],
        resourceAttachments: [],
        linkedLessonIds: [],
        completionNotes: studySuggestion || undefined,
      };

      try {
        setIsCreatingLesson(true);
        setCreateLessonError(null);
        await DataStore.save('lessons', newLesson);
        setCreatingLessonDraft(null);
        setFocusedDayEntryId(newLesson.id);
      } catch (error) {
        console.error('Failed to create lesson from calendar', error);
        setCreateLessonError('Unable to create the lesson. Please try again.');
      } finally {
        setIsCreatingLesson(false);
      }
    },
    [
      availablePlaceholders,
      calendarData.lessons,
      creatingLessonDraft,
      groupsById,
      topicsById,
    ]
  );

  const handlePlaceholderFieldChange = useCallback(
    (field: 'startTime' | 'endTime', value: string) => {
      setEditingPlaceholder((current) => {
        if (!current) {
          return current;
        }

        return { ...current, [field]: value };
      });
    },
    []
  );

  const handleSavePlaceholderEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingPlaceholder) {
        return;
      }

      const { id, startTime, endTime } = editingPlaceholder;

      if (!startTime || !endTime) {
        setDayActionError('Start and end times are required to update this session.');
        return;
      }

      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);

      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
        setDayActionError('End time must be after the start time.');
        return;
      }

      try {
        setPendingUpdateId(id);
        setDayActionError(null);
        await DataStore.update('placeholderSlots', id, { startTime, endTime });
        const linkedLessons = calendarData.lessons.filter((lesson) => lesson.placeholderId === id);
        await Promise.all(
          linkedLessons.map((lesson) =>
            DataStore.update('lessons', lesson.id, { startTime, endTime })
          )
        );
        setEditingPlaceholder(null);
      } catch (error) {
        console.error('Failed to update placeholder slot', error);
        setDayActionError('Unable to update this session. Please try again.');
      } finally {
        setPendingUpdateId(null);
      }
    },
    [calendarData.lessons, editingPlaceholder]
  );

  const handleLessonFieldChange = useCallback(
    <K extends LessonEditField>(field: K, value: EditingLessonState[K]) => {
      setEditingLesson((current) => {
        if (!current) {
          return current;
        }

        return { ...current, [field]: value };
      });
    },
    []
  );

  const handleSaveLessonEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!editingLesson) {
        return;
      }

      const { lesson, slot, status, objectives, instructions, reflection, notes } = editingLesson;

      const targetDate = slot?.date ?? lesson.date;
      const targetStart = slot?.startTime ?? lesson.startTime;
      const targetEnd = slot?.endTime ?? lesson.endTime;
      const targetPlaceholderId = slot?.id ?? lesson.placeholderId;

      if (!targetStart || !targetEnd) {
        setDayActionError('Assign this lesson to a scheduled session before updating it.');
        return;
      }

      const startMinutes = parseTimeToMinutes(targetStart);
      const endMinutes = parseTimeToMinutes(targetEnd);

      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
        setDayActionError('The linked session slot has invalid times.');
        return;
      }

      const objectiveList = parseObjectivesList(objectives);
      const trimmedInstructions = instructions.trim();
      const trimmedReflection = reflection.trim();
      const trimmedNotes = notes.trim();

      const preActivity = buildPhase(lesson.preActivity, { objectives: objectiveList });
      const whileActivity = buildPhase(lesson.whileActivity, { instructions: trimmedInstructions });
      const postActivity = buildPhase(lesson.postActivity, { reflection: trimmedReflection });

      try {
        setPendingUpdateId(lesson.id);
        setDayActionError(null);
        await DataStore.update('lessons', lesson.id, {
          date: targetDate,
          startTime: targetStart,
          endTime: targetEnd,
          placeholderId: targetPlaceholderId,
          status,
          preActivity,
          whileActivity,
          postActivity,
          completionNotes: trimmedNotes ? trimmedNotes : undefined,
        });
        setEditingLesson(null);
      } catch (error) {
        console.error('Failed to update lesson', error);
        setDayActionError('Unable to update this lesson. Please try again.');
      } finally {
        setPendingUpdateId(null);
      }
    },
    [editingLesson]
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
          displayEventTime={activeView !== 'dayGridMonth'}
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
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-10 sm:px-6">
          <button
            type="button"
            aria-label="Close day details"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={closeDayDetails}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-drawer-title"
            className="relative z-10 flex w-full max-w-3xl max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl"
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
                {isSingleEntryFocused ? (
                  <button
                    type="button"
                    onClick={() => setFocusedDayEntryId(null)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    Show full day
                  </button>
                ) : null}
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
            <div ref={dayDrawerScrollRef} className="flex-1 overflow-y-auto p-6">
              {dayActionError ? (
                <p className="mb-4 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/40">
                  {dayActionError}
                </p>
              ) : null}
              {displayedDayEntries.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {displayedDayEntries.map((entry) => {
                    const isHighlighted =
                      (activeDayDetails.initialEventId &&
                        activeDayDetails.initialEventId === entry.id) ||
                      (focusedDayEntryId ? focusedDayEntryId === entry.id : false);
                    const isEditingPlaceholder =
                      entry.kind === 'placeholder' && editingPlaceholder?.id === entry.id;
                    const isEditingLesson =
                      entry.kind === 'lesson' && editingLesson?.lesson.id === entry.id;
                    return (
                      <li
                        key={`${entry.kind}_${entry.id}`}
                        ref={(element) => {
                          if (!element) {
                            dayEntryRefs.current.delete(entry.id);
                          } else {
                            dayEntryRefs.current.set(entry.id, element);
                          }
                        }}
                      >
                        <article
                          className={`group relative overflow-hidden rounded-2xl border bg-white/5 p-4 transition hover:border-accent/50 ${
                            isHighlighted
                              ? 'border-accent/70 bg-accent/10 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
                              : 'border-white/10'
                          }`}
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="flex items-start gap-4 md:flex-1">
                              <span
                                aria-hidden
                                className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ backgroundColor: entry.accentColor }}
                              >
                                {entry.kind === 'lesson' ? 'L' : 'S'}
                              </span>
                              <div className="flex-1 space-y-3">
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
                                {entry.kind === 'lesson' && !isEditingLesson ? (
                                  <div className="space-y-3">
                                    {entry.objectives.length ? (
                                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          Objectives
                                        </p>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                                          {entry.objectives.map((objective, index) => (
                                            <li key={`${entry.id}_objective_${index}`}>{objective}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                    {entry.instructions ? (
                                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          During class
                                        </p>
                                        <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                                          {entry.instructions}
                                        </p>
                                      </div>
                                    ) : null}
                                    {entry.reflection ? (
                                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          Reflection & wrap-up
                                        </p>
                                        <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                                          {entry.reflection}
                                        </p>
                                      </div>
                                    ) : null}
                                    {entry.completionNotes ? (
                                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          Notes
                                        </p>
                                        <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                                          {entry.completionNotes}
                                        </p>
                                      </div>
                                    ) : null}
                                    {!entry.objectives.length &&
                                    !entry.instructions &&
                                    !entry.reflection &&
                                    !entry.completionNotes ? (
                                      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-4 text-sm text-slate-400">
                                        No lesson content captured yet.
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                {entry.kind === 'lesson' && isEditingLesson ? (
                                  <form
                                    className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                                    onSubmit={handleSaveLessonEdit}
                                  >
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div className="sm:col-span-2 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          Session slot
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-100">
                                          {editingLesson?.slot
                                            ? `${formatDateLabel(editingLesson.slot.date)} • ${
                                                formatTimeRange(
                                                  editingLesson.slot.startTime,
                                                  editingLesson.slot.endTime
                                                ) || 'Time not set'
                                              }`
                                            : `${formatDateLabel(editingLesson?.lesson.date)} • ${
                                                formatTimeRange(
                                                  editingLesson?.lesson.startTime,
                                                  editingLesson?.lesson.endTime
                                                ) || 'Time not set'
                                              }`}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                          {editingLesson?.slot
                                            ? 'Manage session timing from the schedule builder. Changes there will update this lesson automatically.'
                                            : 'Link this lesson to a scheduled session to keep its timing in sync with the planner.'}
                                        </p>
                                      </div>
                                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                        <span>Status</span>
                                        <select
                                          value={editingLesson?.status ?? 'planned'}
                                          onChange={(event) =>
                                            handleLessonFieldChange('status', event.target.value as LessonStatus)
                                          }
                                          className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                        >
                                          {LESSON_STATUS_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>Objectives</span>
                                      <textarea
                                        value={editingLesson?.objectives ?? ''}
                                        onChange={(event) =>
                                          handleLessonFieldChange('objectives', event.target.value)
                                        }
                                        rows={3}
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                        placeholder="List objectives separated by new lines or commas"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>During class</span>
                                      <textarea
                                        value={editingLesson?.instructions ?? ''}
                                        onChange={(event) =>
                                          handleLessonFieldChange('instructions', event.target.value)
                                        }
                                        rows={4}
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                        placeholder="Outline the main activities for this session"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>Reflection & wrap-up</span>
                                      <textarea
                                        value={editingLesson?.reflection ?? ''}
                                        onChange={(event) =>
                                          handleLessonFieldChange('reflection', event.target.value)
                                        }
                                        rows={3}
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                        placeholder="Capture closure prompts or homework reminders"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>Notes</span>
                                      <textarea
                                        value={editingLesson?.notes ?? ''}
                                        onChange={(event) =>
                                          handleLessonFieldChange('notes', event.target.value)
                                        }
                                        rows={3}
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                        placeholder="Record progress updates or follow-ups"
                                      />
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="submit"
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent transition hover:border-accent/60 hover:bg-accent/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                        disabled={pendingUpdateId === entry.id}
                                      >
                                        {pendingUpdateId === entry.id ? 'Saving…' : 'Save lesson'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelLessonEdit}
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : null}
                                {entry.kind === 'placeholder' && entry.relatedLesson ? (
                                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                      Linked lesson
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-white">
                                      {entry.relatedLesson.title}
                                    </p>
                                    <p className="text-xs text-slate-400">{entry.relatedLesson.subtitle}</p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                        <Clock className="h-3.5 w-3.5" aria-hidden />
                                        {entry.relatedLesson.timeLabel}
                                      </span>
                                      {entry.relatedLesson.statusLabel ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                                          {entry.relatedLesson.statusLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                                {entry.kind === 'placeholder' && !entry.relatedLesson && entry.templatePreview ? (
                                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-4 text-sm text-slate-300">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                      Suggested template
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-white">
                                      {entry.templatePreview.name}
                                    </p>
                                    <p className="text-xs text-slate-400">{entry.templatePreview.phaseLabel}</p>
                                    {entry.templatePreview.summary ? (
                                      <p className="mt-2 text-xs text-slate-400">
                                        {entry.templatePreview.summary}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {entry.kind === 'placeholder' && isEditingPlaceholder ? (
                                  <form
                                    className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                                    onSubmit={handleSavePlaceholderEdit}
                                  >
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                        <span>Start time</span>
                                        <input
                                          type="time"
                                          value={editingPlaceholder?.startTime ?? ''}
                                          onChange={(event) =>
                                            handlePlaceholderFieldChange('startTime', event.target.value)
                                          }
                                          className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                          required
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                        <span>End time</span>
                                        <input
                                          type="time"
                                          value={editingPlaceholder?.endTime ?? ''}
                                          onChange={(event) =>
                                            handlePlaceholderFieldChange('endTime', event.target.value)
                                          }
                                          className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                          required
                                        />
                                      </label>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="submit"
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent transition hover:border-accent/60 hover:bg-accent/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                        disabled={pendingUpdateId === entry.id}
                                      >
                                        {pendingUpdateId === entry.id ? 'Saving…' : 'Save session'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelPlaceholderEdit}
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 md:flex-col md:items-end md:justify-center">
                              {entry.kind === 'lesson' && !isEditingLesson ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingLesson(entry)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-accent/50 hover:bg-accent/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                  disabled={pendingDeleteId === entry.id || pendingUpdateId === entry.id}
                                >
                                  Edit lesson
                                </button>
                              ) : null}
                              {entry.kind === 'lesson' && isEditingLesson ? (
                                <span className="text-xs font-semibold uppercase tracking-wide text-accent/80">
                                  Editing…
                                </span>
                              ) : null}
                              {entry.kind === 'placeholder' && !isEditingPlaceholder ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingPlaceholder(entry)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-accent/50 hover:bg-accent/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                  disabled={pendingDeleteId === entry.id || pendingUpdateId === entry.id}
                                >
                                  Edit session
                                </button>
                              ) : null}
                              {entry.kind === 'lesson' ? (
                                <button
                                  type="button"
                                  onClick={() => openLessonWorkspace(entry.lesson.id)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                >
                                  Open workspace
                                </button>
                              ) : null}
                              {entry.kind === 'placeholder' && entry.relatedLesson ? (
                                <button
                                  type="button"
                                  onClick={() => openLessonWorkspace(entry.relatedLesson?.id)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                >
                                  Open lesson
                                </button>
                              ) : null}
                              {entry.kind === 'placeholder' && !entry.relatedLesson && entry.templatePreview ? (
                                <button
                                  type="button"
                                  onClick={() => openLessonWorkspace()}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                >
                                  Browse templates
                                </button>
                              ) : null}
                              {entry.kind === 'placeholder' && !entry.relatedLesson ? (
                                creatingLessonDraft?.slotId === entry.id ? (
                                  <button
                                    type="button"
                                    onClick={cancelCreatingLesson}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                  >
                                    Close planner
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startCreatingLessonForSlot(entry)}
                                    className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent transition hover:border-accent/70 hover:bg-accent/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                    disabled={entry.availableTopics.length === 0}
                                  >
                                    Plan lesson
                                  </button>
                                )
                              ) : null}
                              {entry.canDelete ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                  onClick={() => handleDeleteEntry(entry)}
                                  disabled={pendingDeleteId === entry.id || pendingUpdateId === entry.id}
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
                          {entry.kind === 'placeholder' ? (
                            <div className="mt-4 space-y-4">
                              {creatingLessonDraft?.slotId === entry.id ? (
                                <form
                                  className="space-y-4 rounded-2xl border border-accent/30 bg-slate-900/60 p-4"
                                  onSubmit={handleSaveQuickLesson}
                                >
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>Topic</span>
                                      <select
                                        value={creatingLessonDraft?.topicId ?? ''}
                                        onChange={(event) => handleCreateLessonFieldChange('topicId', event.target.value)}
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                      >
                                        <option value="" disabled>
                                          {entry.availableTopics.length === 0 ? 'No topics available' : 'Select topic'}
                                        </option>
                                        {entry.availableTopics.map((topic) => (
                                          <option key={topic.id} value={topic.id} className="bg-slate-900 text-slate-100">
                                            {topic.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                      <span>Status</span>
                                      <select
                                        value={creatingLessonDraft?.status ?? 'planned'}
                                        onChange={(event) =>
                                          handleCreateLessonFieldChange('status', event.target.value as LessonStatus)
                                        }
                                        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                      >
                                        {LESSON_STATUS_OPTIONS.map((option) => (
                                          <option key={option.id} value={option.id} className="bg-slate-900 text-slate-100">
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <span>Lesson focus</span>
                                    <textarea
                                      value={creatingLessonDraft?.focus ?? ''}
                                      onChange={(event) => handleCreateLessonFieldChange('focus', event.target.value)}
                                      rows={2}
                                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                      placeholder="What are students working on?"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <span>Activity notes</span>
                                    <textarea
                                      value={creatingLessonDraft?.activityNotes ?? ''}
                                      onChange={(event) => handleCreateLessonFieldChange('activityNotes', event.target.value)}
                                      rows={3}
                                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                      placeholder="Key steps, tools, or centers for this class"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <span>Study suggestion</span>
                                    <textarea
                                      value={creatingLessonDraft?.studySuggestion ?? ''}
                                      onChange={(event) => handleCreateLessonFieldChange('studySuggestion', event.target.value)}
                                      rows={2}
                                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                      placeholder="Reminders or take-home tasks"
                                    />
                                  </label>
                                  {createLessonError ? (
                                    <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                                      {createLessonError}
                                    </p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-accent/80 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                                      disabled={isCreatingLesson}
                                    >
                                      {isCreatingLesson ? 'Saving…' : 'Save lesson'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelCreatingLesson}
                                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-xs text-slate-300">
                                  {entry.availableTopics.length === 0
                                    ? 'Create a topic for this level to start planning lessons in this slot.'
                                    : 'Click “Plan lesson” to capture the essentials for this class without leaving the calendar.'}
                                </p>
                              )}
                            </div>
                          ) : null}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 bg-surface/40 p-6 text-center text-sm text-slate-300">
                  {totalDayEntries === 0
                    ? 'No lessons or sessions scheduled for this day yet.'
                    : 'The selected entry is no longer available. Show the full day to review remaining sessions.'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
