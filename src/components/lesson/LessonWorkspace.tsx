import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  NotebookTabs,
  Presentation,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { DataStore } from '../../data/db';
import type {
  ActivityTemplate,
  Group,
  Lesson,
  LessonPhase,
  LessonPhaseType,
  LessonResourceAttachment,
  Level,
  Resource,
  Rubric,
  Schedule,
  Topic,
} from '../../data/types';

const PHASE_KEY: Record<LessonPhaseType, 'preActivity' | 'whileActivity' | 'postActivity'> = {
  pre: 'preActivity',
  while: 'whileActivity',
  post: 'postActivity',
};

type LessonTab = 'objectives' | 'activities' | 'resources' | 'assessment' | 'review';

type LessonResourceDetail = LessonResourceAttachment & {
  resource?: Resource;
};

type LessonDetail = {
  lesson: Lesson;
  group?: Group;
  level?: Level;
  topic?: Topic;
  rubric?: Rubric;
  resourceAttachments: LessonResourceDetail[];
};

type LookupMaps = {
  groups: Map<string, Group>;
  levels: Map<string, Level>;
  topics: Map<string, Topic>;
  rubrics: Map<string, Rubric>;
  resources: Map<string, Resource>;
};

const TABS: { id: LessonTab; label: string; description: string }[] = [
  { id: 'objectives', label: 'Objectives', description: 'Learning targets and lesson context' },
  { id: 'activities', label: 'Activities', description: 'Pre, while, and post structures' },
  { id: 'resources', label: 'Resources', description: 'Attachments and supporting materials' },
  { id: 'assessment', label: 'Assessment', description: 'Rubrics and progress checks' },
  { id: 'review', label: 'Review', description: 'Status, notes, and linked sections' },
];

const LESSON_STATUS_LABELS: Record<Lesson['status'], string> = {
  draft: 'Draft',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const GROUPING_OPTIONS = ['Whole class', 'Small groups', 'Pairs', 'Individual'];

function formatDate(date: string) {
  try {
    return format(parseISO(date), 'EEEE, MMM d, yyyy');
  } catch (error) {
    console.warn('Unable to format lesson date', error);
    return date;
  }
}

function formatTime(time: string) {
  if (!time) return '--:--';
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatTimeRange(lesson: Lesson) {
  const start = formatTime(lesson.startTime);
  const end = formatTime(lesson.endTime);
  return `${start} – ${end}`;
}

function parseTimeToMinutes(value: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function computeLessonMinutes(lesson: Lesson) {
  const start = parseTimeToMinutes(lesson.startTime);
  const end = parseTimeToMinutes(lesson.endTime);
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours && remainingMinutes) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remainingMinutes}m`;
}

function clonePhase(phase?: LessonPhase) {
  if (!phase) return undefined;
  return JSON.parse(JSON.stringify(phase)) as LessonPhase;
}

function normalizePhase(phase?: LessonPhase | null) {
  if (!phase) return undefined;
  const cleaned: LessonPhase = { ...phase };

  if (cleaned.duration !== undefined) {
    if (Number.isNaN(Number(cleaned.duration))) {
      delete cleaned.duration;
    } else {
      cleaned.duration = Math.max(0, Number(cleaned.duration));
    }
  }

  if (cleaned.materials) {
    cleaned.materials = cleaned.materials.map((item) => item.trim()).filter(Boolean);
    if (!cleaned.materials.length) {
      delete cleaned.materials;
    }
  }

  if (cleaned.objectives) {
    cleaned.objectives = cleaned.objectives.map((item) => item.trim()).filter(Boolean);
    if (!cleaned.objectives.length) {
      delete cleaned.objectives;
    }
  }

  if (cleaned.differentiation) {
    const entries = Object.entries(cleaned.differentiation).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});
    if (Object.keys(entries).length) {
      cleaned.differentiation = entries;
    } else {
      delete cleaned.differentiation;
    }
  }

  const hasContent = Object.entries(cleaned).some(([key, value]) => {
    if (key === 'duration') {
      return value !== undefined && Number(value) > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length > 0;
    }
    return Boolean(value);
  });

  return hasContent ? cleaned : undefined;
}

function parseList(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringifyList(list?: string[]) {
  return list?.join('\n') ?? '';
}

function parseDifferentiationInput(value: string) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const record: Record<string, string> = {};
  lines.forEach((line) => {
    const [group, ...rest] = line.split(':');
    if (!group || !rest.length) return;
    record[group.trim()] = rest.join(':').trim();
  });
  return record;
}

function stringifyDifferentiation(record?: Record<string, string>) {
  if (!record) return '';
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function phaseHasContent(phase?: LessonPhase) {
  if (!phase) return false;
  return Object.entries(phase).some(([key, value]) => {
    if (key === 'duration') {
      return value !== undefined && Number(value) > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length > 0;
    }
    return Boolean(value);
  });
}

function mapTemplateToPhase(template: ActivityTemplate) {
  const updates: LessonPhase = {};
  for (const [key, value] of Object.entries(template.fields)) {
    switch (key) {
      case 'instructions':
        if (typeof value === 'string') {
          updates.instructions = value;
        }
        break;
      case 'materials':
        if (Array.isArray(value)) {
          updates.materials = value.map((entry) => String(entry));
        }
        break;
      case 'objectives':
        if (Array.isArray(value)) {
          updates.objectives = value.map((entry) => String(entry));
        }
        break;
      case 'duration':
      case 'timeEstimate':
        if (typeof value === 'number') {
          updates.duration = value;
        }
        break;
      case 'prompts':
        if (Array.isArray(value)) {
          updates.reflection = value.map((entry) => String(entry)).join('\n');
        }
        break;
      case 'groupWork':
        if (typeof value === 'boolean') {
          updates.grouping = value ? 'Small groups' : 'Whole class';
        }
        break;
      default:
        break;
    }
  }
  return updates;
}

function collectObjectives(lesson: Lesson) {
  const objectives = [
    ...(lesson.preActivity?.objectives ?? []),
    ...(lesson.whileActivity?.objectives ?? []),
    ...(lesson.postActivity?.objectives ?? []),
  ].filter(Boolean);
  return [...new Set(objectives)];
}

function getPhaseTitle(phase: LessonPhaseType) {
  switch (phase) {
    case 'pre':
      return 'Pre-lesson';
    case 'while':
      return 'During lesson';
    case 'post':
      return 'Post-lesson';
    default:
      return 'Activity';
  }
}

function buildLessonDetail(lesson: Lesson, lookups: LookupMaps): LessonDetail {
  const group = lookups.groups.get(lesson.groupId);
  const level = group ? lookups.levels.get(group.levelId) : undefined;
  const topic = lookups.topics.get(lesson.topicId);
  const rubric = lesson.rubricId ? lookups.rubrics.get(lesson.rubricId) : undefined;
  const attachments = (lesson.resourceAttachments ??
    lesson.resourceIds?.map((id) => ({ resourceId: id, usage: 'all' as const, notes: '', required: false })) ??
    [])
    .map((attachment) => ({
      resourceId: attachment.resourceId,
      usage: attachment.usage ?? 'all',
      notes: attachment.notes ?? '',
      required: attachment.required ?? false,
      resource: lookups.resources.get(attachment.resourceId),
    }));

  return {
    lesson,
    group,
    level,
    topic,
    rubric,
    resourceAttachments: attachments,
  };
}

function validateLessonDraft(lesson: Lesson, attachments: LessonResourceAttachment[]) {
  const errors: Record<string, string> = {};
  const lessonMinutes = computeLessonMinutes(lesson);
  let totalPlanned = 0;

  (['pre', 'while', 'post'] as LessonPhaseType[]).forEach((phase) => {
    const key = PHASE_KEY[phase];
    const data = lesson[key];
    const hasContent = phaseHasContent(data);
    const duration = data?.duration;

    if (hasContent && (duration == null || Number(duration) <= 0)) {
      errors[`${phase}.duration`] = 'Duration is required for this phase.';
    } else if (duration && Number(duration) > 0) {
      totalPlanned += Number(duration);
    }

    if (phase === 'while' && hasContent) {
      const instructions = data?.instructions?.trim();
      if (!instructions) {
        errors['while.instructions'] = 'Add facilitation steps for the main learning block.';
      }
    }
  });

  if (lessonMinutes != null && totalPlanned > lessonMinutes) {
    errors.totalDuration = `Planned activities exceed the scheduled time by ${formatDuration(totalPlanned - lessonMinutes)}.`;
  }

  if (attachments.some((attachment) => !attachment.resourceId)) {
    errors.resources = 'Each attached resource must be selected.';
  }

  return errors;
}

export function LessonWorkspace() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonDetail[]>([]);
  const [groupLibrary, setGroupLibrary] = useState<Group[]>([]);
  const [levelLibrary, setLevelLibrary] = useState<Level[]>([]);
  const [topicLibrary, setTopicLibrary] = useState<Topic[]>([]);
  const [rubricLibrary, setRubricLibrary] = useState<Rubric[]>([]);
  const [resourceLibrary, setResourceLibrary] = useState<Resource[]>([]);
  const [templateLibrary, setTemplateLibrary] = useState<ActivityTemplate[]>([]);
  const [scheduleLibrary, setScheduleLibrary] = useState<Schedule[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LessonTab>('objectives');
  const [lessonDraft, setLessonDraft] = useState<Lesson | null>(null);
  const [resourceDraft, setResourceDraft] = useState<LessonResourceAttachment[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isCopyWizardOpen, setIsCopyWizardOpen] = useState(false);
  const saveTimeoutRef = useRef<number>();
  const skipNextSaveRef = useRef(true);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadLessons = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [
        loadedLessons,
        topics,
        groups,
        levels,
        rubrics,
        resources,
        templates,
        schedules,
      ] = await Promise.all([
        DataStore.getAll('lessons'),
        DataStore.getAll('topics'),
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('rubrics'),
        DataStore.getAll('resources'),
        DataStore.getAll('templates'),
        DataStore.getAll('schedules'),
      ]);

      loadedLessons.sort((a, b) => {
        if (a.date === b.date) {
          return a.startTime.localeCompare(b.startTime);
        }
        return a.date.localeCompare(b.date);
      });

      const lookups: LookupMaps = {
        groups: new Map(groups.map((group) => [group.id, group])),
        levels: new Map(levels.map((level) => [level.id, level])),
        topics: new Map(topics.map((topic) => [topic.id, topic])),
        rubrics: new Map(rubrics.map((rubric) => [rubric.id, rubric])),
        resources: new Map(resources.map((resource) => [resource.id, resource])),
      };

      setLessons(loadedLessons.map((lesson) => buildLessonDetail(lesson, lookups)));
      setGroupLibrary(groups);
      setLevelLibrary(levels);
      setTopicLibrary(topics);
      setRubricLibrary(rubrics);
      setResourceLibrary(resources);
      setTemplateLibrary(templates);
      setScheduleLibrary(schedules);
    } catch (loadError) {
      console.error('Failed to load lessons', loadError);
      setError('Unable to load lessons right now.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const groupMap = useMemo(() => new Map(groupLibrary.map((group) => [group.id, group])), [groupLibrary]);
  const levelMap = useMemo(() => new Map(levelLibrary.map((level) => [level.id, level])), [levelLibrary]);
  const topicMap = useMemo(() => new Map(topicLibrary.map((topic) => [topic.id, topic])), [topicLibrary]);
  const rubricMap = useMemo(
    () => new Map(rubricLibrary.map((rubric) => [rubric.id, rubric])),
    [rubricLibrary]
  );
  const resourceMap = useMemo(
    () => new Map(resourceLibrary.map((resource) => [resource.id, resource])),
    [resourceLibrary]
  );
  const scheduleMap = useMemo(
    () => new Map(scheduleLibrary.map((schedule) => [schedule.groupId, schedule])),
    [scheduleLibrary]
  );

  const lessonById = useMemo(() => {
    return lessons.reduce<Record<string, LessonDetail>>((acc, detail) => {
      acc[detail.lesson.id] = detail;
      return acc;
    }, {});
  }, [lessons]);

  const selectedLesson = activeLessonId ? lessonById[activeLessonId] : null;
  const isDrawerOpen = Boolean(selectedLesson);

  useEffect(() => {
    if (!selectedLesson) {
      setLessonDraft(null);
      setResourceDraft([]);
      setValidationErrors({});
      return;
    }

    const draft = JSON.parse(JSON.stringify(selectedLesson.lesson)) as Lesson;
    const attachments = draft.resourceAttachments ??
      draft.resourceIds?.map((id) => ({ resourceId: id, usage: 'all' as const, notes: '', required: false })) ??
      [];

    setLessonDraft(draft);
    setResourceDraft(
      attachments.map((attachment) => ({
        resourceId: attachment.resourceId,
        usage: attachment.usage ?? 'all',
        required: attachment.required ?? false,
        notes: attachment.notes ?? '',
      }))
    );
    setValidationErrors(validateLessonDraft(draft, attachments));
    skipNextSaveRef.current = true;
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
  }, [selectedLesson]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveLessonId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (isDrawerOpen) {
      setActiveTab('objectives');
      const timeout = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timeout);
      };
    }
    return undefined;
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!lessonDraft) {
      setValidationErrors({});
      return;
    }
    setValidationErrors(validateLessonDraft(lessonDraft, resourceDraft));
  }, [lessonDraft, resourceDraft]);

  useEffect(() => {
    if (!lessonDraft || !isDrawerOpen) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    setSaveState('pending');

    saveTimeoutRef.current = window.setTimeout(async () => {
      if (Object.keys(validationErrors).length > 0) {
        setSaveState('error');
        setSaveError('Resolve validation issues to save your lesson.');
        return;
      }

      try {
        setSaveState('saving');
        setSaveError(null);

        const attachments = resourceDraft.map((attachment) => ({
          ...attachment,
          notes: attachment.notes?.trim() ?? '',
        }));

        const payload: Lesson = {
          ...lessonDraft,
          resourceAttachments: attachments,
          resourceIds: attachments.map((attachment) => attachment.resourceId),
        };

        await DataStore.update('lessons', lessonDraft.id, payload);

        setLessons((prev) =>
          prev.map((detail) => {
            if (detail.lesson.id !== payload.id) return detail;
            return buildLessonDetail(payload, {
              groups: groupMap,
              levels: levelMap,
              topics: topicMap,
              rubrics: rubricMap,
              resources: resourceMap,
            });
          })
        );

        setLessonDraft(payload);
        setSaveState('saved');
        setLastSavedAt(Date.now());
      } catch (saveErr) {
        console.error('Failed to save lesson', saveErr);
        setSaveState('error');
        setSaveError('Unable to save changes. Try again in a moment.');
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [lessonDraft, resourceDraft, isDrawerOpen, validationErrors, groupMap, levelMap, topicMap, rubricMap, resourceMap]);

  const updatePhase = useCallback((phase: LessonPhaseType, updates: Partial<LessonPhase>) => {
    setLessonDraft((current) => {
      if (!current) return current;
      const key = PHASE_KEY[phase];
      const nextPhase = normalizePhase({ ...(current[key] ?? {}), ...updates });
      return {
        ...current,
        [key]: nextPhase,
      };
    });
  }, []);

  const replacePhase = useCallback((phase: LessonPhaseType, value?: LessonPhase) => {
    setLessonDraft((current) => {
      if (!current) return current;
      const key = PHASE_KEY[phase];
      return {
        ...current,
        [key]: normalizePhase(value),
      };
    });
  }, []);

  const updateLessonFields = useCallback((updates: Partial<Lesson>) => {
    setLessonDraft((current) => (current ? { ...current, ...updates } : current));
  }, []);

  const updateResourceAttachment = useCallback((resourceId: string, updates: Partial<LessonResourceAttachment>) => {
    setResourceDraft((current) =>
      current.map((attachment) =>
        attachment.resourceId === resourceId ? { ...attachment, ...updates } : attachment
      )
    );
  }, []);

  const removeResourceAttachment = useCallback((resourceId: string) => {
    setResourceDraft((current) => current.filter((attachment) => attachment.resourceId !== resourceId));
  }, []);

  const addResourceAttachment = useCallback((resourceId: string) => {
    setResourceDraft((current) => {
      if (current.some((attachment) => attachment.resourceId === resourceId)) {
        return current;
      }
      return [
        ...current,
        {
          resourceId,
          usage: 'all',
          required: false,
          notes: '',
        },
      ];
    });
  }, []);

  const visibleLessons = useMemo(() => lessons.slice(0, 6), [lessons]);

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) return 'All changes saved';
    return `Saved ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}`;
  }, [lastSavedAt]);

  const openCopyWizard = useCallback(() => {
    setIsCopyWizardOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveLessonId(null);
  }, []);

  const copyLessonToTargets = useCallback(
    async (targetLessonIds: string[]) => {
      if (!lessonDraft) return;

      const attachments = resourceDraft.map((attachment) => ({
        ...attachment,
        notes: attachment.notes?.trim() ?? '',
      }));

      const linkedIds = new Set<string>([lessonDraft.id, ...targetLessonIds]);
      const linkedLookup: Record<string, string[]> = {};
      linkedIds.forEach((id) => {
        linkedLookup[id] = Array.from(linkedIds).filter((otherId) => otherId !== id);
      });

      const updates: Partial<Lesson> = {
        preActivity: clonePhase(lessonDraft.preActivity),
        whileActivity: clonePhase(lessonDraft.whileActivity),
        postActivity: clonePhase(lessonDraft.postActivity),
        resourceAttachments: attachments,
        resourceIds: attachments.map((attachment) => attachment.resourceId),
        rubricId: lessonDraft.rubricId,
      };

      await Promise.all(
        Array.from(linkedIds).map((id) =>
          DataStore.update('lessons', id, {
            ...updates,
            linkedLessonIds: linkedLookup[id],
          })
        )
      );

      setLessons((current) =>
        current.map((detail) => {
          if (!linkedIds.has(detail.lesson.id)) return detail;
          const next: Lesson = {
            ...detail.lesson,
            ...updates,
            linkedLessonIds: linkedLookup[detail.lesson.id],
          } as Lesson;
          return buildLessonDetail(next, {
            groups: groupMap,
            levels: levelMap,
            topics: topicMap,
            rubrics: rubricMap,
            resources: resourceMap,
          });
        })
      );

      setLessonDraft((current) =>
        current
          ? {
              ...current,
              ...updates,
              linkedLessonIds: linkedLookup[current.id],
            }
          : current
      );

      skipNextSaveRef.current = true;
      setSaveState('saved');
      setLastSavedAt(Date.now());
    },
    [lessonDraft, resourceDraft, groupMap, levelMap, topicMap, rubricMap, resourceMap]
  );
  const resourceError = validationErrors.resources;
  const totalDurationError = validationErrors.totalDuration;
  const lessonForPanels = lessonDraft ?? selectedLesson?.lesson ?? null;
  const draftRubric = lessonForPanels?.rubricId
    ? rubricMap.get(lessonForPanels.rubricId)
    : selectedLesson?.rubric;

  return (
    <section
      aria-labelledby="lesson-workspace-heading"
      className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-slate-200 shadow-xl shadow-slate-950/20"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            <NotebookTabs className="h-3.5 w-3.5" aria-hidden />
            Lesson workspace
          </span>
          <h2 id="lesson-workspace-heading" className="text-2xl font-semibold text-white">
            Plan structured lessons with reusable shells
          </h2>
          <p className="max-w-2xl text-sm text-slate-400">
            Preview upcoming lessons, then open the drawer to organize objectives, activities, resources, and review notes without leaving the calendar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (visibleLessons.length) {
              setActiveLessonId(visibleLessons[0].lesson.id);
            }
          }}
          className="inline-flex items-center gap-2 self-start rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Open latest lesson
        </button>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="mt-3 h-5 w-3/4 rounded bg-white/10" />
                <div className="mt-6 flex gap-2">
                  <span className="h-6 w-16 rounded-full bg-white/10" />
                  <span className="h-6 w-20 rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
        ) : visibleLessons.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {visibleLessons.map((detail) => {
              const { lesson, topic, group, level } = detail;
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => setActiveLessonId(lesson.id)}
                    className="group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-surface/60 p-5 text-left transition hover:border-accent/60 hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    aria-describedby={`lesson-${lesson.id}-summary`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-sm font-semibold text-white">
                        <BookOpenCheck className="h-4 w-4 text-accent" aria-hidden />
                        <span>{topic?.name ?? 'Untitled lesson'}</span>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-300">
                        {LESSON_STATUS_LABELS[lesson.status]}
                      </span>
                    </div>
                    <p id={`lesson-${lesson.id}-summary`} className="text-sm text-slate-300">
                      {group?.displayName ? `${group.displayName} · ` : ''}
                      {formatDate(lesson.date)} · {formatTimeRange(lesson)}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                      {level ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                          <Layers className="h-3.5 w-3.5" aria-hidden />
                          {`Grade ${level.gradeNumber} ${level.subject}`}
                        </span>
                      ) : null}
                      {topic?.estimatedSessions ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                          {`${topic.estimatedSessions} session plan`}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-accent opacity-0 transition group-hover:opacity-100">
                      View lesson details
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 bg-surface/40 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <NotebookTabs className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">No lessons yet</h3>
            <p className="mt-2 text-sm text-slate-400">
              Create your first lesson from the calendar or schedule builder to unlock this workspace.
            </p>
          </div>
        )}
      </div>

      {isDrawerOpen && selectedLesson && lessonForPanels ? (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            aria-label="Close lesson drawer"
            className="flex-1 bg-slate-950/60 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-drawer-title"
            className="relative flex h-full w-full max-w-3xl flex-col border-l border-white/10 bg-slate-950/95 text-slate-100 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-6 border-b border-white/10 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm uppercase tracking-wide text-accent/80">
                  <CalendarClock className="h-4 w-4" aria-hidden />
                  {formatDate(selectedLesson.lesson.date)} · {formatTimeRange(selectedLesson.lesson)}
                </div>
                <h3 id="lesson-drawer-title" className="text-2xl font-semibold text-white">
                  {selectedLesson.topic?.name ?? 'Untitled lesson'}
                </h3>
                <p className="text-sm text-slate-400">
                  {selectedLesson.group?.displayName ? `${selectedLesson.group.displayName} · ` : ''}
                  {selectedLesson.level
                    ? `Grade ${selectedLesson.level.gradeNumber} ${selectedLesson.level.subject}`
                    : 'Unassigned level'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SaveStatus state={saveState} label={lastSavedLabel} error={saveError} />
                <button
                  type="button"
                  onClick={closeDrawer}
                  ref={closeButtonRef}
                  className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>

            <div className="border-b border-white/10 px-6">
              <nav role="tablist" aria-label="Lesson sections" className="flex flex-wrap gap-2 py-4">
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      id={`lesson-tab-${tab.id}`}
                      role="tab"
                      type="button"
                      aria-selected={isActive}
                      aria-controls={`lesson-panel-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex flex-col gap-1 rounded-2xl border px-4 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                        isActive
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-accent/40 hover:text-white'
                      }`}
                    >
                      <span className="text-sm font-semibold">{tab.label}</span>
                      <span className="text-xs text-slate-400">{tab.description}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto p-6" role="presentation">
              {TABS.map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                  <section
                    key={tab.id}
                    role="tabpanel"
                    id={`lesson-panel-${tab.id}`}
                    aria-labelledby={`lesson-tab-${tab.id}`}
                    hidden={!isActive}
                    className="space-y-6"
                  >
                    {tab.id === 'objectives' ? (
                      <ObjectivesPanel detail={selectedLesson} lesson={lessonForPanels} />
                    ) : null}
                    {tab.id === 'activities' ? (
                      <ActivitiesPanel
                        lesson={lessonForPanels}
                        onPhaseChange={updatePhase}
                        onPhaseReplace={replacePhase}
                        validationErrors={validationErrors}
                        templates={templateLibrary}
                        onTemplateApply={(phase, template) => updatePhase(phase, mapTemplateToPhase(template))}
                        totalDurationError={totalDurationError}
                      />
                    ) : null}
                    {tab.id === 'resources' ? (
                      <ResourcesPanel
                        resourceDraft={resourceDraft}
                        resourceMap={resourceMap}
                        resourceLibrary={resourceLibrary}
                        onAttachmentChange={updateResourceAttachment}
                        onAttachmentRemove={removeResourceAttachment}
                        onAttachmentAdd={addResourceAttachment}
                        validationError={resourceError}
                      />
                    ) : null}
                    {tab.id === 'assessment' ? (
                      <AssessmentPanel
                        lesson={lessonForPanels}
                        rubric={draftRubric}
                        rubricLibrary={rubricLibrary}
                        onRubricChange={(rubricId) =>
                          updateLessonFields({ rubricId: rubricId ?? undefined })
                        }
                      />
                    ) : null}
                    {tab.id === 'review' ? (
                      <ReviewPanel
                        detail={selectedLesson}
                        lesson={lessonForPanels}
                        lessons={lessonById}
                        onCopyRequest={openCopyWizard}
                      />
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>

          {isCopyWizardOpen ? (
            <CopyWizard
              isOpen={isCopyWizardOpen}
              lesson={lessonForPanels}
              detail={selectedLesson}
              lessons={lessons}
              scheduleMap={scheduleMap}
              onClose={() => setIsCopyWizardOpen(false)}
              onConfirm={async (targets) => {
                await copyLessonToTargets(targets);
                setIsCopyWizardOpen(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type PanelProps = { detail: LessonDetail; lesson: Lesson };

type ActivitiesPanelProps = {
  lesson: Lesson;
  onPhaseChange: (phase: LessonPhaseType, updates: Partial<LessonPhase>) => void;
  onPhaseReplace: (phase: LessonPhaseType, value?: LessonPhase) => void;
  validationErrors: Record<string, string>;
  templates: ActivityTemplate[];
  onTemplateApply: (phase: LessonPhaseType, template: ActivityTemplate) => void;
  totalDurationError?: string;
};

type ResourcesPanelProps = {
  resourceDraft: LessonResourceAttachment[];
  resourceMap: Map<string, Resource>;
  resourceLibrary: Resource[];
  onAttachmentChange: (resourceId: string, updates: Partial<LessonResourceAttachment>) => void;
  onAttachmentRemove: (resourceId: string) => void;
  onAttachmentAdd: (resourceId: string) => void;
  validationError?: string;
};

type AssessmentPanelProps = {
  lesson: Lesson;
  rubric: Rubric | undefined;
  rubricLibrary: Rubric[];
  onRubricChange: (rubricId: string | null) => void;
};

type ReviewPanelProps = {
  detail: LessonDetail;
  lesson: Lesson;
  lessons: Record<string, LessonDetail>;
  onCopyRequest: () => void;
};

type CopyWizardProps = {
  isOpen: boolean;
  lesson: Lesson;
  detail: LessonDetail;
  lessons: LessonDetail[];
  scheduleMap: Map<string, Schedule>;
  onClose: () => void;
  onConfirm: (targets: string[]) => Promise<void>;
};

type SaveStatusProps = {
  state: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  label: string;
  error: string | null;
};

function ObjectivesPanel({ detail, lesson }: PanelProps) {
  const objectives = collectObjectives(lesson);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        <Presentation className="h-4 w-4 text-accent" aria-hidden />
        Learning objectives
      </header>
      <div className="mt-4 space-y-4 text-sm text-slate-200">
        {objectives.length ? (
          <ul className="list-disc space-y-2 pl-5 text-slate-200">
            {objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">
            No objectives documented yet. Use this space to capture the essential understandings for the session.
          </p>
        )}
        {detail.topic?.description ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Topic summary</h4>
            <p className="mt-1 text-slate-300">{detail.topic.description}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActivitiesPanel({
  lesson,
  onPhaseChange,
  onPhaseReplace,
  validationErrors,
  templates,
  onTemplateApply,
  totalDurationError,
}: ActivitiesPanelProps) {
  const phases: LessonPhaseType[] = ['pre', 'while', 'post'];
  return (
    <div className="space-y-4">
      {phases.map((phase) => (
        <ActivityFormCard
          key={phase}
          phase={phase}
          data={lesson[PHASE_KEY[phase]]}
          onChange={(updates) => onPhaseChange(phase, updates)}
          onReplace={(value) => onPhaseReplace(phase, value)}
          errors={extractPhaseErrors(validationErrors, phase)}
          templates={templates.filter((template) => template.phase === phase)}
          onTemplateApply={(template) => onTemplateApply(phase, template)}
        />
      ))}
      {totalDurationError ? (
        <p className="rounded-2xl border border-yellow-500/60 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {totalDurationError}
        </p>
      ) : null}
    </div>
  );
}

function ActivityFormCard({
  phase,
  data,
  onChange,
  onReplace,
  errors,
  templates,
  onTemplateApply,
}: {
  phase: LessonPhaseType;
  data?: LessonPhase;
  onChange: (updates: Partial<LessonPhase>) => void;
  onReplace: (value?: LessonPhase) => void;
  errors: Partial<Record<'duration' | 'instructions', string>>;
  templates: ActivityTemplate[];
  onTemplateApply: (template: ActivityTemplate) => void;
}) {
  const instructionsLabel =
    phase === 'pre' ? 'Launch instructions' : phase === 'post' ? 'Closure plan' : 'Facilitation steps';
  const reflectionLabel = phase === 'post' ? 'Reflection & share-out' : 'Teacher notes';
  const homeworkLabel = phase === 'post' ? 'Extension or homework' : 'Follow-up actions';

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">{getPhaseTitle(phase)}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">Structured guidance for this phase</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Duration (min)</label>
          <input
            type="number"
            min={0}
            value={data?.duration ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ duration: value ? Number(value) : undefined });
            }}
            className={`w-20 rounded-lg border bg-slate-900/80 px-2 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              errors.duration ? 'border-red-500/60' : 'border-white/10'
            }`}
            aria-invalid={Boolean(errors.duration)}
            aria-describedby={errors.duration ? `${phase}-duration-error` : undefined}
          />
        </div>
      </header>
      {errors.duration ? (
        <p id={`${phase}-duration-error`} className="mt-2 text-xs text-red-300">
          {errors.duration}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4">
        {phase !== 'post' ? (
          <FieldBlock
            label="Objectives focus"
            description="List the goals learners should achieve during this phase."
          >
            <textarea
              value={stringifyList(data?.objectives)}
              onChange={(event) => onChange({ objectives: parseList(event.target.value) })}
              className="h-20 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </FieldBlock>
        ) : null}
        {phase === 'pre' ? (
          <FieldBlock
            label="Teacher preparation"
            description="Setup tasks before learners arrive."
          >
            <textarea
              value={data?.preparation ?? ''}
              onChange={(event) => onChange({ preparation: event.target.value || undefined })}
              className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </FieldBlock>
        ) : null}
        {phase === 'pre' ? (
          <FieldBlock
            label="Learner warm-up"
            description="Optional prompt or activity for students to prepare."
          >
            <textarea
              value={data?.studentPrep ?? ''}
              onChange={(event) => onChange({ studentPrep: event.target.value || undefined })}
              className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </FieldBlock>
        ) : null}
        <FieldBlock label={instructionsLabel} description="Outline the flow for this segment.">
          <textarea
            value={data?.instructions ?? ''}
            onChange={(event) => onChange({ instructions: event.target.value || undefined })}
            className={`h-32 rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              errors.instructions ? 'border-red-500/60' : 'border-white/10'
            }`}
            aria-invalid={Boolean(errors.instructions)}
          />
          {errors.instructions ? (
            <p className="mt-1 text-xs text-red-300">{errors.instructions}</p>
          ) : null}
        </FieldBlock>
        <FieldBlock label="Materials" description="Separate items by line or comma to auto-tag them.">
          <textarea
            value={stringifyList(data?.materials)}
            onChange={(event) => onChange({ materials: parseList(event.target.value) })}
            className="h-20 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
        </FieldBlock>
        {phase !== 'pre' ? (
          <FieldBlock label="Grouping" description="Select how learners will collaborate.">
            <select
              value={data?.grouping ?? ''}
              onChange={(event) => onChange({ grouping: event.target.value || undefined })}
              className="h-10 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <option value="">Not specified</option>
              {GROUPING_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FieldBlock>
        ) : null}
        {phase !== 'pre' ? (
          <FieldBlock label="Differentiation" description="Map strategies by group (e.g., Group A: scaffolded prompts).">
            <textarea
              value={stringifyDifferentiation(data?.differentiation)}
              onChange={(event) => onChange({ differentiation: parseDifferentiationInput(event.target.value) })}
              className="h-20 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </FieldBlock>
        ) : null}
        {phase !== 'pre' ? (
          <FieldBlock label="Assessment" description="Quick checks for understanding or artifacts to collect.">
            <textarea
              value={data?.assessment ?? ''}
              onChange={(event) => onChange({ assessment: event.target.value || undefined })}
              className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </FieldBlock>
        ) : null}
        <FieldBlock label={reflectionLabel} description="Capture observations or discussion prompts.">
          <textarea
            value={data?.reflection ?? ''}
            onChange={(event) => onChange({ reflection: event.target.value || undefined })}
            className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
        </FieldBlock>
        <FieldBlock label={homeworkLabel} description="Optional take-home work or next steps.">
          <textarea
            value={data?.homework ?? ''}
            onChange={(event) => onChange({ homework: event.target.value || undefined })}
            className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
        </FieldBlock>
        <div className="flex items-center justify-between rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <div>
            <p className="font-semibold text-white">Templates</p>
            <p className="text-xs text-slate-400">
              Apply a saved structure to jump-start this phase.
            </p>
          </div>
          <div className="flex gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onTemplateApply(template);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {template.name}
              </button>
            ))}
            {templates.length === 0 ? (
              <span className="text-xs text-slate-500">No templates yet for this phase.</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onReplace(undefined)}
          className="self-start text-xs font-semibold text-slate-400 underline-offset-2 transition hover:text-white"
        >
          Clear phase
        </button>
      </div>
    </article>
  );
}

function FieldBlock({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        {description ? <p className="text-xs text-slate-400">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function extractPhaseErrors(errors: Record<string, string>, phase: LessonPhaseType) {
  const entries = Object.entries(errors).filter(([key]) => key.startsWith(`${phase}.`));
  const result: Partial<Record<'duration' | 'instructions', string>> = {};
  entries.forEach(([key, value]) => {
    const field = key.split('.')[1];
    if (field === 'duration' || field === 'instructions') {
      result[field] = value;
    }
  });
  return result;
}

function ResourcesPanel({
  resourceDraft,
  resourceMap,
  resourceLibrary,
  onAttachmentChange,
  onAttachmentRemove,
  onAttachmentAdd,
  validationError,
}: ResourcesPanelProps) {
  const [selectedResource, setSelectedResource] = useState('');
  const availableResources = resourceLibrary.filter(
    (resource) => !resourceDraft.some((attachment) => attachment.resourceId === resource.id)
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">Attached materials</h3>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Annotate how each resource supports delivery.
            </p>
          </div>
        </header>
        {resourceDraft.length ? (
          <ul className="space-y-4">
            {resourceDraft.map((attachment) => {
              const resource = resourceMap.get(attachment.resourceId);
              return (
                <li key={attachment.resourceId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">{resource?.name ?? 'Resource removed'}</p>
                      <p className="text-xs text-slate-400">
                        {resource ? resource.type.toUpperCase() : 'Unknown type'}
                      </p>
                      {resource?.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Preview
                        </a>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAttachmentRemove(attachment.resourceId)}
                      className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:border-red-500/60 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove resource</span>
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Usage window
                      <select
                        value={attachment.usage}
                        onChange={(event) =>
                          onAttachmentChange(attachment.resourceId, {
                            usage: event.target.value as LessonResourceAttachment['usage'],
                          })
                        }
                        className="h-10 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        <option value="all">Entire lesson</option>
                        <option value="pre">Pre-lesson</option>
                        <option value="while">During lesson</option>
                        <option value="post">Post-lesson</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <input
                        type="checkbox"
                        checked={attachment.required}
                        onChange={(event) =>
                          onAttachmentChange(attachment.resourceId, { required: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-white/20 bg-slate-900/70 text-accent focus:ring-accent/60"
                      />
                      Required for lesson
                    </label>
                  </div>
                  <label className="mt-3 flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Notes for facilitator
                    <textarea
                      value={attachment.notes ?? ''}
                      onChange={(event) =>
                        onAttachmentChange(attachment.resourceId, {
                          notes: event.target.value || undefined,
                        })
                      }
                      className="h-16 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No resources attached yet. Link slide decks, worksheets, or external tools to keep lesson prep together.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-base font-semibold text-white">Resource library</h3>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
          Attach additional materials from the shared bank.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={selectedResource}
            onChange={(event) => setSelectedResource(event.target.value)}
            className="h-10 flex-1 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <option value="">Select a resource…</option>
            {availableResources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (selectedResource) {
                onAttachmentAdd(selectedResource);
                setSelectedResource('');
              }
            }}
            disabled={!selectedResource}
            className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Copy className="h-4 w-4" aria-hidden />
            Attach resource
          </button>
        </div>
        {validationError ? (
          <p className="mt-3 text-xs text-red-300">{validationError}</p>
        ) : null}
        {availableResources.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            All library resources are already linked to this lesson.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AssessmentPanel({ lesson, rubric, rubricLibrary, onRubricChange }: AssessmentPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <BookOpenCheck className="h-4 w-4 text-accent" aria-hidden />
            Assessment plan
          </div>
          <select
            value={lesson.rubricId ?? ''}
            onChange={(event) => onRubricChange(event.target.value || null)}
            className="h-9 rounded-full border border-white/10 bg-slate-900/70 px-3 text-xs font-semibold uppercase tracking-wide text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <option value="">No rubric linked</option>
            {rubricLibrary.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </header>
        {lesson.whileActivity?.assessment || lesson.postActivity?.assessment ? (
          <p className="mt-4 text-sm text-slate-200">
            {lesson.whileActivity?.assessment ?? lesson.postActivity?.assessment}
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Define how you will check for understanding. Add exit tickets, observational notes, or rubric references.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <Tag className="h-4 w-4 text-accent" aria-hidden />
          Rubric alignment
        </header>
        {rubric ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-white">{rubric.name}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">{rubric.totalPoints} points</p>
            </div>
            <ul className="space-y-3 text-sm text-slate-200">
              {rubric.criteria.map((criterion) => (
                <li key={criterion.name} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{criterion.name}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                      {criterion.points} pts
                    </span>
                  </div>
                  {criterion.description ? (
                    <p className="mt-2 text-xs text-slate-300">{criterion.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Connect a rubric to guide evaluation and provide consistent feedback across sections.
          </p>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ detail, lesson, lessons, onCopyRequest }: ReviewPanelProps) {
  const linkedLessons = detail.lesson.linkedLessonIds?.map((id) => lessons[id]).filter(Boolean) ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
          Lesson status & notes
        </header>
        <div className="mt-4 space-y-3 text-sm text-slate-200">
          <p>
            Current status:{' '}
            <span className="font-semibold text-white">{LESSON_STATUS_LABELS[lesson.status]}</span>
          </p>
          {lesson.completionNotes ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              {lesson.completionNotes}
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              No review notes yet. Capture reflections or adjustments after delivering the lesson.
            </p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <Layers className="h-4 w-4 text-accent" aria-hidden />
            Linked sections
          </div>
          <button
            type="button"
            onClick={onCopyRequest}
            className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy to level
          </button>
        </header>
        {linkedLessons.length ? (
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {linkedLessons.map((linked) => (
              <li
                key={linked.lesson.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-white">{linked.topic?.name ?? 'Linked lesson'}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {linked.group?.displayName ?? 'Unknown group'} · {formatDate(linked.lesson.date)}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {LESSON_STATUS_LABELS[linked.lesson.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Lessons copied to other sections will appear here so you can sync adjustments across groups.
          </p>
        )}
      </div>
    </div>
  );
}

function CopyWizard({ isOpen, lesson, detail, lessons, scheduleMap, onClose, onConfirm }: CopyWizardProps) {
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set(detail.lesson.linkedLessonIds ?? []));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTargets(new Set(detail.lesson.linkedLessonIds ?? []));
    setError(null);
  }, [detail.lesson.id, detail.lesson.linkedLessonIds]);

  if (!isOpen) return null;

  const baseDuration = computeLessonMinutes(lesson);
  const group = detail.group;
  const candidates = group
    ? lessons.filter((candidate) => {
        if (candidate.lesson.id === lesson.id) return false;
        if (!candidate.group) return false;
        return (
          candidate.group.levelId === group.levelId && candidate.lesson.topicId === lesson.topicId
        );
      })
    : [];

  const toggleTarget = (id: string, allow: boolean) => {
    setSelectedTargets((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (allow) {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      await onConfirm(Array.from(selectedTargets));
      setIsSaving(false);
    } catch (copyError) {
      console.error(copyError);
      setError('Unable to copy lesson to the selected sections.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-slate-200 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Copy lesson to other sections</h2>
            <p className="text-sm text-slate-400">
              Select sections from the same level and topic with matching session durations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close copy wizard</span>
          </button>
        </header>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p>
            Base lesson duration:{' '}
            <span className="font-semibold text-white">
              {baseDuration != null ? formatDuration(baseDuration) : 'Not set'}
            </span>
          </p>
        </div>
        {candidates.length ? (
          <ul className="space-y-3">
            {candidates.map((candidate) => {
              const candidateDuration = computeLessonMinutes(candidate.lesson);
              const matches =
                baseDuration == null || candidateDuration == null || candidateDuration === baseDuration;
              const schedule = scheduleMap.get(candidate.lesson.groupId);
              return (
                <li
                  key={candidate.lesson.id}
                  className={`rounded-2xl border p-4 transition ${
                    matches
                      ? 'border-white/10 bg-white/5'
                      : 'border-yellow-500/40 bg-yellow-500/10'
                  }`}
                >
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900/70 text-accent focus:ring-accent/60"
                      checked={selectedTargets.has(candidate.lesson.id)}
                      onChange={() => toggleTarget(candidate.lesson.id, matches)}
                      disabled={!matches}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">
                          {candidate.group?.displayName ?? 'Unknown group'}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          {formatDate(candidate.lesson.date)}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          {formatTimeRange(candidate.lesson)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Session duration:{' '}
                        {candidateDuration != null ? formatDuration(candidateDuration) : 'Not set'}
                      </p>
                      {schedule ? (
                        <p className="text-xs text-slate-500">
                          Schedule slots:{' '}
                          {schedule.sessions
                            .map((session) =>
                              `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][session.dayOfWeek - 1]} ${formatTime(
                                session.startTime
                              )}-${formatTime(session.endTime)} (${formatDuration(
                                (parseTimeToMinutes(session.endTime) ?? 0) -
                                  (parseTimeToMinutes(session.startTime) ?? 0)
                              )})`
                            )
                            .join(' · ')}
                        </p>
                      ) : null}
                      {!matches ? (
                        <p className="text-xs text-yellow-200">
                          Duration mismatch prevents copying. Adjust the session length or lesson timing first.
                        </p>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No eligible sections found for this topic and level.
          </p>
        )}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving || selectedTargets.size === 0}
            className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isSaving ? 'Copying…' : 'Copy lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveStatus({ state, label, error }: SaveStatusProps) {
  let content: React.ReactNode = null;
  switch (state) {
    case 'saving':
      content = (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      );
      break;
    case 'pending':
      content = (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-300" aria-hidden /> Unsaved changes
        </span>
      );
      break;
    case 'error':
      content = (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {error ?? 'Unable to save'}
        </span>
      );
      break;
    case 'saved':
      content = (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {label}
        </span>
      );
      break;
    default:
      content = (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Ready
        </span>
      );
      break;
  }
  return <span>{content}</span>;
}
