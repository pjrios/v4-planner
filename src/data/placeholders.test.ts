import { format, getISODay, parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  computePlaceholderSlotsForSchedule,
  getActiveTrimesterSpan,
} from './placeholders';
import type { Group, Schedule, Trimester } from './types';

describe('computePlaceholderSlotsForSchedule', () => {
  it('extends across active trimesters and pushes holiday occurrences forward', () => {
    const trimesters: Trimester[] = [
      {
        id: 'trimester-completed',
        name: 'Completed Trimester',
        startDate: '2023-09-01',
        endDate: '2023-11-30',
        totalWeeks: 12,
        schoolDays: 60,
        color: '#334155',
        status: 'completed',
        academicYear: '2023-2024',
      },
      {
        id: 'trimester-1',
        name: 'Trimester 1',
        startDate: '2024-01-08',
        endDate: '2024-03-29',
        totalWeeks: 12,
        schoolDays: 60,
        color: '#1d4ed8',
        status: 'current',
        academicYear: '2024-2025',
      },
      {
        id: 'trimester-2',
        name: 'Trimester 2',
        startDate: '2024-04-08',
        endDate: '2024-06-28',
        totalWeeks: 11,
        schoolDays: 55,
        color: '#22c55e',
        status: 'upcoming',
        academicYear: '2024-2025',
      },
    ];

    const activeSpan = getActiveTrimesterSpan(trimesters);
    expect(activeSpan).not.toBeNull();
    expect(format(activeSpan!.start, 'yyyy-MM-dd')).toBe('2024-01-08');
    expect(format(activeSpan!.end, 'yyyy-MM-dd')).toBe('2024-06-28');

    const schedule: Schedule = {
      id: 'schedule-group-a',
      groupId: 'group-a',
      trimesterId: 'trimester-1',
      sessions: [
        {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
        },
      ],
    };

    const group: Group = {
      id: 'group-a',
      levelId: 'level-5',
      letter: 'A',
      displayName: '5A',
    };

    const holidayWindows = [
      {
        id: 'holiday-week-two',
        start: parseISO('2024-01-15'),
        end: parseISO('2024-01-16'),
        appliesToAll: true,
        targets: new Set<string>(['all']),
      },
      {
        id: 'holiday-late-march',
        start: parseISO('2024-03-25'),
        end: parseISO('2024-03-26'),
        appliesToAll: true,
        targets: new Set<string>(['all']),
      },
    ] as any;

    const slots = computePlaceholderSlotsForSchedule(
      schedule,
      trimesters[1],
      group,
      holidayWindows,
      activeSpan
    );

    expect(slots.length).toBeGreaterThan(0);

    const earliestSlot = slots.reduce((earliest, slot) =>
      !earliest || slot.date < earliest.date ? slot : earliest
    );
    const latestSlot = slots.reduce((latest, slot) =>
      !latest || slot.date > latest.date ? slot : latest
    );

    expect(earliestSlot.date).toBe('2024-01-08');
    expect(earliestSlot.dayOfWeek).toBe(1);

    expect(latestSlot.date).toBe('2024-06-24');
    expect(latestSlot.dayOfWeek).toBe(1);

    expect(slots.some((slot) => slot.date === '2024-01-15')).toBe(false);
    expect(slots.some((slot) => slot.date === '2024-01-17')).toBe(true);

    const shiftedSlot = slots.find((slot) => slot.date === '2024-01-17');
    expect(shiftedSlot).toBeDefined();
    expect(getISODay(parseISO(shiftedSlot!.date))).toBe(3);

    const pushedMarchSlot = slots.find((slot) => slot.date === '2024-03-27');
    expect(pushedMarchSlot).toBeDefined();
    expect(getISODay(parseISO(pushedMarchSlot!.date))).toBe(3);

    const beyondFirstTrimester = slots.filter((slot) => slot.date > '2024-03-29');
    expect(beyondFirstTrimester.length).toBeGreaterThan(0);
    expect(slots.some((slot) => slot.date === '2024-04-08')).toBe(true);
  });

  it('falls back to covering all trimesters when none are active', () => {
    const trimesters: Trimester[] = [
      {
        id: 'trimester-a',
        name: 'Trimester A',
        startDate: '2023-01-01',
        endDate: '2023-03-01',
        totalWeeks: 9,
        schoolDays: 45,
        color: '#0f172a',
        status: 'completed',
        academicYear: '2022-2023',
      },
      {
        id: 'trimester-b',
        name: 'Trimester B',
        startDate: '2023-04-01',
        endDate: '2023-06-01',
        totalWeeks: 9,
        schoolDays: 45,
        color: '#1e293b',
        status: 'completed',
        academicYear: '2022-2023',
      },
    ];

    const span = getActiveTrimesterSpan(trimesters);
    expect(span).not.toBeNull();
    expect(format(span!.start, 'yyyy-MM-dd')).toBe('2023-01-01');
    expect(format(span!.end, 'yyyy-MM-dd')).toBe('2023-06-01');
  });
});
