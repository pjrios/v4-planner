export type Identifier = string;

export type AcademicStatus = 'upcoming' | 'current' | 'completed';
export type LessonStatus =
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Trimester {
  id: Identifier;
  name: string;
  startDate: string; // ISO Date (YYYY-MM-DD)
  endDate: string; // ISO Date (YYYY-MM-DD)
  totalWeeks: number;
  schoolDays: number;
  color: string;
  status: AcademicStatus;
  academicYear: string;
}

export type HolidayType =
  | 'public_holiday'
  | 'school_break'
  | 'teacher_day'
  | 'field_trip'
  | 'assembly'
  | 'other';

export interface Holiday {
  id: Identifier;
  name: string;
  startDate: string;
  endDate: string;
  affectsGroups: string[]; // ['all'] or group display names/ids
  type: HolidayType;
  displayColor?: string;
  showOnCalendar: boolean;
}

export interface Level {
  id: Identifier;
  gradeNumber: number;
  subject: string;
  color: string;
}

export interface Group {
  id: Identifier;
  levelId: Identifier;
  letter: string;
  displayName: string;
}

export interface ScheduleSession {
  dayOfWeek: number; // 1 (Mon) - 7 (Sun)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Schedule {
  id: Identifier;
  groupId: Identifier;
  trimesterId: Identifier;
  sessions: ScheduleSession[];
}

export interface Topic {
  id: Identifier;
  name: string;
  description?: string;
  trimesterId: Identifier;
  levelIds: Identifier[];
  estimatedSessions?: number;
  color?: string;
}

export interface LessonPhase {
  duration: number;
  materials?: string[];
  preparation?: string;
  studentPrep?: string;
  objectives?: string[];
  type?: string;
  grouping?: string;
  instructions?: string;
  differentiation?: Record<string, string>;
  assessment?: string;
  closure?: string;
  reflection?: string;
  homework?: string;
  cleanup?: string;
  preview?: string;
}

export interface Lesson {
  id: Identifier;
  groupId: Identifier;
  topicId: Identifier;
  trimesterId: Identifier;
  date: string;
  startTime: string;
  endTime: string;
  status: LessonStatus;
  preActivity?: LessonPhase;
  whileActivity?: LessonPhase;
  postActivity?: LessonPhase;
  resourceIds?: Identifier[];
  rubricId?: Identifier;
  linkedLessonIds?: Identifier[];
  completionNotes?: string;
}

export interface RubricCriterion {
  name: string;
  points: number;
  description?: string;
}

export interface Rubric {
  id: Identifier;
  name: string;
  criteria: RubricCriterion[];
  totalPoints: number;
  attachedTo: 'topic' | 'lesson';
  attachedId: Identifier;
}

export type ResourceType = 'link' | 'pdf' | 'image' | 'video' | 'doc' | 'other';

export interface Resource {
  id: Identifier;
  name: string;
  type: ResourceType;
  url: string;
  attachedTo: 'lesson' | 'topic';
  attachedId: Identifier;
}

export type LessonPhaseType = 'pre' | 'while' | 'post';

export interface ActivityTemplate {
  id: Identifier;
  name: string;
  phase: LessonPhaseType;
  fields: Record<string, unknown>;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  data: Record<string, unknown[]>;
}
