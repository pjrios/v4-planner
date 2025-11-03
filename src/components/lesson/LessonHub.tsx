import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { addDays, format, isValid, parseISO, startOfWeek } from 'date-fns';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  NotebookTabs,
} from 'lucide-react';
import type { Group, Lesson, Level, Topic } from '../../data/types';

export type LessonHubSnapshot = {
  lesson: Lesson;
  topic?: Topic;
  level?: Level;
  group?: Group;
};

type LessonHubProps = {
  lessons: LessonHubSnapshot[];
  levels: Level[];
  groups: Group[];
  topics: Topic[];
  onOpenLesson: (lessonId: string) => void;
  onCreateLesson: () => void;
};

type HubLessonNode = {
  id: string;
  title: string;
  status: Lesson['status'];
  statusLabel: string;
  dateLabel: string;
  timeLabel: string;
  sortKey: string;
};

type HubWeekNode = {
  key: string;
  label: string;
  startDate: Date | null;
  lessons: HubLessonNode[];
};

type HubTopicNode = {
  topicId: string;
  label: string;
  totalLessons: number;
  weeks: HubWeekNode[];
};

type HubGroupNode = {
  groupId: string;
  label: string;
  totalLessons: number;
  topics: HubTopicNode[];
};

type HubLevelNode = {
  levelId: string;
  label: string;
  badge: string;
  totalLessons: number;
  groups: HubGroupNode[];
  sortGrade: number | null;
  sortSubject: string;
};

type TopicBucket = {
  topicId: string;
  label: string;
  totalLessons: number;
  weeks: Map<string, HubWeekNode>;
};

type GroupBucket = {
  node: HubGroupNode;
  topics: Map<string, TopicBucket>;
};

type LevelBucket = {
  node: HubLevelNode;
  groups: Map<string, GroupBucket>;
};

const STATUS_LABELS: Record<Lesson['status'], string> = {
  draft: 'Draft',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const DATE_LABEL_FORMAT = 'MMM d, yyyy';
const WEEK_LABEL_FORMAT = 'MMM d';
const WEEK_START_OPTIONS = { weekStartsOn: 1 as const };
const timeFormatter = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatTimeValue(value?: string | null) {
  if (!value) {
    return '';
  }
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return '';
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return timeFormatter.format(date);
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  const startLabel = formatTimeValue(startTime);
  const endLabel = formatTimeValue(endTime);

  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }

  if (startLabel) {
    return startLabel;
  }

  if (endLabel) {
    return endLabel;
  }

  return '';
}

function safeParseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function buildWeekLabel(start: Date) {
  const end = addDays(start, 6);
  return `Week of ${format(start, WEEK_LABEL_FORMAT)} – ${format(end, WEEK_LABEL_FORMAT)}`;
}

export function LessonHub({
  lessons,
  levels,
  groups,
  topics,
  onOpenLesson,
  onCreateLesson,
}: LessonHubProps) {
  const totalTemplates = lessons.filter((entry) => entry.lesson.status === 'draft').length;
  const scheduledCount = lessons.length - totalTemplates;

  const levelNodes = useMemo<HubLevelNode[]>(() => {
    const levelById = new Map(levels.map((level) => [level.id, level]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));

    const levelBuckets = new Map<string, LevelBucket>();

    const ensureLevel = (levelId: string, levelRef: Level | undefined) => {
      if (!levelBuckets.has(levelId)) {
        const gradeNumber = levelRef?.gradeNumber ?? null;
        const subjectLabel = levelRef?.subject ?? '';
        const label = levelRef
          ? `Grade ${levelRef.gradeNumber ?? ''} ${subjectLabel}`.trim()
          : 'Unassigned level';
        levelBuckets.set(levelId, {
          node: {
            levelId,
            label,
            badge: gradeNumber != null ? `${gradeNumber}` : '–',
            totalLessons: 0,
            groups: [],
            sortGrade: gradeNumber,
            sortSubject: subjectLabel,
          },
          groups: new Map(),
        });
      }
      return levelBuckets.get(levelId)!;
    };

    const ensureGroup = (levelBucket: LevelBucket, groupId: string, groupRef: Group | undefined) => {
      if (!levelBucket.groups.has(groupId)) {
        levelBucket.groups.set(groupId, {
          node: {
            groupId,
            label: groupRef?.displayName ?? 'Unassigned group',
            totalLessons: 0,
            topics: [],
          },
          topics: new Map(),
        });
      }
      return levelBucket.groups.get(groupId)!;
    };

    const ensureTopic = (groupBucket: GroupBucket, topicId: string, topicRef: Topic | undefined) => {
      if (!groupBucket.topics.has(topicId)) {
        groupBucket.topics.set(topicId, {
          topicId,
          label: topicRef?.name ?? 'General lessons',
          totalLessons: 0,
          weeks: new Map(),
        });
      }
      return groupBucket.topics.get(topicId)!;
    };

    const ensureWeek = (
      topicBucket: TopicBucket,
      key: string,
      start: Date | null
    ) => {
      if (!topicBucket.weeks.has(key)) {
        topicBucket.weeks.set(key, {
          key,
          label: start ? buildWeekLabel(start) : 'Unscheduled lessons',
          startDate: start,
          lessons: [],
        });
      }
      return topicBucket.weeks.get(key)!;
    };

    for (const snapshot of lessons) {
      const lesson = snapshot.lesson;
      const groupRef = snapshot.group ?? groupById.get(lesson.groupId);
      const levelRef =
        snapshot.level ??
        (groupRef ? levelById.get(groupRef.levelId) : undefined);
      const topicRef = snapshot.topic ?? topicById.get(lesson.topicId);

      const levelId = levelRef?.id ?? groupRef?.levelId ?? 'unassigned';
      const levelBucket = ensureLevel(levelId, levelRef);

      const groupId = groupRef?.id ?? lesson.groupId ?? 'unassigned';
      const groupBucket = ensureGroup(levelBucket, groupId, groupRef);

      const topicId = topicRef?.id ?? lesson.topicId ?? 'unassigned';
      const topicBucket = ensureTopic(groupBucket, topicId, topicRef);

      const lessonDate = safeParseDate(lesson.date);
      const weekStart = lessonDate ? startOfWeek(lessonDate, WEEK_START_OPTIONS) : null;
      const weekKey = weekStart ? format(weekStart, 'yyyy-MM-dd') : 'unscheduled';
      const weekBucket = ensureWeek(topicBucket, weekKey, weekStart);

      const dateLabel = lessonDate ? format(lessonDate, DATE_LABEL_FORMAT) : 'Date not set';
      const timeLabel = formatTimeRange(lesson.startTime, lesson.endTime);
      const baseTitle = lesson.title?.trim() || topicRef?.name || 'Untitled lesson';
      const sortKey = `${lessonDate ? format(lessonDate, 'yyyy-MM-dd') : '9999-12-31'}_${
        lesson.startTime ?? '99:99'
      }_${lesson.id}`;

      weekBucket.lessons.push({
        id: lesson.id,
        title: baseTitle,
        status: lesson.status,
        statusLabel: STATUS_LABELS[lesson.status],
        dateLabel,
        timeLabel,
        sortKey,
      });

      topicBucket.totalLessons += 1;
      groupBucket.node.totalLessons += 1;
      levelBucket.node.totalLessons += 1;
    }

    return Array.from(levelBuckets.values())
      .map(({ node, groups: groupMapValue }) => {
        const groupNodes = Array.from(groupMapValue.values())
          .map(({ node: groupNode, topics: topicMapValue }) => {
            const topicNodes = Array.from(topicMapValue.values())
              .map((topicBucket) => {
                const weekNodes = Array.from(topicBucket.weeks.values())
                  .map((week) => ({
                    ...week,
                    lessons: [...week.lessons].sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
                  }))
                  .sort((a, b) => {
                    if (a.startDate && b.startDate) {
                      return a.startDate.getTime() - b.startDate.getTime();
                    }
                    if (a.startDate) return -1;
                    if (b.startDate) return 1;
                    return a.label.localeCompare(b.label);
                  });

                return {
                  topicId: topicBucket.topicId,
                  label: topicBucket.label,
                  totalLessons: topicBucket.totalLessons,
                  weeks: weekNodes,
                };
              })
              .sort((a, b) => a.label.localeCompare(b.label));

            return {
              groupId: groupNode.groupId,
              label: groupNode.label,
              totalLessons: groupNode.totalLessons,
              topics: topicNodes,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        return {
          levelId: node.levelId,
          label: node.label,
          badge: node.badge,
          totalLessons: node.totalLessons,
          groups: groupNodes,
          sortGrade: node.sortGrade,
          sortSubject: node.sortSubject,
        };
      })
      .filter((node) => node.totalLessons > 0)
      .sort((a, b) => {
        const gradeA = a.sortGrade;
        const gradeB = b.sortGrade;
        if (gradeA != null && gradeB != null) {
          if (gradeA !== gradeB) {
            return gradeA - gradeB;
          }
          return a.sortSubject.localeCompare(b.sortSubject);
        }
        if (gradeA != null) return -1;
        if (gradeB != null) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [groups, lessons, levels, topics]);

  const [expandedLevels, setExpandedLevels] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);

  useEffect(() => {
    const availableLevels = levelNodes.map((node) => node.levelId);
    const availableGroups = levelNodes.flatMap((level) =>
      level.groups.map((group) => `${level.levelId}:${group.groupId}`)
    );
    const availableTopics = levelNodes.flatMap((level) =>
      level.groups.flatMap((group) =>
        group.topics.map((topic) => `${level.levelId}:${group.groupId}:${topic.topicId}`)
      )
    );

    setExpandedLevels((current) => {
      const filtered = current.filter((id) => availableLevels.includes(id));
      if (filtered.length > 0) {
        return filtered;
      }
      return availableLevels.length > 0 ? [availableLevels[0]] : [];
    });

    setExpandedGroups((current) => {
      const filtered = current.filter((key) => availableGroups.includes(key));
      if (filtered.length > 0) {
        return filtered;
      }
      if (availableGroups.length > 0) {
        return [availableGroups[0]];
      }
      return [];
    });

    setExpandedTopics((current) => {
      const filtered = current.filter((key) => availableTopics.includes(key));
      if (filtered.length > 0) {
        return filtered;
      }
      if (availableTopics.length > 0) {
        return [availableTopics[0]];
      }
      return [];
    });
  }, [levelNodes]);

  const toggleLevel = (levelId: string) => {
    setExpandedLevels((current) =>
      current.includes(levelId)
        ? current.filter((id) => id !== levelId)
        : [...current, levelId]
    );
  };

  const toggleGroup = (levelId: string, groupId: string) => {
    const key = `${levelId}:${groupId}`;
    setExpandedGroups((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    );
  };

  const toggleTopic = (levelId: string, groupId: string, topicId: string) => {
    const key = `${levelId}:${groupId}:${topicId}`;
    setExpandedTopics((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200 shadow-inner shadow-black/20">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <NotebookTabs className="h-4 w-4 text-accent" aria-hidden />
            Lesson hub overview
          </div>
          <button
            type="button"
            onClick={onCreateLesson}
            className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-accent/60 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            + Add lesson
          </button>
        </header>
        <p className="mt-3 text-sm text-slate-400">
          Keep reusable lessons in one library. Link them to levels, trimesters, and calendar slots when you are ready
          to schedule instruction.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <HubStatCard
            icon={<Layers className="h-4 w-4" aria-hidden />}
            label="Total lessons"
            value={lessons.length}
            description={`${topics.length} topics • ${levels.length} levels`}
          />
          <HubStatCard
            icon={<CalendarDays className="h-4 w-4" aria-hidden />}
            label="Scheduled"
            value={scheduledCount}
            description={`${groups.length} class groups`}
          />
          <HubStatCard
            icon={<NotebookTabs className="h-4 w-4" aria-hidden />}
            label="Draft templates"
            value={totalTemplates}
            description="Ready to reuse or adapt"
          />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Curriculum hierarchy</h3>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Expand a level to review groups, topics, and weekly sessions. Open a lesson to edit or reuse it.
            </p>
          </div>
        </header>
        {levelNodes.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No lessons are saved yet. Add a lesson to start populating the hub.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {levelNodes.map((level) => {
              const isLevelExpanded = expandedLevels.includes(level.levelId);
              return (
                <li key={level.levelId} className="rounded-2xl border border-white/10 bg-surface/60">
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => toggleLevel(level.levelId)}
                      className="flex flex-1 items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      <div className="flex items-center gap-4">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
                          {level.badge}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{level.label}</p>
                          <p className="text-xs text-slate-400">
                            {level.totalLessons}{' '}
                            lesson{level.totalLessons === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300">
                        {isLevelExpanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                    </button>
                  </div>
                  {isLevelExpanded ? (
                    <div className="border-t border-white/10 bg-slate-950/70 px-4 py-4">
                      {level.groups.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-xs text-slate-400">
                          No groups linked to this level yet.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {level.groups.map((group) => {
                            const groupKey = `${level.levelId}:${group.groupId}`;
                            const isGroupExpanded = expandedGroups.includes(groupKey);
                            return (
                              <li key={group.groupId} className="rounded-xl border border-white/10 bg-white/5">
                                <div className="flex items-center justify-between gap-3 px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleGroup(level.levelId, group.groupId)}
                                    className="flex flex-1 items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-white">{group.label}</p>
                                      <p className="text-xs text-slate-400">
                                        {group.totalLessons}{' '}
                                        lesson{group.totalLessons === 1 ? '' : 's'}
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300">
                                      {isGroupExpanded ? (
                                        <ChevronUp className="h-4 w-4" aria-hidden />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" aria-hidden />
                                      )}
                                    </span>
                                  </button>
                                </div>
                                {isGroupExpanded ? (
                                  <div className="border-t border-white/10 bg-slate-950/50 px-4 py-4">
                                    {group.topics.length === 0 ? (
                                      <p className="rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-xs text-slate-400">
                                        No topics yet for this group.
                                      </p>
                                    ) : (
                                      <ul className="space-y-3">
                                        {group.topics.map((topic) => {
                                          const topicKey = `${level.levelId}:${group.groupId}:${topic.topicId}`;
                                          const isTopicExpanded = expandedTopics.includes(topicKey);
                                          return (
                                            <li key={topic.topicId} className="rounded-lg border border-white/10 bg-white/5">
                                              <div className="flex items-center justify-between gap-3 px-3 py-3">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    toggleTopic(level.levelId, group.groupId, topic.topicId)
                                                  }
                                                  className="flex flex-1 items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                                >
                                                  <div>
                                                    <p className="text-sm font-semibold text-white">{topic.label}</p>
                                                    <p className="text-xs text-slate-400">
                                                      {topic.totalLessons}{' '}
                                                      lesson{topic.totalLessons === 1 ? '' : 's'}
                                                    </p>
                                                  </div>
                                                  <span className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300">
                                                    {isTopicExpanded ? (
                                                      <ChevronUp className="h-4 w-4" aria-hidden />
                                                    ) : (
                                                      <ChevronDown className="h-4 w-4" aria-hidden />
                                                    )}
                                                  </span>
                                                </button>
                                              </div>
                                              {isTopicExpanded ? (
                                                <div className="border-t border-white/10 bg-slate-950/60 px-3 py-3">
                                                  {topic.weeks.length === 0 ? (
                                                    <p className="rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-xs text-slate-400">
                                                      No sessions scheduled yet.
                                                    </p>
                                                  ) : (
                                                    <ul className="space-y-3">
                                                      {topic.weeks.map((week) => (
                                                        <li key={week.key} className="rounded-lg border border-white/10 bg-white/5 p-4">
                                                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                            <div>
                                                              <p className="text-sm font-semibold text-white">{week.label}</p>
                                                              <p className="text-xs text-slate-400">
                                                                {week.lessons.length}{' '}
                                                                class{week.lessons.length === 1 ? '' : 'es'}
                                                              </p>
                                                            </div>
                                                          </div>
                                                          <ul className="mt-3 space-y-2">
                                                            {week.lessons.map((lessonNode, index) => (
                                                              <li
                                                                key={lessonNode.id}
                                                                className="rounded-lg border border-white/10 bg-white/5 p-3"
                                                              >
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => onOpenLesson(lessonNode.id)}
                                                                    className="text-sm font-semibold text-white underline-offset-4 transition hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                                                  >
                                                                    Class {index + 1}: {lessonNode.title}
                                                                  </button>
                                                                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                                                                    {lessonNode.statusLabel}
                                                                  </span>
                                                                </div>
                                                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                                                                  <span className="inline-flex items-center gap-1">
                                                                    <CalendarDays className="h-3 w-3" aria-hidden />
                                                                    {lessonNode.dateLabel}
                                                                  </span>
                                                                  {lessonNode.timeLabel ? (
                                                                    <span className="inline-flex items-center gap-1">
                                                                      <Clock className="h-3 w-3" aria-hidden />
                                                                      {lessonNode.timeLabel}
                                                                    </span>
                                                                  ) : null}
                                                                </div>
                                                              </li>
                                                            ))}
                                                          </ul>
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  )}
                                                </div>
                                              ) : null}
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function HubStatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow shadow-black/30">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </article>
  );
}
