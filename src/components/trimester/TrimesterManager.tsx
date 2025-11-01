import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInBusinessDays, differenceInCalendarWeeks, format, parseISO } from 'date-fns';
import { CalendarDays, PencilLine, Plus, X } from 'lucide-react';
import type { AcademicStatus, Trimester } from '../../data/types';
import { DataStore } from '../../data/db';

const STATUS_LABELS: Record<AcademicStatus, string> = {
  upcoming: 'Upcoming',
  current: 'In progress',
  completed: 'Completed',
};

const COLOR_PRESETS = ['#4ECDC4', '#EE964B', '#A182E2', '#94A3B8', '#F97316', '#14B8A6'];

type FormState = {
  id: string | null;
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  color: string;
  status: AcademicStatus;
};

function createEmptyForm(): FormState {
  const today = new Date();
  const defaultYear = `${today.getFullYear()}-${today.getFullYear() + 1}`;
  return {
    id: null,
    name: '',
    academicYear: defaultYear,
    startDate: '',
    endDate: '',
    color: COLOR_PRESETS[0],
    status: 'upcoming',
  };
}

function computeDurations(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    return { totalWeeks: 0, schoolDays: 0 };
  }

  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return { totalWeeks: 0, schoolDays: 0 };
    }

    const totalWeeks = differenceInCalendarWeeks(end, start) + 1;
    const schoolDays = differenceInBusinessDays(end, start) + 1;

    return {
      totalWeeks: Math.max(totalWeeks, 0),
      schoolDays: Math.max(schoolDays, 0),
    };
  } catch (error) {
    console.warn('Failed to compute trimester duration', error);
    return { totalWeeks: 0, schoolDays: 0 };
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

export function TrimesterManager() {
  const [trimesters, setTrimesters] = useState<Trimester[]>([]);
  const [formState, setFormState] = useState<FormState>(createEmptyForm);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrimesters = useCallback(async () => {
    const all = await DataStore.getAll('trimesters');
    all.sort((a, b) => a.startDate.localeCompare(b.startDate));
    setTrimesters(all);
  }, []);

  useEffect(() => {
    void loadTrimesters();
  }, [loadTrimesters]);

  const { totalWeeks, schoolDays } = useMemo(
    () => computeDurations(formState.startDate, formState.endDate),
    [formState.startDate, formState.endDate]
  );

  const activeTrimesterId = formState.id;

  const sortedTrimesters = useMemo(() => {
    return [...trimesters].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [trimesters]);

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

  function beginEdit(trimester: Trimester) {
    setFormState({
      id: trimester.id,
      name: trimester.name,
      academicYear: trimester.academicYear,
      startDate: trimester.startDate,
      endDate: trimester.endDate,
      color: trimester.color,
      status: trimester.status,
    });
    setMode('edit');
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.name || !formState.startDate || !formState.endDate) {
      setError('Name, start date, and end date are required to save a trimester.');
      return;
    }

    const payload: Trimester = {
      id: formState.id ?? crypto.randomUUID(),
      name: formState.name,
      academicYear: formState.academicYear,
      startDate: formState.startDate,
      endDate: formState.endDate,
      color: formState.color,
      status: formState.status,
      totalWeeks,
      schoolDays,
    };

    try {
      setIsSaving(true);
      if (mode === 'edit' && formState.id) {
        await DataStore.update('trimesters', formState.id, payload);
      } else {
        await DataStore.save('trimesters', payload);
      }
      await loadTrimesters();
      resetForm();
    } catch (err) {
      console.error('Failed to save trimester', err);
      setError(err instanceof Error ? err.message : 'Failed to save trimester.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="trimester-manager-heading" className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="trimester-manager-heading" className="text-2xl font-semibold text-white">
              Trimester manager
            </h2>
            <p className="text-sm text-slate-400">
              Track academic periods, adjust timelines, and color code each trimester for quick calendar scanning.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New trimester
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4" aria-live="polite">
          {sortedTrimesters.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-400">
              <p className="text-sm">No trimesters yet. Add your first academic period to get started.</p>
            </div>
          ) : (
            sortedTrimesters.map((trimester) => {
              const isActive = activeTrimesterId === trimester.id && mode === 'edit';
              return (
                <article
                  key={trimester.id}
                  className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition focus-within:ring-2 focus-within:ring-accent/60 ${
                    isActive ? 'ring-2 ring-accent/60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 rounded-xl"
                        style={{ backgroundColor: trimester.color }}
                        aria-hidden
                      />
                      <div>
                        <h3 className="text-lg font-semibold text-white">{trimester.name}</h3>
                        <p className="text-sm text-slate-400">{formatDateRange(trimester.startDate, trimester.endDate)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                        {STATUS_LABELS[trimester.status]}
                      </span>
                      <button
                        type="button"
                        onClick={() => beginEdit(trimester)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-accent/80"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        Edit period
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Academic year</dt>
                      <dd className="font-medium text-white/90">{trimester.academicYear}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Total weeks</dt>
                      <dd className="font-medium text-white/90">{trimester.totalWeeks}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">School days</dt>
                      <dd className="font-medium text-white/90">{trimester.schoolDays}</dd>
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
              {mode === 'edit' ? 'Edit trimester' : mode === 'create' ? 'Add trimester' : 'Select a trimester'}
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
              ? 'Update the trimester timeline or color. Changes apply instantly to calendar views.'
              : mode === 'create'
                ? 'Provide start and end dates to calculate the teaching window automatically.'
                : 'Choose a trimester from the list or create a new one to begin editing.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="trimester-name" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Name
              </label>
              <input
                id="trimester-name"
                type="text"
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Trimester 1"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div>
              <label htmlFor="trimester-year" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Academic year
              </label>
              <input
                id="trimester-year"
                type="text"
                value={formState.academicYear}
                onChange={(event) => setFormState((prev) => ({ ...prev, academicYear: event.target.value }))}
                placeholder="2025-2026"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="trimester-start" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Start date
                </label>
                <input
                  id="trimester-start"
                  type="date"
                  value={formState.startDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label htmlFor="trimester-end" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  End date
                </label>
                <input
                  id="trimester-end"
                  type="date"
                  value={formState.endDate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Calculated weeks</span>
                <p className="mt-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white">
                  {totalWeeks > 0 ? totalWeeks : '—'}
                </p>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">School days</span>
                <p className="mt-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white">
                  {schoolDays > 0 ? schoolDays : '—'}
                </p>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Trimester color</span>
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

            <div>
              <label htmlFor="trimester-status" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Status
              </label>
              <select
                id="trimester-status"
                value={formState.status}
                onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as AcademicStatus }))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs font-medium text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={mode === 'idle' || isSaving}
              className="w-full rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {isSaving ? 'Saving…' : mode === 'edit' ? 'Update trimester' : 'Create trimester'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default TrimesterManager;
