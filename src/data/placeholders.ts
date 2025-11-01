import { addDays, format, getISODay, parseISO } from 'date-fns';
import { db, DataStore } from './db';
import type { Group, Holiday, PlaceholderSlot, Schedule, Trimester } from './types';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';

interface HolidayWindow {
  id: string;
  start: Date;
  end: Date;
  appliesToAll: boolean;
  targets: Set<string>;
}

function normalizeTarget(value: string) {
  return value.trim().toLowerCase();
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function mapHolidayToWindow(holiday: Holiday): HolidayWindow | null {
  const start = parseISO(holiday.startDate);
  const end = parseISO(holiday.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  const targets = new Set(holiday.affectsGroups.map(normalizeTarget));
  const appliesToAll = targets.has('all');

  return {
    id: holiday.id,
    start,
    end,
    appliesToAll,
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

function computeFirstOccurrence(start: Date, desiredIsoDay: number) {
  const startIsoDay = getISODay(start);
  const offset = (desiredIsoDay - startIsoDay + 7) % 7;
  return addDays(start, offset);
}

function formatDate(date: Date) {
  return format(date, ISO_DATE_FORMAT);
}

export function computePlaceholderSlotsForSchedule(
  schedule: Schedule,
  trimester: Trimester,
  group: Group,
  holidayWindows: HolidayWindow[]
) {
  const start = parseISO(trimester.startDate);
  const end = parseISO(trimester.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [] as PlaceholderSlot[];
  }

  const relevantHolidays = holidayWindows.filter((window) => holidayCoversGroup(window, group));
  const slots: PlaceholderSlot[] = [];

  for (const session of schedule.sessions) {
    const durationMinutes = Math.max(0, toMinutes(session.endTime) - toMinutes(session.startTime));
    if (durationMinutes === 0) continue;

    let occurrence = computeFirstOccurrence(start, session.dayOfWeek);
    while (occurrence <= end) {
      const isBlocked = relevantHolidays.some((window) => dateFallsInside(occurrence, window));
      if (!isBlocked) {
        const dateString = formatDate(occurrence);
        const id = `placeholder_${schedule.id}_${dateString}_${session.startTime}_${session.endTime}`;
        slots.push({
          id,
          scheduleId: schedule.id,
          groupId: schedule.groupId,
          trimesterId: schedule.trimesterId,
          date: dateString,
          dayOfWeek: session.dayOfWeek,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes,
          source: 'schedule',
        });
      }
      occurrence = addDays(occurrence, 7);
    }
  }

  return slots;
}

export async function recomputePlaceholdersForSchedule(schedule: Schedule) {
  const [trimester, group, holidays] = await Promise.all([
    DataStore.get('trimesters', schedule.trimesterId),
    DataStore.get('groups', schedule.groupId),
    DataStore.getAll('holidays'),
  ]);

  const holidayWindows = holidays
    .map(mapHolidayToWindow)
    .filter((window): window is HolidayWindow => window !== null);

  const placeholders =
    trimester && group
      ? computePlaceholderSlotsForSchedule(schedule, trimester, group, holidayWindows)
      : ([] as PlaceholderSlot[]);

  await db.transaction('rw', [db.placeholderSlots], async () => {
    await db.placeholderSlots.where('scheduleId').equals(schedule.id).delete();
    if (placeholders.length) {
      await db.placeholderSlots.bulkPut(placeholders);
    }
  });

  return placeholders.length;
}

export async function recomputeAllPlaceholders() {
  const [schedules, trimesters, groups, holidays] = await Promise.all([
    DataStore.getAll('schedules'),
    DataStore.getAll('trimesters'),
    DataStore.getAll('groups'),
    DataStore.getAll('holidays'),
  ]);

  const trimesterMap = new Map(trimesters.map((trimester) => [trimester.id, trimester]));
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const holidayWindows = holidays
    .map(mapHolidayToWindow)
    .filter((window): window is HolidayWindow => window !== null);

  const allPlaceholders: PlaceholderSlot[] = [];

  for (const schedule of schedules) {
    const trimester = trimesterMap.get(schedule.trimesterId);
    const group = groupMap.get(schedule.groupId);
    if (!trimester || !group) {
      continue;
    }
    const placeholders = computePlaceholderSlotsForSchedule(schedule, trimester, group, holidayWindows);
    allPlaceholders.push(...placeholders);
  }

  await db.transaction('rw', [db.placeholderSlots], async () => {
    await db.placeholderSlots.clear();
    if (allPlaceholders.length) {
      await db.placeholderSlots.bulkPut(allPlaceholders);
    }
  });

  return allPlaceholders.length;
}

export function getExpectedSlotsForRange(
  schedules: Schedule[],
  trimesters: Trimester[],
  groups: Group[],
  holidays: Holiday[],
  rangeStart: Date,
  rangeEnd: Date
) {
  const [startBound, endBound] =
    rangeStart.getTime() <= rangeEnd.getTime() ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
  const inclusiveEnd =
    startBound.getTime() === endBound.getTime() ? endBound : addDays(endBound, -1);

  const trimesterMap = new Map(trimesters.map((trimester) => [trimester.id, trimester]));
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  const holidayWindows = holidays
    .map(mapHolidayToWindow)
    .filter((window): window is HolidayWindow => window !== null);

  const results: PlaceholderSlot[] = [];

  for (const schedule of schedules) {
    const trimester = trimesterMap.get(schedule.trimesterId);
    const group = groupMap.get(schedule.groupId);

    if (!trimester || !group) {
      continue;
    }

    const slots = computePlaceholderSlotsForSchedule(schedule, trimester, group, holidayWindows);

    for (const slot of slots) {
      const occurrence = parseISO(slot.date);
      if (Number.isNaN(occurrence.getTime())) {
        continue;
      }

      if (occurrence >= startBound && occurrence <= inclusiveEnd) {
        results.push(slot);
      }
    }
  }

  return results;
}
