import { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Palette, PencilLine, Plus, X } from 'lucide-react';
import type { Level } from '../../data/types';
import { DataStore } from '../../data/db';

const COLOR_PRESETS = ['#38bdf8', '#f97316', '#34d399', '#a855f7', '#ef4444', '#facc15'];

type FormState = {
  id: string | null;
  gradeNumber: string;
  subject: string;
  color: string;
};

function createEmptyForm(): FormState {
  return {
    id: null,
    gradeNumber: '',
    subject: '',
    color: COLOR_PRESETS[0],
  };
}

function describeLevel(level: Level) {
  const gradeLabel = Number.isFinite(level.gradeNumber) ? `Grade ${level.gradeNumber}` : 'Grade';
  const subjectLabel = level.subject ? level.subject : 'Subject not set';
  return `${gradeLabel} • ${subjectLabel}`;
}

export function LevelManager() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [formState, setFormState] = useState<FormState>(createEmptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLevels = useCallback(async () => {
    const rows = await DataStore.getAll('levels');
    rows.sort((a, b) => a.gradeNumber - b.gradeNumber || a.subject.localeCompare(b.subject));
    setLevels(rows);
  }, []);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  const sortedLevels = useMemo(() => {
    return [...levels].sort((a, b) => a.gradeNumber - b.gradeNumber || a.subject.localeCompare(b.subject));
  }, [levels]);

  const activeLevelId = formState.id;

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

  function beginEdit(level: Level) {
    setFormState({
      id: level.id,
      gradeNumber: String(level.gradeNumber ?? ''),
      subject: level.subject,
      color: level.color,
    });
    setMode('edit');
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedGrade = Number.parseInt(formState.gradeNumber, 10);
    if (!Number.isFinite(parsedGrade) || parsedGrade <= 0) {
      setError('Enter a valid grade number (e.g., 5 for Grade 5).');
      return;
    }

    const subject = formState.subject.trim();
    if (!subject) {
      setError('Subject is required to save a level.');
      return;
    }

    const payload: Level = {
      id: formState.id ?? crypto.randomUUID(),
      gradeNumber: parsedGrade,
      subject,
      color: formState.color,
    };

    try {
      setIsSaving(true);
      if (mode === 'edit' && formState.id) {
        await DataStore.update('levels', formState.id, payload);
      } else {
        await DataStore.save('levels', payload);
      }
      await loadLevels();
      resetForm();
    } catch (err) {
      console.error('Failed to save level', err);
      setError(err instanceof Error ? err.message : 'Failed to save level.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(levelId: string) {
    try {
      await DataStore.remove('levels', levelId);
      await loadLevels();
      if (formState.id === levelId) {
        resetForm();
      }
    } catch (err) {
      console.error('Failed to delete level', err);
      setError('Unable to delete this level right now. Try again.');
    }
  }

  return (
    <section aria-labelledby="level-manager-heading" className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="level-manager-heading" className="text-2xl font-semibold text-white">
              Level manager
            </h2>
            <p className="text-sm text-slate-400">
              Define grade + subject combinations and assign a signature color for fast recognition across the planner.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New level
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4" aria-live="polite">
          {sortedLevels.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-400">
              <p className="text-sm">No levels yet. Add the classes you teach to unlock group planning.</p>
            </div>
          ) : (
            sortedLevels.map((level) => {
              const isActive = activeLevelId === level.id && mode === 'edit';
              return (
                <article
                  key={level.id}
                  className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition focus-within:ring-2 focus-within:ring-accent/60 ${
                    isActive ? 'ring-2 ring-accent/60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 rounded-xl" style={{ backgroundColor: level.color }} aria-hidden />
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          Grade {level.gradeNumber}
                        </h3>
                        <p className="text-sm text-slate-400">{level.subject}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <button
                        type="button"
                        onClick={() => beginEdit(level)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-accent/80"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        Edit level
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(level.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-300 transition hover:text-rose-200"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Summary</dt>
                      <dd className="font-medium text-white/90">{describeLevel(level)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Identifier</dt>
                      <dd className="font-mono text-xs text-slate-400">{level.id}</dd>
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
              {mode === 'edit' ? 'Edit level' : mode === 'create' ? 'Add level' : 'Select a level'}
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
              ? 'Update the grade, subject, or color. These details roll into schedules and lesson planners.'
              : mode === 'create'
                ? 'Enter the grade number and subject to create a trackable level for scheduling.'
                : 'Choose a level from the list or create a new one to begin editing.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="level-grade" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Grade number
              </label>
              <input
                id="level-grade"
                type="number"
                inputMode="numeric"
                min={1}
                value={formState.gradeNumber}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, gradeNumber: event.target.value.replace(/[^0-9]/g, '') }))
                }
                placeholder="5"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div>
              <label htmlFor="level-subject" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Subject name
              </label>
              <input
                id="level-subject"
                type="text"
                value={formState.subject}
                onChange={(event) => setFormState((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Technology"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Level color</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = formState.color.toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormState((prev) => ({ ...prev, color: preset }))}
                      className={`h-9 w-9 rounded-xl border-2 transition ${isSelected ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: preset }}
                      aria-label={`Select color ${preset}`}
                    />
                  );
                })}
                <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                  <Palette className="h-3.5 w-3.5" aria-hidden />
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

            {error && <p className="text-xs font-medium text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={mode === 'idle' || isSaving}
              className="w-full rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {isSaving ? 'Saving…' : mode === 'edit' ? 'Update level' : 'Create level'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
