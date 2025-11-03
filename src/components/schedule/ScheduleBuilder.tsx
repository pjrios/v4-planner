import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock,
  PencilLine,
  Plus,
  RefreshCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { DataStore, db } from '../../data/db';
import { recomputePlaceholdersForSchedule } from '../../data/placeholders';
import type { Group, Level, Schedule, ScheduleSession, Trimester } from '../../data/types';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
];

const INITIAL_SESSION: ScheduleSession = {
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
};

const ALL_YEAR_PREFIX = 'all-year:';

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function sortSessions(sessions: ScheduleSession[]) {
  return [...sessions].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) {
      return a.dayOfWeek - b.dayOfWeek;
    }
    return a.startTime.localeCompare(b.startTime);
  });
}

function isAllYearSelection(value: string | null): value is `${typeof ALL_YEAR_PREFIX}${string}` {
  return typeof value === 'string' && value.startsWith(ALL_YEAR_PREFIX);
}

function parseAcademicYearFromSelection(selection: `${typeof ALL_YEAR_PREFIX}${string}`) {
  return selection.slice(ALL_YEAR_PREFIX.length);
}

function sessionsMatch(sortedReference: ScheduleSession[], candidate: ScheduleSession[]) {
  if (sortedReference.length !== candidate.length) {
    return false;
  }

  const normalizedCandidate = sortSessions(candidate);
  return sortedReference.every((session, index) => {
    const comparison = normalizedCandidate[index];
    return (
      comparison &&
      comparison.dayOfWeek === session.dayOfWeek &&
      comparison.startTime === session.startTime &&
      comparison.endTime === session.endTime
    );
  });
}

function sortTrimestersByStart(trimesters: Trimester[]) {
  return [...trimesters].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function hasConflict(sessions: ScheduleSession[], candidate: ScheduleSession) {
  const candidateStart = toMinutes(candidate.startTime);
  const candidateEnd = toMinutes(candidate.endTime);

  return sessions.some((session) => {
    if (session.dayOfWeek !== candidate.dayOfWeek) return false;
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    const overlaps = candidateStart < end && candidateEnd > start;
    return overlaps;
  });
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return '0h';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!remaining) {
    return `${hours}h`;
  }
  return `${hours}h ${remaining}m`;
}

export function ScheduleBuilder() {
  const [trimesters, setTrimesters] = useState<Trimester[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [selectedTrimesterId, setSelectedTrimesterId] = useState<string | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [draftSessions, setDraftSessions] = useState<ScheduleSession[]>([]);
  const [sessionForm, setSessionForm] = useState<ScheduleSession>(INITIAL_SESSION);
  const [editingSessionIndex, setEditingSessionIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [loadedTrimesters, loadedLevels, loadedGroups, loadedSchedules] = await Promise.all([
      DataStore.getAll('trimesters'),
      DataStore.getAll('levels'),
      DataStore.getAll('groups'),
      DataStore.getAll('schedules'),
    ]);

    loadedTrimesters.sort((a, b) => a.startDate.localeCompare(b.startDate));
    loadedLevels.sort((a, b) => a.gradeNumber - b.gradeNumber);
    loadedGroups.sort((a, b) => a.displayName.localeCompare(b.displayName));

    setTrimesters(loadedTrimesters);
    setLevels(loadedLevels);
    setGroups(loadedGroups);
    setSchedules(loadedSchedules);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Listen for changes to trimesters, levels, groups, and schedules
  useEffect(() => {
    const handler = (changes: Array<{ table: string | undefined }>) => {
      let shouldReload = false;

      for (const change of changes) {
        if (change.table === 'trimesters' || change.table === 'levels' || change.table === 'groups' || change.table === 'schedules') {
          shouldReload = true;
          break;
        }
      }

      if (shouldReload) {
        void loadData();
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
      ['levels', db.levels.hook],
      ['groups', db.groups.hook],
      ['schedules', db.schedules.hook],
    ] as const;

    for (const [table, hooks] of tablesToWatch) {
      if (!hooks) {
        continue;
      }

      const emit = () => {
        handler([{ table }]);
      };

      const subscribeToHook = (hook: typeof hooks.creating, subscriber: () => void) => {
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
  }, [loadData]);

  useEffect(() => {
    if (!selectedTrimesterId && trimesters.length) {
      setSelectedTrimesterId(sortTrimestersByStart(trimesters)[0]?.id ?? null);
    }
  }, [selectedTrimesterId, trimesters]);

  useEffect(() => {
    if (!selectedLevelId && levels.length) {
      setSelectedLevelId(levels[0].id);
    }
  }, [selectedLevelId, levels]);

  const groupsForLevel = useMemo(() => {
    if (!selectedLevelId) return [];
    return groups.filter((group) => group.levelId === selectedLevelId);
  }, [groups, selectedLevelId]);

  useEffect(() => {
    if (!selectedGroupId && groupsForLevel.length) {
      setSelectedGroupId(groupsForLevel[0].id);
    }
  }, [selectedGroupId, groupsForLevel]);

  const groupedTrimestersByYear = useMemo(() => {
    const groupsByYear = new Map<
      string,
      { year: string; trimesters: Trimester[]; earliestStart: string }
    >();

    for (const trimester of trimesters) {
      const existing = groupsByYear.get(trimester.academicYear);
      if (!existing) {
        groupsByYear.set(trimester.academicYear, {
          year: trimester.academicYear,
          earliestStart: trimester.startDate,
          trimesters: [trimester],
        });
      } else {
        existing.trimesters.push(trimester);
        if (trimester.startDate < existing.earliestStart) {
          existing.earliestStart = trimester.startDate;
        }
      }
    }

    return Array.from(groupsByYear.values()).sort((a, b) =>
      a.earliestStart.localeCompare(b.earliestStart)
    );
  }, [trimesters]);

  const isAllYear = isAllYearSelection(selectedTrimesterId);
  const selectedAcademicYear = isAllYear ? parseAcademicYearFromSelection(selectedTrimesterId) : null;

  const trimestersForSelection = useMemo(() => {
    if (!isAllYear || !selectedAcademicYear) {
      return [] as Trimester[];
    }

    return sortTrimestersByStart(
      trimesters.filter((trimester) => trimester.academicYear === selectedAcademicYear)
    );
  }, [isAllYear, selectedAcademicYear, trimesters]);

  const activeSchedule = useMemo(() => {
    if (!selectedTrimesterId || !selectedGroupId || isAllYear) return null;
    return (
      schedules.find(
        (schedule) => schedule.trimesterId === selectedTrimesterId && schedule.groupId === selectedGroupId
      ) ?? null
    );
  }, [isAllYear, selectedGroupId, selectedTrimesterId, schedules]);

  const schedulesForAcademicYear = useMemo(() => {
    if (!isAllYear || !selectedGroupId || !trimestersForSelection.length) {
      return [] as Schedule[];
    }

    const trimesterIds = new Set(trimestersForSelection.map((trimester) => trimester.id));
    return schedules.filter(
      (schedule) => schedule.groupId === selectedGroupId && trimesterIds.has(schedule.trimesterId)
    );
  }, [isAllYear, schedules, selectedGroupId, trimestersForSelection]);

  const allYearSessionState = useMemo(() => {
    if (!isAllYear) {
      return { sessions: [] as ScheduleSession[], inconsistent: false, scheduleCount: 0 };
    }

    if (!schedulesForAcademicYear.length) {
      return { sessions: [] as ScheduleSession[], inconsistent: false, scheduleCount: 0 };
    }

    const baseSessions = sortSessions(schedulesForAcademicYear[0]?.sessions ?? []);
    const inconsistent = schedulesForAcademicYear.slice(1).some((schedule) => {
      return !sessionsMatch(baseSessions, schedule.sessions);
    });

    return {
      sessions: baseSessions,
      inconsistent,
      scheduleCount: schedulesForAcademicYear.length,
    };
  }, [isAllYear, schedulesForAcademicYear]);

  const initialSessions = useMemo(() => {
    if (isAllYear) {
      return allYearSessionState.sessions;
    }

    return activeSchedule ? sortSessions(activeSchedule.sessions) : ([] as ScheduleSession[]);
  }, [activeSchedule, allYearSessionState.sessions, isAllYear]);

  useEffect(() => {
    setDraftSessions(initialSessions);
    setFeedback(null);
  }, [initialSessions]);

  const sessionsByDay = useMemo(() => {
    return DAYS_OF_WEEK.reduce<Record<number, ScheduleSession[]>>((acc, day) => {
      acc[day.value] = draftSessions
        .filter((session) => session.dayOfWeek === day.value)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      return acc;
    }, {} as Record<number, ScheduleSession[]>);
  }, [draftSessions]);

  const totalMinutes = useMemo(() => {
    return draftSessions.reduce((minutes, session) => {
      return minutes + Math.max(0, toMinutes(session.endTime) - toMinutes(session.startTime));
    }, 0);
  }, [draftSessions]);

  function resetForm() {
    setSessionForm(INITIAL_SESSION);
    setEditingSessionIndex(null);
  }

  function handleSessionFormChange(update: Partial<ScheduleSession>) {
    setSessionForm((previous) => ({ ...previous, ...update }));
  }

  function handleAddSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroupId || !selectedTrimesterId) {
      setFeedback({ type: 'error', message: 'Select a trimester, level, and group before adding sessions.' });
      return;
    }

    const { dayOfWeek, startTime, endTime } = sessionForm;

    if (!startTime || !endTime) {
      setFeedback({ type: 'error', message: 'Start and end time are required.' });
      return;
    }

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setFeedback({ type: 'error', message: 'Session end time must be after the start time.' });
      return;
    }

    // Check conflicts but exclude the session being edited
    const sessionsToCheck = editingSessionIndex !== null 
      ? draftSessions.filter((_, idx) => idx !== editingSessionIndex)
      : draftSessions;
    
    const conflictTest = hasConflict(sessionsToCheck, sessionForm);
    if (conflictTest) {
      setFeedback({ type: 'error', message: 'This session overlaps with an existing session for the day.' });
      return;
    }

    if (editingSessionIndex !== null) {
      // Update existing session
      setDraftSessions((current) => {
        const updated = [...current];
        updated[editingSessionIndex] = sessionForm;
        return sortSessions(updated);
      });
      setFeedback({ type: 'success', message: `${DAYS_OF_WEEK[dayOfWeek - 1]?.label ?? 'Day'} session updated.` });
    } else {
      // Add new session
      setDraftSessions((current) => sortSessions([...current, sessionForm]));
      setFeedback({ type: 'success', message: `${DAYS_OF_WEEK[dayOfWeek - 1]?.label ?? 'Day'} session added.` });
    }
    resetForm();
  }

  function handleEditSession(index: number) {
    const session = draftSessions[index];
    if (session) {
      setSessionForm(session);
      setEditingSessionIndex(index);
    }
  }

  function handleRemoveSession(index: number) {
    setDraftSessions((current) => current.filter((_, idx) => idx !== index));
    setFeedback(null);
    if (editingSessionIndex === index) {
      resetForm();
    }
  }

  async function handleRestore() {
    if (isAllYear) {
      setDraftSessions(initialSessions);
      setFeedback({
        type: 'success',
        message: initialSessions.length
          ? 'All-year schedule restored to last saved version.'
          : 'All-year schedule cleared.',
      });
      return;
    }

    if (activeSchedule) {
      setDraftSessions(sortSessions(activeSchedule.sessions));
      setFeedback({ type: 'success', message: 'Schedule restored to last saved version.' });
    } else {
      setDraftSessions([]);
      setFeedback({ type: 'success', message: 'Schedule cleared.' });
    }
  }

  async function handleSaveSchedule() {
    if (!selectedTrimesterId || !selectedGroupId) {
      setFeedback({ type: 'error', message: 'Select a trimester, level, and group before saving.' });
      return;
    }

    try {
      setIsSaving(true);
      if (isAllYear) {
        if (!selectedAcademicYear) {
          throw new Error('Missing academic year for all-year schedule.');
        }

        const relevantTrimesters = trimestersForSelection;
        if (!relevantTrimesters.length) {
          throw new Error('No trimesters found for the selected academic year.');
        }

        const sortedSessions = sortSessions(draftSessions);
        const existingSchedules = new Map(
          schedulesForAcademicYear.map((schedule) => [schedule.trimesterId, schedule])
        );

        const payloads: Schedule[] = relevantTrimesters.map((trimester) => ({
          id: existingSchedules.get(trimester.id)?.id ?? crypto.randomUUID(),
          trimesterId: trimester.id,
          groupId: selectedGroupId,
          sessions: sortedSessions,
        }));

        await DataStore.bulkSave('schedules', payloads);
        const allSchedules = await DataStore.getAll('schedules');
        setSchedules(allSchedules);

        let totalPlaceholders = 0;
        for (const payload of payloads) {
          totalPlaceholders += await recomputePlaceholdersForSchedule(payload);
        }

        const noun = totalPlaceholders === 1 ? 'placeholder slot' : 'placeholder slots';
        setFeedback({
          type: 'success',
          message: `Schedule saved across ${payloads.length} trimesters. ${totalPlaceholders} ${noun} refreshed.`,
        });
      } else {
        const payload: Schedule = {
          id: activeSchedule?.id ?? crypto.randomUUID(),
          trimesterId: selectedTrimesterId,
          groupId: selectedGroupId,
          sessions: sortSessions(draftSessions),
        };

        await DataStore.save('schedules', payload);
        const allSchedules = await DataStore.getAll('schedules');
        setSchedules(allSchedules);
        const placeholderCount = await recomputePlaceholdersForSchedule(payload);
        const noun = placeholderCount === 1 ? 'placeholder slot' : 'placeholder slots';
        setFeedback({
          type: 'success',
          message: `Schedule saved. ${placeholderCount} ${noun} refreshed.`,
        });
      }
    } catch (error) {
      console.error('Failed to save schedule', error);
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save schedule.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  const selectionDisabled = !trimesters.length || !levels.length || !groupsForLevel.length;

  return (
    <section aria-labelledby="schedule-builder-heading" className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <CalendarRange className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="schedule-builder-heading" className="text-2xl font-semibold text-white">
              Schedule builder
            </h2>
            <p className="text-sm text-slate-400">
              Map weekly sessions for each group, validate overlaps, and sync everything with the calendar pipeline.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Reset changes
          </button>
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={selectionDisabled || isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-accent/40"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {isSaving ? 'Saving...' : 'Save schedule'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium text-slate-300">Trimester</span>
          <select
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            value={selectedTrimesterId ?? ''}
            onChange={(event) => setSelectedTrimesterId(event.target.value || null)}
          >
            {groupedTrimestersByYear.map((entry) => (
              <optgroup key={entry.year} label={entry.year}>
                <option value={`${ALL_YEAR_PREFIX}${entry.year}`}>All year · {entry.year}</option>
                {sortTrimestersByStart(entry.trimesters).map((trimester) => (
                  <option key={trimester.id} value={trimester.id}>
                    {trimester.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium text-slate-300">Level</span>
          <select
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            value={selectedLevelId ?? ''}
            onChange={(event) => {
              const value = event.target.value || null;
              setSelectedLevelId(value);
              setSelectedGroupId(null);
            }}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                Grade {level.gradeNumber} · {level.subject}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium text-slate-300">Group</span>
          <select
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            value={selectedGroupId ?? ''}
            onChange={(event) => setSelectedGroupId(event.target.value || null)}
          >
            {groupsForLevel.map((group) => (
              <option key={group.id} value={group.id}>
                {group.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAllYear && selectedAcademicYear && trimestersForSelection.length > 0 && (
        <div
          className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
            allYearSessionState.inconsistent
              ? 'border-orange-400/30 bg-orange-500/10 text-orange-100'
              : 'border-accent/20 bg-accent/5 text-accent'
          }`}
        >
          {allYearSessionState.inconsistent ? (
            <p>
              Existing trimester schedules for {selectedAcademicYear} differ. Saving will overwrite all{' '}
              {trimestersForSelection.length} trimesters with the plan below.
            </p>
          ) : (
            <p>
              Updates will apply to all {trimestersForSelection.length} trimesters in {selectedAcademicYear}.
            </p>
          )}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-orange-400/30 bg-orange-500/10 text-orange-100'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      <div className="mt-8 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Weekly grid</h3>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatDuration(totalMinutes)} / week
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Sessions are grouped by weekday and sorted by start time. Add more below to see conflicts immediately.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {DAYS_OF_WEEK.map((day) => {
              const daySessions = sessionsByDay[day.value] ?? [];
              return (
                <div key={day.value} className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                  <header className="flex items-center justify-between text-sm font-semibold text-slate-200">
                    <span>{day.label}</span>
                    <span className="text-xs font-medium text-slate-500">{daySessions.length || '–'}</span>
                  </header>
                  {daySessions.length ? (
                    <ul className="space-y-2">
                      {daySessions.map((session, index) => (
                        <li
                          key={`${session.dayOfWeek}-${session.startTime}-${session.endTime}-${index}`}
                          className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                        >
                          <span className="font-medium">{session.startTime}</span>
                          <span className="text-slate-400">to</span>
                          <span className="font-medium">{session.endTime}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No sessions yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleAddSession} className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <h3 className="text-lg font-semibold text-white">Add weekly session</h3>
            <p className="mt-1 text-sm text-slate-400">
              Pick a day and time window. Conflicts are checked automatically before the session is added.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
                <span className="font-medium text-slate-300">Day of week</span>
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  value={sessionForm.dayOfWeek}
                  onChange={(event) => handleSessionFormChange({ dayOfWeek: Number(event.target.value) })}
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span className="font-medium text-slate-300">Start time</span>
                <input
                  type="time"
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  value={sessionForm.startTime}
                  onChange={(event) => handleSessionFormChange({ startTime: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span className="font-medium text-slate-300">End time</span>
                <input
                  type="time"
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  value={sessionForm.endTime}
                  onChange={(event) => handleSessionFormChange({ endTime: event.target.value })}
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-200/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-200/20"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {editingSessionIndex !== null ? 'Update session' : 'Add session'}
            </button>
            {editingSessionIndex !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Cancel
              </button>
            )}
          </form>

          <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <h3 className="text-lg font-semibold text-white">Current sessions</h3>
            {draftSessions.length ? (
              <ul className="mt-4 space-y-3">
                {draftSessions.map((session, index) => {
                  const day = DAYS_OF_WEEK.find((dayOfWeek) => dayOfWeek.value === session.dayOfWeek);
                  return (
                    <li
                      key={`${session.dayOfWeek}-${session.startTime}-${session.endTime}-${index}`}
                      className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm text-slate-200 ${
                        editingSessionIndex === index
                          ? 'border-accent/60 bg-accent/10'
                          : 'border-white/10 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wide text-slate-500">{day?.short ?? session.dayOfWeek}</span>
                        <span className="font-medium">
                          {session.startTime} – {session.endTime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditSession(index)}
                          className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent transition hover:border-accent/70 hover:bg-accent/20"
                        >
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSession(index)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                No sessions configured yet. Add time slots above to build the weekly cadence for this group.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
