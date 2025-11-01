import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import type FullCalendarClass from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type {
  DatesSetArg,
  EventContentArg,
  EventInput,
  EventMountArg,
  MoreLinkContentArg,
} from '@fullcalendar/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataStore } from '../../data/db';
import type {
  Group,
  Lesson,
  LessonStatus,
  Level,
  PlaceholderSlot,
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
        accentColor: accent,
        startTime: slot.startTime,
        endTime: slot.endTime,
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
  const lastPrefetchedRange = useRef<{ start: string; end: string } | null>(null);
  const latestRequestedRange = useRef<string | null>(null);
  const inFlightRangeKeys = useRef(new Set<string>());
  const currentVisibleRange = useRef<{ start: Date; end: Date } | null>(null);
  const lastAutoFocusedDate = useRef<string | null>(null);
  const calendarWrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipHandlersRef = useRef(
    new WeakMap<HTMLElement, { show: () => void; hide: () => void }>()
  );
  const tooltipSourceRef = useRef<HTMLElement | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);

  const loadStaticCollections = useCallback(async () => {
    setIsBaseLoading(true);
    setBaseError(null);

    try {
      const [trimesters, groups, levels, topics] = await Promise.all([
        DataStore.getAll('trimesters'),
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('topics'),
      ]);

      setCalendarData((current) => ({
        ...current,
        trimesters,
        groups,
        levels,
        topics,
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

      const previous = lastPrefetchedRange.current;
      if (previous && paddedStart >= previous.start && paddedEnd <= previous.end) {
        latestRequestedRange.current = rangeKey;
        setRangeError(null);
        setIsRangeLoading(false);
        return;
      }

      if (inFlightRangeKeys.current.has(rangeKey)) {
        latestRequestedRange.current = rangeKey;
        return;
      }

      latestRequestedRange.current = rangeKey;
      inFlightRangeKeys.current.add(rangeKey);
      setIsRangeLoading(true);
      setRangeError(null);

      try {
        const [lessons, placeholders] = await Promise.all([
          DataStore.getInDateRange('lessons', paddedStart, paddedEnd),
          DataStore.getInDateRange('placeholderSlots', paddedStart, paddedEnd),
        ]);

        if (latestRequestedRange.current === rangeKey) {
          setCalendarData((current) => ({
            ...current,
            lessons,
            placeholders,
          }));
          lastPrefetchedRange.current = { start: paddedStart, end: paddedEnd };
          setRangeError(null);
        }
      } catch (error) {
        if (latestRequestedRange.current === rangeKey) {
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
        if (latestRequestedRange.current === rangeKey) {
          setIsRangeLoading(false);
        }
      }
    },
    []
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setCurrentTitle(arg.view.title);
      setActiveView(arg.view.type as CalendarViewType);
      currentVisibleRange.current = { start: arg.start, end: arg.end };
      void prefetchRange(arg.start, arg.end);
    },
    [prefetchRange]
  );

  const handlePrev = useCallback(() => {
    calendarRef.current?.getApi().prev();
  }, []);

  const handleNext = useCallback(() => {
    calendarRef.current?.getApi().next();
  }, []);

  const handleToday = useCallback(() => {
    const api = calendarRef.current?.getApi();
    api?.today();
  }, []);

  const handleViewChange = useCallback((view: CalendarViewType) => {
    const api = calendarRef.current?.getApi();
    if (!api || api.view.type === view) {
      return;
    }

    setActiveView(view);
    api.changeView(view);
  }, []);

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
  }, [selectedGroupId, selectedLevelId, selectedTrimesterId]);

  useEffect(() => {
    const { lessons, placeholders } = calendarData;
    if (!lessons.length && !placeholders.length) {
      return;
    }

    const allDates: string[] = [];
    for (const lesson of lessons) {
      if (lesson.date) {
        allDates.push(lesson.date);
      }
    }
    for (const slot of placeholders) {
      if (slot.date) {
        allDates.push(slot.date);
      }
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

    api.gotoDate(target);
    lastAutoFocusedDate.current = earliestDate;
  }, [calendarData]);

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
    const groupsById = new Map(calendarData.groups.map((group) => [group.id, group]));
    const levelsById = new Map(calendarData.levels.map((level) => [level.id, level]));
    const topicsById = new Map(calendarData.topics.map((topic) => [topic.id, topic]));
    const activeStatuses = new Set(selectedStatuses);

    const lessonsMatchingFilters = calendarData.lessons.filter((lesson) => {
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

      if (activeStatuses.size > 0 && !activeStatuses.has(lesson.status)) {
        return false;
      }

      return true;
    });

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

    const placeholdersMatchingFilters = calendarData.placeholders.filter((slot) => {
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
    });

    const placeholderEvents = createPlaceholderEvents(
      placeholdersMatchingFilters,
      groupsById,
      levelsById,
      lessonKeys
    );

    return [...lessonEvents, ...placeholderEvents];
  }, [
    calendarData.groups,
    calendarData.levels,
    calendarData.lessons,
    calendarData.placeholders,
    calendarData.topics,
    selectedGroupId,
    selectedLevelId,
    selectedStatuses,
    selectedTrimesterId,
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

  const hasAnyData = calendarData.lessons.length > 0 || calendarData.placeholders.length > 0;
  const loadError = baseError ?? rangeError;
  const isLoading = (isBaseLoading || isRangeLoading) && loadError === null;

  const renderEventContent = useCallback(
    (arg: EventContentArg) => {
      if (activeView !== 'dayGridMonth') {
        return undefined;
      }

      const { event } = arg;
      const kind = (event.extendedProps.kind as string | undefined) ?? 'lesson';
      const statusLabel = event.extendedProps.statusLabel as string | undefined;
      const groupName = event.extendedProps.groupName as string | undefined;
      const topicName = event.extendedProps.topicName as string | undefined;
      const startTime = event.extendedProps.startTime as string | undefined;
      const endTime = event.extendedProps.endTime as string | undefined;
      const timeLabel = formatTimeRange(startTime, endTime);
      const accentColor =
        (event.extendedProps.accentColor as string | undefined) ?? event.backgroundColor ?? DEFAULT_ACCENT;

      const label =
        kind === 'lesson'
          ? `${groupName ?? 'Lesson'}${topicName ? ` • ${topicName}` : ''}`
          : `${groupName ?? 'Group'} • Slot`;

      const tooltipParts = [label];
      if (timeLabel) {
        tooltipParts.push(timeLabel);
      }
      if (kind === 'lesson' && statusLabel) {
        tooltipParts.push(statusLabel);
      }

      const tooltip = tooltipParts.join(' • ');
      const backgroundColor = event.backgroundColor ?? 'rgba(148, 163, 184, 0.15)';
      const borderColor = event.borderColor ?? 'rgba(148, 163, 184, 0.25)';
      const textColor = event.textColor ?? '#e2e8f0';

      const indicatorHtml = `<span class="fc-month-chip-indicator" style="background:${accentColor};"></span>`;
      const labelHtml = `<span class="fc-month-chip-label">${escapeHtml(label)}</span>`;
      const timeHtml = timeLabel ? `<span class="fc-month-chip-time">${escapeHtml(timeLabel)}</span>` : '';
      const statusHtml =
        kind === 'lesson' && statusLabel
          ? `<span class="fc-month-chip-status">${escapeHtml(statusLabel)}</span>`
          : '';

      const html = `<div class="fc-month-chip ${kind === 'lesson' ? 'fc-month-chip-lesson' : 'fc-month-chip-placeholder'}" style="background:${backgroundColor};border-color:${borderColor};color:${textColor};" title="${escapeHtml(tooltip)}">${indicatorHtml}${labelHtml}${timeHtml}${statusHtml}</div>`;

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

  const handleEventDidMount = useCallback(
    (arg: EventMountArg) => {
      if (activeView === 'dayGridMonth') {
        return;
      }

      const { event, el } = arg;
      const rawKind = event.extendedProps.kind as string | undefined;
      const kind: 'lesson' | 'placeholder' = rawKind === 'placeholder' ? 'placeholder' : 'lesson';
      const groupName = (event.extendedProps.groupName as string | undefined) ?? 'Unknown group';
      const topicName = event.extendedProps.topicName as string | undefined;
      const statusLabel = (event.extendedProps.statusLabel as string | undefined) ?? null;
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
          : 'Available placeholder';
      const subtitle = kind === 'lesson' ? groupName : `${groupName} • Slot`;

      const fallbackParts = [title];
      if (subtitle) {
        fallbackParts.push(subtitle);
      }
      if (timeLabel) {
        fallbackParts.push(timeLabel);
      }
      if (kind === 'lesson' && statusLabel) {
        fallbackParts.push(statusLabel);
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
          statusLabel: kind === 'lesson' ? statusLabel : null,
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

      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);

      tooltipHandlersRef.current.set(el, { show, hide });
    },
    [activeView, clearTooltip]
  );

  const handleEventWillUnmount = useCallback(
    (arg: EventMountArg) => {
      const handlers = tooltipHandlersRef.current.get(arg.el);
      if (handlers) {
        arg.el.removeEventListener('mouseenter', handlers.show);
        arg.el.removeEventListener('mouseleave', handlers.hide);
        arg.el.removeEventListener('focus', handlers.show);
        arg.el.removeEventListener('blur', handlers.hide);
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
    </section>
  );
}
