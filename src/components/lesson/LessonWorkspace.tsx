import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Layers,
  NotebookTabs,
  Presentation,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { DataStore } from '../../data/db';
import type {
  Group,
  Lesson,
  Level,
  Resource,
  Rubric,
  Topic,
} from '../../data/types';

type LessonDetail = {
  lesson: Lesson;
  group?: Group;
  level?: Level;
  topic?: Topic;
  rubric?: Rubric;
  resources: Resource[];
};

type LessonTab = 'objectives' | 'activities' | 'resources' | 'assessment' | 'review';

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

function collectObjectives(detail: LessonDetail) {
  const objectives = [
    ...(detail.lesson.preActivity?.objectives ?? []),
    ...(detail.lesson.whileActivity?.objectives ?? []),
    ...(detail.lesson.postActivity?.objectives ?? []),
  ].filter(Boolean);
  return [...new Set(objectives)];
}

function getPhaseTitle(phase: 'pre' | 'while' | 'post') {
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

function describeMaterials(materials?: string[]) {
  if (!materials?.length) return null;
  return materials.join(', ');
}

function describeDifferentiation(differentiation?: Record<string, string>) {
  if (!differentiation) return null;
  const entries = Object.entries(differentiation).filter(([, value]) => Boolean(value));
  if (!entries.length) return null;
  return entries.map(([group, detail]) => `${group}: ${detail}`).join(' • ');
}

export function LessonWorkspace() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonDetail[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LessonTab>('objectives');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadLessons = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [loadedLessons, topics, groups, levels, rubrics, resources] = await Promise.all([
        DataStore.getAll('lessons'),
        DataStore.getAll('topics'),
        DataStore.getAll('groups'),
        DataStore.getAll('levels'),
        DataStore.getAll('rubrics'),
        DataStore.getAll('resources'),
      ]);

      const groupById = new Map(groups.map((group) => [group.id, group]));
      const levelById = new Map(levels.map((level) => [level.id, level]));
      const topicById = new Map(topics.map((topic) => [topic.id, topic]));
      const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));

      const resourcesByLesson = resources.reduce<Map<string, Resource[]>>((map, resource) => {
        if (resource.attachedTo !== 'lesson') return map;
        const list = map.get(resource.attachedId) ?? [];
        list.push(resource);
        map.set(resource.attachedId, list);
        return map;
      }, new Map());

      loadedLessons.sort((a, b) => {
        if (a.date === b.date) {
          return a.startTime.localeCompare(b.startTime);
        }
        return a.date.localeCompare(b.date);
      });

      const details: LessonDetail[] = loadedLessons.map((lesson) => {
        const group = groupById.get(lesson.groupId);
        const level = group ? levelById.get(group.levelId) : undefined;
        const topic = topicById.get(lesson.topicId);
        const rubric = lesson.rubricId ? rubricById.get(lesson.rubricId) : undefined;
        const lessonResources = resourcesByLesson.get(lesson.id) ?? [];
        return { lesson, group, level, topic, rubric, resources: lessonResources };
      });

      setLessons(details);
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

  const lessonById = useMemo(() => {
    return lessons.reduce<Record<string, LessonDetail>>((acc, detail) => {
      acc[detail.lesson.id] = detail;
      return acc;
    }, {});
  }, [lessons]);

  const selectedLesson = activeLessonId ? lessonById[activeLessonId] : null;
  const isDrawerOpen = Boolean(selectedLesson);

  const closeDrawer = useCallback(() => {
    setActiveLessonId(null);
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDrawer, isDrawerOpen]);

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

  const visibleLessons = useMemo(() => lessons.slice(0, 6), [lessons]);

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
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
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

      {isDrawerOpen && selectedLesson ? (
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
                  {selectedLesson.level ? `Grade ${selectedLesson.level.gradeNumber} ${selectedLesson.level.subject}` : 'Unassigned level'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                  {LESSON_STATUS_LABELS[selectedLesson.lesson.status]}
                </span>
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
                      <ObjectivesPanel detail={selectedLesson} />
                    ) : null}
                    {tab.id === 'activities' ? <ActivitiesPanel detail={selectedLesson} /> : null}
                    {tab.id === 'resources' ? <ResourcesPanel detail={selectedLesson} /> : null}
                    {tab.id === 'assessment' ? <AssessmentPanel detail={selectedLesson} /> : null}
                    {tab.id === 'review' ? (
                      <ReviewPanel detail={selectedLesson} lessons={lessonById} />
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type PanelProps = { detail: LessonDetail };

type ReviewPanelProps = PanelProps & { lessons: Record<string, LessonDetail> };

function ObjectivesPanel({ detail }: PanelProps) {
  const objectives = collectObjectives(detail);
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

function ActivitiesPanel({ detail }: PanelProps) {
  const phases: { id: 'pre' | 'while' | 'post'; data?: Lesson['preActivity'] }[] = [
    { id: 'pre', data: detail.lesson.preActivity },
    { id: 'while', data: detail.lesson.whileActivity },
    { id: 'post', data: detail.lesson.postActivity },
  ];

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const content = phase.data;
        return (
          <article key={phase.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <header className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">{getPhaseTitle(phase.id)}</h3>
                <p className="text-xs uppercase tracking-wide text-slate-400">Structured guidance for this phase</p>
              </div>
              {content?.duration ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  {`${content.duration} min`}
                </span>
              ) : null}
            </header>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              {content?.instructions ? (
                <p className="rounded-xl bg-white/5 p-4 text-sm text-slate-200">
                  {content.instructions}
                </p>
              ) : (
                <p className="text-sm text-slate-400">
                  No detailed plan recorded yet. Add step-by-step guidance to guide facilitation.
                </p>
              )}
              {content?.materials?.length ? (
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <Tag className="h-3.5 w-3.5 text-accent" aria-hidden />
                  Materials: <span className="text-slate-300">{describeMaterials(content.materials)}</span>
                </p>
              ) : null}
              {content?.grouping ? (
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Grouping: <span className="text-slate-200">{content.grouping}</span>
                </p>
              ) : null}
              {content?.differentiation ? (
                <p className="text-xs text-slate-300">
                  Differentiation: <span className="text-slate-200">{describeDifferentiation(content.differentiation)}</span>
                </p>
              ) : null}
              {content?.assessment ? (
                <p className="text-xs text-slate-300">
                  Assessment: <span className="text-slate-200">{content.assessment}</span>
                </p>
              ) : null}
              {content?.reflection ? (
                <p className="text-xs text-slate-300">
                  Reflection: <span className="text-slate-200">{content.reflection}</span>
                </p>
              ) : null}
              {content?.homework ? (
                <p className="text-xs text-slate-300">
                  Homework: <span className="text-slate-200">{content.homework}</span>
                </p>
              ) : null}
              {content?.cleanup ? (
                <p className="text-xs text-slate-300">
                  Cleanup: <span className="text-slate-200">{content.cleanup}</span>
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ResourcesPanel({ detail }: PanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <NotebookTabs className="h-4 w-4 text-accent" aria-hidden />
          Linked resources
        </header>
        {detail.resources.length ? (
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {detail.resources.map((resource) => (
              <li key={resource.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                <div>
                  <p className="font-medium text-white">{resource.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{resource.type.toUpperCase()}</p>
                </div>
                <a
                  href={resource.url}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            No resources attached yet. Link slide decks, worksheets, or external tools to keep lesson prep together.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
        <p>
          Coming soon: attach templates, rubrics, and shared drives with drag-and-drop uploads and auto-tagging.
        </p>
      </div>
    </div>
  );
}

function AssessmentPanel({ detail }: PanelProps) {
  const rubric = detail.rubric;
  const checklist = detail.lesson.whileActivity?.assessment ?? detail.lesson.postActivity?.assessment;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <BookOpenCheck className="h-4 w-4 text-accent" aria-hidden />
          Assessment plan
        </header>
        {checklist ? (
          <p className="mt-4 text-sm text-slate-200">{checklist}</p>
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
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{criterion.points} pts</span>
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

function ReviewPanel({ detail, lessons }: ReviewPanelProps) {
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
            <span className="font-semibold text-white">{LESSON_STATUS_LABELS[detail.lesson.status]}</span>
          </p>
          {detail.lesson.completionNotes ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              {detail.lesson.completionNotes}
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              No review notes yet. Capture reflections or adjustments after delivering the lesson.
            </p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <Layers className="h-4 w-4 text-accent" aria-hidden />
          Linked sections
        </header>
        {linkedLessons.length ? (
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {linkedLessons.map((linked) => (
              <li key={linked.lesson.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
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
