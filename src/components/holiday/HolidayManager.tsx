import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';
import { CalendarPlus, Filter, Users, X } from 'lucide-react';
import type { Group, Holiday, HolidayType, Level } from '../../data/types';
import { DataStore } from '../../data/db';

const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  public_holiday: 'Public holiday',
  school_break: 'School break',
  teacher_day: 'Teacher planning day',
  field_trip: 'Field trip',
  assembly: 'Assembly',
  other: 'Other',
};

const COLOR_PRESETS = ['#38bdf8', '#f97316', '#a855f7', '#22c55e', '#facc15', '#f43f5e'];

type ScopeOption = 'all' | 'levels' | 'groups';

type FormState = {
  id: string | null;
  name: string;
  startDate: string;
  endDate: string;
  type: HolidayType;
  color: string;
  showOnCalendar: boolean;
  scope: ScopeOption;
  selectedLevelIds: string[];
  selectedGroupIds: string[];
};

function createEmptyForm(): FormState {
  return {
    id: null,
    name: '',
    startDate: '',
    endDate: '',
    type: 'public_holiday',
    color: COLOR_PRESETS[0],
    showOnCalendar: true,
    scope: 'all',
    selectedLevelIds: [],
    selectedGroupIds: [],
  };
}

function computeDurationDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return 0;
    }
    return differenceInCalendarDays(end, start) + 1;
  } catch (error) {
    console.warn('Failed to compute holiday duration', error);
    return 0;
  }
}

function formatDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 'Dates not set';
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 'Dates not set';
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  } catch (error) {
    console.warn('Failed to format date range', error);
    return 'Dates not set';
  }
}

function describeScope(
  holiday: Holiday,
  levels: Level[],
  groups: Group[],
): string {
  if (holiday.affectsGroups.includes('all')) {
    return 'All groups';
  }

  const groupsByLevel = levels.map((level) => {
    const levelGroups = groups.filter((group) => group.levelId === level.id);
    const coveredGroups = levelGroups.filter((group) => holiday.affectsGroups.includes(group.displayName));
    if (coveredGroups.length === levelGroups.length && levelGroups.length > 0) {
      return level;
    }
    return null;
  });

  const fullyCoveredLevels = groupsByLevel.filter((level): level is Level => Boolean(level));
  if (fullyCoveredLevels.length > 0) {
    return `Levels: ${fullyCoveredLevels
      .map((level) => `${level.gradeNumber}${level.subject ? ` ${level.subject}` : ''}`)
      .join(', ')}`;
  }

  const affectedGroups = holiday.affectsGroups
    .map((name) => groups.find((group) => group.displayName === name)?.displayName)
    .filter((name): name is string => Boolean(name));

  if (affectedGroups.length > 0) {
    return `Groups: ${affectedGroups.join(', ')}`;
  }

  return 'Custom selection';
}

export function HolidayManager() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [formState, setFormState] = useState<FormState>(createEmptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [holidayRows, levelRows, groupRows] = await Promise.all([
      DataStore.getAll('holidays'),
      DataStore.getAll('levels'),
      DataStore.getAll('groups'),
    ]);

    holidayRows.sort((a, b) => a.startDate.localeCompare(b.startDate));
    levelRows.sort((a, b) => a.gradeNumber - b.gradeNumber || a.subject.localeCompare(b.subject));
    groupRows.sort((a, b) => a.displayName.localeCompare(b.displayName));

    setHolidays(holidayRows);
    setLevels(levelRows);
    setGroups(groupRows);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const groupsByLevel = useMemo(() => {
    return levels.reduce<Record<string, Group[]>>((acc, level) => {
      acc[level.id] = groups.filter((group) => group.levelId === level.id);
      return acc;
    }, {});
  }, [levels, groups]);

  const durationDays = useMemo(
    () => computeDurationDays(formState.startDate, formState.endDate),
    [formState.endDate, formState.startDate],
  );

  function resetForm() {
    setFormState(createEmptyForm());
    setMode('idle');
    setError(null);
  }

  function beginCreate() {
    setFormState(createEmptyForm());
    setMode('create');
    setError(null);
  }

  function mapHolidayToForm(holiday: Holiday): FormState {
    const base: FormState = {
      id: holiday.id,
      name: holiday.name,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
      type: holiday.type,
      color: holiday.displayColor ?? COLOR_PRESETS[0],
      showOnCalendar: holiday.showOnCalendar,
      scope: 'groups',
      selectedLevelIds: [],
      selectedGroupIds: [],
    };

    if (holiday.affectsGroups.includes('all')) {
      return { ...base, scope: 'all' };
    }

    const groupNameSet = new Set(holiday.affectsGroups);
    const matchedLevels: string[] = [];

    levels.forEach((level) => {
      const levelGroupDisplayNames = groups
        .filter((group) => group.levelId === level.id)
        .map((group) => group.displayName);
      if (
        levelGroupDisplayNames.length > 0 &&
        levelGroupDisplayNames.every((name) => groupNameSet.has(name))
      ) {
        matchedLevels.push(level.id);
      }
    });

    const groupNamesFromLevels = new Set<string>();
    matchedLevels.forEach((levelId) => {
      const levelGroups = groupsByLevel[levelId] ?? [];
      levelGroups.forEach((group) => {
        groupNamesFromLevels.add(group.displayName);
      });
    });

    const unmatchedGroupNames = [...groupNameSet].filter((name) => !groupNamesFromLevels.has(name));

    if (matchedLevels.length > 0 && unmatchedGroupNames.length === 0) {
      return {
        ...base,
        scope: 'levels',
        selectedLevelIds: matchedLevels,
      };
    }

    return {
      ...base,
      scope: 'groups',
      selectedGroupIds: groups
        .filter((group) => groupNameSet.has(group.displayName))
        .map((group) => group.id),
    };
  }

  function beginEdit(holiday: Holiday) {
    setFormState(mapHolidayToForm(holiday));
    setMode('edit');
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.name || !formState.startDate || !formState.endDate) {
      setError('Name, start date, and end date are required to save a holiday.');
      return;
    }

    let affectsGroups: string[] = [];

    if (formState.scope === 'all') {
      affectsGroups = ['all'];
    } else if (formState.scope === 'levels') {
      const names = new Set<string>();
      formState.selectedLevelIds.forEach((levelId) => {
        const levelGroups = groupsByLevel[levelId] ?? [];
        levelGroups.forEach((group) => {
          names.add(group.displayName);
        });
      });
      affectsGroups = [...names];
    } else {
      affectsGroups = groups
        .filter((group) => formState.selectedGroupIds.includes(group.id))
        .map((group) => group.displayName);
    }

    if (affectsGroups.length === 0) {
      setError('Select at least one level or group to scope the holiday.');
      return;
    }

    const payload: Holiday = {
      id: formState.id ?? crypto.randomUUID(),
      name: formState.name,
      startDate: formState.startDate,
      endDate: formState.endDate,
      affectsGroups,
      type: formState.type,
      displayColor: formState.color,
      showOnCalendar: formState.showOnCalendar,
    };

    try {
      setIsSaving(true);
      if (mode === 'edit' && formState.id) {
        await DataStore.update('holidays', formState.id, payload);
      } else {
        await DataStore.save('holidays', payload);
      }
      await loadData();
      resetForm();
    } catch (err) {
      console.error('Failed to save holiday', err);
      setError(err instanceof Error ? err.message : 'Failed to save holiday.');
    } finally {
      setIsSaving(false);
    }
  }

  const sortedHolidays = useMemo(() => {
    return [...holidays].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [holidays]);

  const activeHolidayId = formState.id;

  return (
    <section
      aria-labelledby="holiday-manager-heading"
      className="rounded-3xl border border-white/10 bg-slate-900/80 p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
            <CalendarPlus className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="holiday-manager-heading" className="text-2xl font-semibold text-white">
              Holiday manager
            </h2>
            <p className="text-sm text-slate-400">
              Capture school closures, breaks, and special events to automatically block impacted sessions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-400"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Add holiday
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4" aria-live="polite">
          {sortedHolidays.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-400">
              <p className="text-sm">No holidays logged yet. Add closures or events to block teaching days.</p>
            </div>
          ) : (
            sortedHolidays.map((holiday) => {
              const isActive = activeHolidayId === holiday.id && mode === 'edit';
              return (
                <article
                  key={holiday.id}
                  className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition focus-within:ring-2 focus-within:ring-indigo-400/60 ${
                    isActive ? 'ring-2 ring-indigo-400/60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 rounded-xl"
                        style={{ backgroundColor: holiday.displayColor ?? '#1e293b' }}
                        aria-hidden
                      />
                      <div>
                        <h3 className="text-lg font-semibold text-white">{holiday.name}</h3>
                        <p className="text-sm text-slate-400">{formatDateRange(holiday.startDate, holiday.endDate)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                        {HOLIDAY_TYPE_LABELS[holiday.type]}
                      </span>
                      <button
                        type="button"
                        onClick={() => beginEdit(holiday)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
                      >
                        <Filter className="h-3.5 w-3.5" aria-hidden />
                        Edit details
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Duration</dt>
                      <dd className="font-medium text-white/90">
                        {computeDurationDays(holiday.startDate, holiday.endDate)} day(s)
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Scope</dt>
                      <dd className="font-medium text-white/90">{describeScope(holiday, levels, groups)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Calendar visibility</dt>
                      <dd className="font-medium text-white/90">{holiday.showOnCalendar ? 'Visible' : 'Hidden'}</dd>
                    </div>
                  </dl>
                </article>
              );
            })
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {mode === 'edit' ? 'Edit holiday' : mode === 'create' ? 'Add holiday' : 'Select a holiday'}
            </h3>
            {mode !== 'idle' && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-white/80"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancel
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {mode === 'edit'
              ? 'Update holiday information to keep schedules and attendance accurate.'
              : mode === 'create'
                ? 'Block out dates and choose which levels or groups are impacted.'
                : 'Choose a holiday from the list or create a new one to begin editing.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="holiday-name" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Name
              </label>
              <input
                id="holiday-name"
                type="text"
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Winter break"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="holiday-start" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Start date
                </label>
                <input
                  id="holiday-start"
                  type="date"
                  value={formState.startDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
              </div>
              <div>
                <label htmlFor="holiday-end" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  End date
                </label>
                <input
                  id="holiday-end"
                  type="date"
                  value={formState.endDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="holiday-type" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Category
              </label>
              <select
                id="holiday-type"
                value={formState.type}
                onChange={(event) => setFormState((prev) => ({ ...prev, type: event.target.value as HolidayType }))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                {Object.entries(HOLIDAY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Duration</span>
                <p className="mt-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white">
                  {durationDays > 0 ? `${durationDays} day(s)` : '—'}
                </p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.showOnCalendar}
                  onChange={(event) => setFormState((prev) => ({ ...prev, showOnCalendar: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-400 focus:ring-indigo-400"
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Show on calendar
                </span>
              </label>
            </div>

            <div>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Holiday color</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = formState.color === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormState((prev) => ({ ...prev, color: preset }))}
                      className={`h-9 w-9 rounded-xl border-2 transition ${
                        isSelected ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: preset }}
                      aria-label={`Select color ${preset}`}
                    />
                  );
                })}
                <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                  <span>Custom</span>
                  <input
                    type="color"
                    value={formState.color}
                    onChange={(event) => setFormState((prev) => ({ ...prev, color: event.target.value }))}
                    className="h-6 w-10 cursor-pointer rounded border-none bg-transparent p-0"
                    aria-label="Pick custom color"
                  />
                </label>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scope</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormState((prev) => ({ ...prev, scope: 'all' }))}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                    formState.scope === 'all'
                      ? 'bg-indigo-500/80 text-white'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  All groups
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormState((prev) => ({
                      ...prev,
                      scope: 'levels',
                      selectedGroupIds: prev.selectedGroupIds,
                    }))
                  }
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                    formState.scope === 'levels'
                      ? 'bg-indigo-500/80 text-white'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Levels
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormState((prev) => ({
                      ...prev,
                      scope: 'groups',
                      selectedLevelIds: prev.selectedLevelIds,
                    }))
                  }
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                    formState.scope === 'groups'
                      ? 'bg-indigo-500/80 text-white'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Groups
                </button>
              </div>

              {formState.scope === 'levels' && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  {levels.length === 0 ? (
                    <p className="text-xs text-slate-400">Add levels to target specific cohorts.</p>
                  ) : (
                    levels.map((level) => {
                      const levelId = level.id;
                      const isChecked = formState.selectedLevelIds.includes(levelId);
                      const levelLabel = `${level.gradeNumber}${level.subject ? ` ${level.subject}` : ''}`;
                      const groupCount = groupsByLevel[levelId]?.length ?? 0;
                      return (
                        <label key={levelId} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setFormState((prev) => ({
                                  ...prev,
                                  selectedLevelIds: checked
                                    ? [...prev.selectedLevelIds, levelId]
                                    : prev.selectedLevelIds.filter((id) => id !== levelId),
                                }));
                              }}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-400 focus:ring-indigo-400"
                            />
                            <span>{levelLabel}</span>
                          </div>
                          <span className="text-xs text-slate-400">{groupCount} group(s)</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}

              {formState.scope === 'groups' && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  {groups.length === 0 ? (
                    <p className="text-xs text-slate-400">Add groups to assign targeted holidays.</p>
                  ) : (
                    groups.map((group) => {
                      const isChecked = formState.selectedGroupIds.includes(group.id);
                      const level = levels.find((level) => level.id === group.levelId);
                      const levelLabel = level
                        ? `${level.gradeNumber}${level.subject ? ` ${level.subject}` : ''}`
                        : 'Level';
                      return (
                        <label key={group.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setFormState((prev) => ({
                                  ...prev,
                                  selectedGroupIds: checked
                                    ? [...prev.selectedGroupIds, group.id]
                                    : prev.selectedGroupIds.filter((id) => id !== group.id),
                                }));
                              }}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-400 focus:ring-indigo-400"
                            />
                            <span>{group.displayName}</span>
                          </div>
                          <span className="text-xs text-slate-400">{levelLabel}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </fieldset>

            {error && <p className="text-xs font-medium text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={mode === 'idle' || isSaving}
              className="w-full rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {isSaving ? 'Saving…' : mode === 'edit' ? 'Update holiday' : 'Create holiday'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default HolidayManager;
