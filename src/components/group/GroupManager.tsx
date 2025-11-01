import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers3, PencilLine, Plus, Users, X } from 'lucide-react';
import type { Group, Level } from '../../data/types';
import { DataStore } from '../../data/db';

const DEFAULT_GROUP_LETTERS = ['A', 'B', 'C'];

type FormState = {
  id: string | null;
  letter: string;
  displayName: string;
};

function createEmptyForm(): FormState {
  return {
    id: null,
    letter: '',
    displayName: '',
  };
}

function describeLevel(level: Level) {
  const gradeLabel = Number.isFinite(level.gradeNumber) ? `Grade ${level.gradeNumber}` : 'Grade';
  const subjectLabel = level.subject ? level.subject : 'Subject not set';
  return `${gradeLabel} • ${subjectLabel}`;
}

export function GroupManager() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [formState, setFormState] = useState<FormState>(createEmptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLevels = useCallback(async () => {
    const rows = await DataStore.getAll('levels');
    rows.sort((a, b) => a.gradeNumber - b.gradeNumber || a.subject.localeCompare(b.subject));
    setLevels(rows);
  }, []);

  const loadGroups = useCallback(async () => {
    const rows = await DataStore.getAll('groups');
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setGroups(rows);
  }, []);

  useEffect(() => {
    void loadLevels();
    void loadGroups();
  }, [loadLevels, loadGroups]);

  useEffect(() => {
    if (!levels.length) {
      setSelectedLevelId(null);
      return;
    }

    if (!selectedLevelId || !levels.some((level) => level.id === selectedLevelId)) {
      setSelectedLevelId(levels[0].id);
    }
  }, [levels, selectedLevelId]);

  const levelMap = useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);

  const selectedLevel = selectedLevelId ? levelMap.get(selectedLevelId) ?? null : null;

  const groupsForLevel = useMemo(() => {
    if (!selectedLevelId) return [];
    return groups.filter((group) => group.levelId === selectedLevelId);
  }, [groups, selectedLevelId]);

  const defaultLettersMissing = useMemo(() => {
    const existingLetters = new Set(groupsForLevel.map((group) => group.letter.toUpperCase()));
    return DEFAULT_GROUP_LETTERS.filter((letter) => !existingLetters.has(letter));
  }, [groupsForLevel]);

  const activeGroupId = formState.id;

  function resetForm() {
    setFormState(createEmptyForm());
    setMode('idle');
    setError(null);
    setNotice(null);
  }

  function beginCreate() {
    if (!selectedLevel) {
      setError('Create a level before adding groups.');
      setNotice(null);
      return;
    }
    setFormState(createEmptyForm());
    setMode('create');
    setError(null);
    setNotice(null);
  }

  function beginEdit(group: Group) {
    setFormState({
      id: group.id,
      letter: group.letter,
      displayName: group.displayName,
    });
    setMode('edit');
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLevel) {
      setError('Select a level to attach these groups to.');
      setNotice(null);
      return;
    }

    const letter = formState.letter.trim().toUpperCase();
    if (!letter || letter.length > 2) {
      setError('Group letter should be one or two characters.');
      setNotice(null);
      return;
    }

    const displayName = formState.displayName.trim();
    if (!displayName) {
      setError('Group display name is required.');
      setNotice(null);
      return;
    }

    const duplicate = groupsForLevel.some(
      (group) => group.letter.toUpperCase() === letter && group.id !== formState.id,
    );
    if (duplicate) {
      setError(`A group with the letter "${letter}" already exists for this level.`);
      setNotice(null);
      return;
    }

    const payload: Group = {
      id: formState.id ?? crypto.randomUUID(),
      levelId: selectedLevel.id,
      letter,
      displayName,
    };

    try {
      setIsSaving(true);
      if (mode === 'edit' && formState.id) {
        await DataStore.update('groups', formState.id, payload);
      } else {
        await DataStore.save('groups', payload);
      }
      await loadGroups();
      setNotice(mode === 'edit' ? 'Group updated.' : 'Group created.');
      setError(null);
      if (mode === 'create') {
        setFormState(createEmptyForm());
      } else {
        setFormState((prev) => ({ ...prev, id: payload.id }));
      }
      setMode('edit');
    } catch (err) {
      console.error('Failed to save group', err);
      setError(err instanceof Error ? err.message : 'Failed to save group.');
      setNotice(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(groupId: string) {
    try {
      await DataStore.remove('groups', groupId);
      await loadGroups();
      if (formState.id === groupId) {
        resetForm();
      }
      setNotice('Group removed.');
    } catch (err) {
      console.error('Failed to delete group', err);
      setError('Unable to delete this group right now. Try again.');
      setNotice(null);
    }
  }

  async function handleGenerateDefaults() {
    if (!selectedLevel) {
      setError('Select a level before generating groups.');
      setNotice(null);
      return;
    }

    if (!defaultLettersMissing.length) {
      setNotice('All default groups already exist for this level.');
      setError(null);
      return;
    }

    const newGroups: Group[] = defaultLettersMissing.map((letter) => ({
      id: crypto.randomUUID(),
      levelId: selectedLevel.id,
      letter,
      displayName: `Group ${letter}`,
    }));

    try {
      setIsGenerating(true);
      await DataStore.bulkSave('groups', newGroups);
      await loadGroups();
      setNotice('Default groups created.');
      setError(null);
    } catch (err) {
      console.error('Failed to generate default groups', err);
      setError('Unable to generate default groups right now.');
      setNotice(null);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section aria-labelledby="group-manager-heading" className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="group-manager-heading" className="text-2xl font-semibold text-white">
              Group manager
            </h2>
            <p className="text-sm text-slate-400">
              Auto-generate class groups from each level, then edit the naming and remove sections as your roster evolves.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New group
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4" aria-live="polite">
          {!selectedLevel ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-400">
              <Layers3 className="mb-2 h-6 w-6" aria-hidden />
              <p className="text-sm">Create at least one level to start managing groups.</p>
            </div>
          ) : groupsForLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-400">
              <p className="text-sm">No groups for this level yet. Generate the defaults or add your own.</p>
            </div>
          ) : (
            groupsForLevel.map((group) => {
              const level = levelMap.get(group.levelId);
              const isActive = activeGroupId === group.id && mode === 'edit';
              return (
                <article
                  key={group.id}
                  className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition focus-within:ring-2 focus-within:ring-accent/60 ${
                    isActive ? 'ring-2 ring-accent/60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
                        style={{ backgroundColor: level?.color ?? '#475569' }}
                      >
                        {group.letter.toUpperCase()}
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{group.displayName}</h3>
                        <p className="text-sm text-slate-400">{level ? describeLevel(level) : 'Unknown level'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <button
                        type="button"
                        onClick={() => beginEdit(group)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-accent/80"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        Edit group
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(group.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-300 transition hover:text-rose-200"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Identifier</dt>
                      <dd className="font-mono text-xs text-slate-400">{group.id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Letter</dt>
                      <dd className="font-medium text-white/90">{group.letter.toUpperCase()}</dd>
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
              {mode === 'edit' ? 'Edit group' : mode === 'create' ? 'Add group' : 'Select a group'}
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
              ? 'Update the letter or display name. These groups drive schedule assignment and filters.'
              : mode === 'create'
                ? 'Choose a letter and display name to add a new class section to this level.'
                : 'Pick a level, generate the defaults, or create your own groups to start scheduling.'}
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="group-level" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Level
              </label>
              <select
                id="group-level"
                value={selectedLevelId ?? ''}
                onChange={(event) => {
                  setSelectedLevelId(event.target.value || null);
                  resetForm();
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="" disabled>
                  {levels.length ? 'Select level' : 'No levels available'}
                </option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {describeLevel(level)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleGenerateDefaults}
              disabled={!selectedLevel || isGenerating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? 'Generating…' : `Generate ${DEFAULT_GROUP_LETTERS.join('/')}`}
            </button>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="group-letter" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Group letter
                </label>
                <input
                  id="group-letter"
                  type="text"
                  value={formState.letter}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, letter: event.target.value.toUpperCase().slice(0, 2) }))
                  }
                  placeholder="A"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              <div>
                <label htmlFor="group-display" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Display name
                </label>
                <input
                  id="group-display"
                  type="text"
                  value={formState.displayName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, displayName: event.target.value }))}
                  placeholder="Group A"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
              {notice && !error && <p className="text-xs font-medium text-emerald-300">{notice}</p>}

              <button
                type="submit"
                disabled={!selectedLevel || mode === 'idle' || isSaving}
                className="w-full rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:bg-white/40"
              >
                {isSaving ? 'Saving…' : mode === 'edit' ? 'Update group' : 'Create group'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

