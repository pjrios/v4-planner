import { addDays, format, getISODay, startOfDay } from 'date-fns';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';

import type { Group, Level, PlaceholderSlot, Schedule, Trimester } from '../../data/types';
import { CalendarWorkspace } from './CalendarWorkspace';

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
  source: 'expected',
};

vi.mock('../../data/db', () => ({
  DataStore: {
    getAll: getAllMock,
    getInDateRange: getInDateRangeMock,
  },
}));

describe('CalendarWorkspace schedule navigation', () => {
  beforeEach(() => {
    gotoDateMock.mockClear();
    getAllMock.mockReset();
    getInDateRangeMock.mockReset();
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
          return [schedule];
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
        return start <= placeholderSlot.date && placeholderSlot.date <= end
          ? [placeholderSlot]
          : [];
      }

      return [];
    });
  });

  afterEach(() => {
    getAllMock.mockReset();
    getInDateRangeMock.mockReset();
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
});
