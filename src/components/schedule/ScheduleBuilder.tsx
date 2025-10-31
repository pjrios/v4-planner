import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { DataStore } from '../../data/db';
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

  useEffect(() => {
    if (!selectedTrimesterId && trimesters.length) {
      setSelectedTrimesterId(trimesters[0].id);
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

  const activeSchedule = useMemo(() => {
    if (!selectedTrimesterId || !selectedGroupId) return null;
    return (
      schedules.find(
        (schedule) => schedule.trimesterId === selectedTrimesterId && schedule.groupId === selectedGroupId
      ) ?? null
    );
  }, [selectedGroupId, selectedTrimesterId, schedules]);

  useEffect(() => {
    if (activeSchedule) {
      setDraftSessions(sortSessions(activeSchedule.sessions));
    } else {
      setDraftSessions([]);
    }
    setFeedback(null);
  }, [activeSchedule]);

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

    if (hasConflict(draftSessions, sessionForm)) {
      setFeedback({ type: 'error', message: 'This session overlaps with an existing session for the day.' });
      return;
    }

    setDraftSessions((current) => sortSessions([...current, sessionForm]));
    setFeedback({ type: 'success', message: `${DAYS_OF_WEEK[dayOfWeek - 1]?.label ?? 'Day'} session added.` });
    resetForm();
  }

  function handleRemoveSession(index: number) {
    setDraftSessions((current) => current.filter((_, idx) => idx !== index));
    setFeedback(null);
  }

  async function handleRestore() {
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

    const payload: Schedule = {
      id: activeSchedule?.id ?? crypto.randomUUID(),
      trimesterId: selectedTrimesterId,
      groupId: selectedGroupId,
      sessions: sortSessions(draftSessions),
    };

    try {
      setIsSaving(true);
      await DataStore.save('schedules', payload);
      const allSchedules = await DataStore.getAll('schedules');
      setSchedules(allSchedules);
      setFeedback({ type: 'success', message: 'Schedule saved successfully.' });
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
            {trimesters.map((trimester) => (
              <option key={trimester.id} value={trimester.id}>
                {trimester.name} · {trimester.academicYear}
              </option>
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
              Add session
            </button>
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
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wide text-slate-500">{day?.short ?? session.dayOfWeek}</span>
                        <span className="font-medium">
                          {session.startTime} – {session.endTime}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSession(index)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
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
