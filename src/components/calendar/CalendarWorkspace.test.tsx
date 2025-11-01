import { addDays, format, getISODay, startOfDay } from 'date-fns';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';

import type { Group, Level, PlaceholderSlot, Schedule, Trimester } from '../../data/types';
import { CalendarWorkspace } from './CalendarWorkspace';

const changeHandlers = new Set<(changes: Array<{ table: string }>) => void>();

const emitDexieChanges = (changes: Array<{ table: string }>) => {
  for (const handler of changeHandlers) {
    handler(changes);
  }
};

const { gotoDateMock, getAllMock, getInDateRangeMock } = vi.hoisted(() => ({
  gotoDateMock: vi.fn(),
  getAllMock: vi.fn(),
  getInDateRangeMock: vi.fn(),
}));

vi.mock('@fullcalendar/react', () => {
  const { forwardRef, useEffect, useImperativeHandle, useState } = React;

  return {
    __esModule: true,
    default: forwardRef((props: any, ref: any) => {
      const [range, setRange] = useState(() => {
        const now = new Date('2024-01-15T00:00:00.000Z');
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return { start, end };
      });

      useImperativeHandle(ref, () => ({
        getApi: () => ({
          gotoDate: (input: Date | number | string) => {
            const date = input instanceof Date ? input : new Date(input);
            gotoDateMock(date);
            const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
            const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
            setRange({ start, end });
          },
          prev: vi.fn(),
          next: vi.fn(),
          today: vi.fn(),
          changeView: vi.fn(),
        }),
      }));

      useEffect(() => {
        props.datesSet?.({
          start: range.start,
          end: range.end,
          view: { type: props.initialView ?? 'dayGridMonth', title: 'Mock view' },
        });
      }, [props.datesSet, props.initialView, range]);

      return (
        <div data-testid="fullcalendar-mock">
          {(props.events ?? []).map((event: any) => (
            <div key={event.id} data-testid={`event-${event.id}`}>
              {event.title}
            </div>
          ))}
        </div>
      );
    }),
  };
});

const level: Level = {
  id: 'level-1',
  gradeNumber: 6,
  subject: 'Mathematics',
  color: '#1e40af',
};

const group: Group = {
  id: 'group-1',
  levelId: level.id,
  letter: 'A',
  displayName: 'Grade 6A',
};

const today = startOfDay(new Date());
const trimesterStartDateObj = addDays(today, 30);
const trimesterEndDateObj = addDays(today, 120);
const trimesterStartDate = format(trimesterStartDateObj, 'yyyy-MM-dd');
const trimesterEndDate = format(trimesterEndDateObj, 'yyyy-MM-dd');
const sessionDayOfWeek = 1;
const sessionOffset = (sessionDayOfWeek - getISODay(trimesterStartDateObj) + 7) % 7;
const firstSessionDateObj = addDays(trimesterStartDateObj, sessionOffset);
const firstSessionDate = format(firstSessionDateObj, 'yyyy-MM-dd');
const secondSessionDate = format(addDays(firstSessionDateObj, 7), 'yyyy-MM-dd');

const trimester: Trimester = {
  id: 'trimester-1',
  name: 'Spring 2024',
  startDate: trimesterStartDate,
  endDate: trimesterEndDate,
  totalWeeks: 12,
  schoolDays: 60,
  color: '#f97316',
  status: 'upcoming',
  academicYear: '2023-2024',
};

const schedule: Schedule = {
  id: 'schedule-1',
  groupId: group.id,
  trimesterId: trimester.id,
  sessions: [
    {
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    },
  ],
};

const placeholderSlot: PlaceholderSlot = {
  id: `placeholder_schedule-1_${firstSessionDate}_09:00_10:00`,
  scheduleId: schedule.id,
  groupId: group.id,
  trimesterId: trimester.id,
  date: firstSessionDate,
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: 60,
  source: 'schedule',
};

vi.mock('../../data/db', () => ({
  DataStore: {
    getAll: getAllMock,
    getInDateRange: getInDateRangeMock,
  },
  db: {
    on: Object.assign(() => undefined, {
      changes: {
        subscribe(handler: (changes: Array<{ table: string }>) => void) {
          changeHandlers.add(handler);
        },
        unsubscribe(handler: (changes: Array<{ table: string }>) => void) {
          changeHandlers.delete(handler);
        },
      },
    }),
  },
}));

describe('CalendarWorkspace schedule navigation', () => {
  let scheduleState: { current: Schedule[] };
  let placeholderState: { current: PlaceholderSlot[] };

  beforeEach(() => {
    gotoDateMock.mockClear();
    getAllMock.mockReset();
    getInDateRangeMock.mockReset();
    scheduleState = { current: [schedule] as Schedule[] };
    placeholderState = { current: [placeholderSlot] as PlaceholderSlot[] };

    getAllMock.mockImplementation(async (collection: string) => {
      switch (collection) {
        case 'trimesters':
          return [trimester];
        case 'groups':
          return [group];
        case 'levels':
          return [level];
        case 'topics':
          return [];
        case 'schedules':
          return scheduleState.current;
        case 'holidays':
          return [];
        default:
          return [];
      }
    });
    getInDateRangeMock.mockImplementation(async (collection: string, start: string, end: string) => {
      if (collection === 'lessons') {
        return [];
      }

      if (collection === 'placeholderSlots') {
        return placeholderState.current.filter((slot) => start <= slot.date && slot.date <= end);
      }

      return [];
    });
  });

  afterEach(() => {
    getAllMock.mockReset();
    getInDateRangeMock.mockReset();
    changeHandlers.clear();
  });

  it('navigates to the earliest future schedule and renders its placeholder slot', async () => {
    render(<CalendarWorkspace />);

    await waitFor(() => {
      expect(gotoDateMock).toHaveBeenCalledTimes(1);
    });

    const calledDate = gotoDateMock.mock.calls[0][0] as Date;
    expect(format(calledDate, 'yyyy-MM-dd')).toBe(firstSessionDate);

    const placeholderChips = await screen.findAllByText('Grade 6A • Scheduled session');
    expect(placeholderChips.length).toBeGreaterThanOrEqual(2);

    await screen.findByTestId(
      `event-expected_placeholder_${schedule.id}_${secondSessionDate}_${schedule.sessions[0]!.startTime}_${schedule.sessions[0]!.endTime}`
    );

    expect(
      getInDateRangeMock.mock.calls.some((call) => {
        const [collection, start, end] = call;
        return (
          collection === 'placeholderSlots' &&
          start <= placeholderSlot.date &&
          placeholderSlot.date <= end
        );
      })
    ).toBe(true);
  });

  it('refreshes schedules and placeholders when Dexie change events fire', async () => {
    render(<CalendarWorkspace />);

    await screen.findByTestId(
      `event-expected_placeholder_${schedule.id}_${firstSessionDate}_${schedule.sessions[0]!.startTime}_${schedule.sessions[0]!.endTime}`
    );

    const updatedSessionDayOfWeek = 5;
    const updatedSessionOffset =
      (updatedSessionDayOfWeek - getISODay(trimesterStartDateObj) + 7) % 7;
    const updatedFirstSessionDateObj = addDays(trimesterStartDateObj, updatedSessionOffset);
    const updatedFirstSessionDate = format(updatedFirstSessionDateObj, 'yyyy-MM-dd');

    const updatedSchedule: Schedule = {
      ...schedule,
      sessions: [
        {
          dayOfWeek: updatedSessionDayOfWeek,
          startTime: '13:00',
          endTime: '14:30',
        },
      ],
    };

    const updatedPlaceholder: PlaceholderSlot = {
      ...placeholderSlot,
      date: updatedFirstSessionDate,
      startTime: '13:00',
      endTime: '14:30',
      dayOfWeek: updatedSessionDayOfWeek,
      durationMinutes: 90,
      id: `placeholder_${updatedSchedule.id}_${updatedFirstSessionDate}_13:00_14:30`,
      source: 'schedule',
    };

    scheduleState.current = [updatedSchedule];
    placeholderState.current = [updatedPlaceholder];

    const initialScheduleFetches = getAllMock.mock.calls.filter((call) => call[0] === 'schedules').length;
    const initialPlaceholderFetches = getInDateRangeMock.mock.calls.filter(
      (call) => call[0] === 'placeholderSlots'
    ).length;

    emitDexieChanges([
      { table: 'schedules' },
      { table: 'placeholderSlots' },
    ]);

    await waitFor(() => {
      expect(
        getAllMock.mock.calls.filter((call) => call[0] === 'schedules').length
      ).toBeGreaterThan(initialScheduleFetches);
    });

    await waitFor(() => {
      expect(
        getInDateRangeMock.mock.calls.filter((call) => call[0] === 'placeholderSlots').length
      ).toBeGreaterThan(initialPlaceholderFetches);
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(
          `event-placeholder_${updatedSchedule.id}_${updatedFirstSessionDate}_13:00_14:30`
        )
      ).toBeInTheDocument();
    });

    const placeholderEventIds = screen
      .getAllByTestId(/^event-placeholder_/)
      .map((element) => element.getAttribute('data-testid'));

    expect(placeholderEventIds).toContain(
      `event-placeholder_${updatedSchedule.id}_${updatedFirstSessionDate}_13:00_14:30`
    );
  });
});
