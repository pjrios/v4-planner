import { formatISO } from 'date-fns';
import { db, DataStore } from './db';
import type {
  ActivityTemplate,
  Group,
  Holiday,
  Lesson,
  Level,
  Resource,
  Rubric,
  Schedule,
  Topic,
  Trimester,
} from './types';

const trimester2025: Trimester = {
  id: 'trim_2025_fall',
  name: 'Trimester 1',
  startDate: '2025-09-01',
  endDate: '2025-12-15',
  totalWeeks: 14,
  schoolDays: 70,
  color: '#4ECDC4',
  status: 'upcoming',
  academicYear: '2025-2026',
};

const holidays: Holiday[] = [
  {
    id: 'holiday_national_oct12',
    name: 'National Holiday',
    startDate: '2025-10-12',
    endDate: '2025-10-12',
    affectsGroups: ['all'],
    type: 'public_holiday',
    displayColor: '#94a3b8',
    showOnCalendar: true,
  },
  {
    id: 'holiday_all_saints',
    name: 'All Saints Break',
    startDate: '2025-11-01',
    endDate: '2025-11-02',
    affectsGroups: ['all'],
    type: 'school_break',
    displayColor: '#cbd5f5',
    showOnCalendar: true,
  },
  {
    id: 'holiday_teacher_planning',
    name: 'Teacher Planning Day',
    startDate: '2025-11-20',
    endDate: '2025-11-20',
    affectsGroups: ['all'],
    type: 'teacher_day',
    displayColor: '#fbbf24',
    showOnCalendar: true,
  },
  {
    id: 'holiday_field_trip',
    name: 'Robotics Field Trip',
    startDate: '2025-12-10',
    endDate: '2025-12-10',
    affectsGroups: ['5A', '5B', '5C'],
    type: 'field_trip',
    displayColor: '#f97316',
    showOnCalendar: true,
  },
];

const levels: Level[] = [
  { id: 'level_5_tech', gradeNumber: 5, subject: 'Technology', color: '#4ECDC4' },
  { id: 'level_6_tech', gradeNumber: 6, subject: 'Technology', color: '#EE964B' },
  { id: 'level_7_tech', gradeNumber: 7, subject: 'Technology', color: '#A182E2' },
];

const groups: Group[] = [
  { id: 'group_5a', levelId: 'level_5_tech', letter: 'A', displayName: '5A' },
  { id: 'group_5b', levelId: 'level_5_tech', letter: 'B', displayName: '5B' },
  { id: 'group_5c', levelId: 'level_5_tech', letter: 'C', displayName: '5C' },
  { id: 'group_6a', levelId: 'level_6_tech', letter: 'A', displayName: '6A' },
  { id: 'group_6b', levelId: 'level_6_tech', letter: 'B', displayName: '6B' },
  { id: 'group_7a', levelId: 'level_7_tech', letter: 'A', displayName: '7A' },
  { id: 'group_7b', levelId: 'level_7_tech', letter: 'B', displayName: '7B' },
  { id: 'group_7c', levelId: 'level_7_tech', letter: 'C', displayName: '7C' },
];

const schedules: Schedule[] = [
  {
    id: 'schedule_5a_trim1',
    groupId: 'group_5a',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '10:00' },
    ],
  },
  {
    id: 'schedule_5b_trim1',
    groupId: 'group_5b',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 2, startTime: '08:00', endTime: '10:00' },
      { dayOfWeek: 4, startTime: '13:00', endTime: '15:00' },
    ],
  },
  {
    id: 'schedule_5c_trim1',
    groupId: 'group_5c',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 3, startTime: '13:00', endTime: '15:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
    ],
  },
  {
    id: 'schedule_6a_trim1',
    groupId: 'group_6a',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 1, startTime: '11:00', endTime: '12:30' },
      { dayOfWeek: 3, startTime: '11:00', endTime: '12:30' },
    ],
  },
  {
    id: 'schedule_6b_trim1',
    groupId: 'group_6b',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 2, startTime: '10:00', endTime: '11:30' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '11:30' },
    ],
  },
  {
    id: 'schedule_7a_trim1',
    groupId: 'group_7a',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 1, startTime: '13:30', endTime: '15:00' },
      { dayOfWeek: 4, startTime: '13:30', endTime: '15:00' },
    ],
  },
  {
    id: 'schedule_7b_trim1',
    groupId: 'group_7b',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 2, startTime: '13:30', endTime: '15:00' },
      { dayOfWeek: 5, startTime: '11:30', endTime: '13:00' },
    ],
  },
  {
    id: 'schedule_7c_trim1',
    groupId: 'group_7c',
    trimesterId: trimester2025.id,
    sessions: [
      { dayOfWeek: 3, startTime: '13:30', endTime: '15:00' },
      { dayOfWeek: 5, startTime: '13:30', endTime: '15:00' },
    ],
  },
];

const topics: Topic[] = [
  {
    id: 'topic_rob_basics',
    name: 'Robotics Basics',
    description: 'Introduction to robotics components and safety.',
    trimesterId: trimester2025.id,
    levelIds: ['level_5_tech'],
    estimatedSessions: 4,
    color: '#EE964B',
  },
  {
    id: 'topic_digital_citizenship',
    name: 'Digital Citizenship',
    description: 'Responsible and ethical technology use.',
    trimesterId: trimester2025.id,
    levelIds: ['level_6_tech'],
    estimatedSessions: 3,
    color: '#4ECDC4',
  },
  {
    id: 'topic_design_thinking',
    name: 'Design Thinking',
    description: 'Iterative prototyping and collaboration.',
    trimesterId: trimester2025.id,
    levelIds: ['level_7_tech'],
    estimatedSessions: 5,
    color: '#A182E2',
  },
];

const rubrics: Rubric[] = [
  {
    id: 'rubric_robotics_intro',
    name: 'Robotics Build Rubric',
    criteria: [
      { name: 'Structure Stability', points: 25, description: 'Robot stands without support.' },
      { name: 'Wiring & Safety', points: 25, description: 'Cables secure and safe.' },
      { name: 'Functionality', points: 25, description: 'Completes required movements.' },
      { name: 'Documentation', points: 25, description: 'Logbook and reflections submitted.' },
    ],
    totalPoints: 100,
    attachedTo: 'topic',
    attachedId: 'topic_rob_basics',
  },
  {
    id: 'rubric_digital_ethics',
    name: 'Digital Citizenship Reflection',
    criteria: [
      { name: 'Scenario Analysis', points: 40 },
      { name: 'Group Collaboration', points: 30 },
      { name: 'Action Plan', points: 30 },
    ],
    totalPoints: 100,
    attachedTo: 'lesson',
    attachedId: 'lesson_6a_digcit_1',
  },
];

const resources: Resource[] = [
  {
    id: 'resource_robotics_slide',
    name: 'Robotics Basics Slides',
    type: 'pdf',
    url: 'files/robotics_basics.pdf',
    attachedTo: 'lesson',
    attachedId: 'lesson_5a_rob_1',
  },
  {
    id: 'resource_digcit_skit',
    name: 'Digital Citizenship Skit',
    type: 'doc',
    url: 'files/digital_citizenship_skit.docx',
    attachedTo: 'lesson',
    attachedId: 'lesson_6a_digcit_1',
  },
];

const templates: ActivityTemplate[] = [
  {
    id: 'template_lab_activity',
    name: 'Hands-on Lab',
    phase: 'while',
    fields: {
      instructions: 'Demonstrate core concept, then guide students through build.',
      materials: ['kits', 'laptops'],
      groupWork: true,
      timeEstimate: 80,
    },
  },
  {
    id: 'template_reflection',
    name: 'Exit Reflection',
    phase: 'post',
    fields: {
      prompts: ['What worked well?', 'Where did we struggle?', 'Next iteration focus'],
      timeEstimate: 15,
    },
  },
  {
    id: 'template_quick_launch',
    name: 'Quick Launch',
    phase: 'pre',
    fields: {
      duration: 10,
      objectives: ['Set intention for the session', 'Surface prior knowledge'],
    },
  },
];

const lessons: Lesson[] = [
  {
    id: 'lesson_5a_rob_1',
    groupId: 'group_5a',
    topicId: 'topic_rob_basics',
    trimesterId: trimester2025.id,
    date: '2025-09-01',
    startTime: '08:00',
    endTime: '10:00',
    status: 'planned',
    preActivity: {
      duration: 10,
      materials: ['Projector'],
      preparation: 'Set up intro slides.',
      objectives: ['Introduce robotics toolkit'],
    },
    whileActivity: {
      duration: 90,
      instructions: 'Students build starter bot following guided steps.',
      grouping: 'pairs',
      assessment: 'Observation checklist',
    },
    postActivity: {
      duration: 20,
      reflection: 'Round-robin share about challenges.',
      homework: 'Review safety checklist.',
    },
    resourceIds: ['resource_robotics_slide'],
    rubricId: 'rubric_robotics_intro',
    linkedLessonIds: ['lesson_5b_rob_1', 'lesson_5c_rob_1'],
  },
  {
    id: 'lesson_5b_rob_1',
    groupId: 'group_5b',
    topicId: 'topic_rob_basics',
    trimesterId: trimester2025.id,
    date: '2025-09-02',
    startTime: '08:00',
    endTime: '10:00',
    status: 'planned',
    preActivity: {
      duration: 10,
      materials: ['Projector'],
      objectives: ['Introduce robotics toolkit'],
    },
    whileActivity: {
      duration: 90,
      instructions: 'Repeat starter bot build with emphasis on wiring safety.',
      grouping: 'pairs',
    },
    postActivity: {
      duration: 20,
      reflection: 'Document adjustments to share with other sections.',
    },
    resourceIds: ['resource_robotics_slide'],
    rubricId: 'rubric_robotics_intro',
    linkedLessonIds: ['lesson_5a_rob_1', 'lesson_5c_rob_1'],
  },
  {
    id: 'lesson_5c_rob_1',
    groupId: 'group_5c',
    topicId: 'topic_rob_basics',
    trimesterId: trimester2025.id,
    date: '2025-09-03',
    startTime: '13:00',
    endTime: '15:00',
    status: 'planned',
    preActivity: {
      duration: 10,
      preparation: 'Prep extra kits for afternoon session.',
    },
    whileActivity: {
      duration: 90,
      instructions: 'Students build starter bot with troubleshooting stations.',
      grouping: 'small groups',
    },
    postActivity: {
      duration: 20,
      reflection: 'Students record video recap on tablets.',
    },
    resourceIds: ['resource_robotics_slide'],
    rubricId: 'rubric_robotics_intro',
    linkedLessonIds: ['lesson_5a_rob_1', 'lesson_5b_rob_1'],
  },
  {
    id: 'lesson_6a_digcit_1',
    groupId: 'group_6a',
    topicId: 'topic_digital_citizenship',
    trimesterId: trimester2025.id,
    date: '2025-09-01',
    startTime: '11:00',
    endTime: '12:30',
    status: 'planned',
    preActivity: {
      duration: 10,
      objectives: ['Define digital footprint'],
    },
    whileActivity: {
      duration: 70,
      instructions: 'Case study carousel and small group debates.',
      assessment: 'Team summary slide.',
    },
    postActivity: {
      duration: 10,
      homework: 'Interview a family member about online safety.',
    },
    resourceIds: ['resource_digcit_skit'],
    rubricId: 'rubric_digital_ethics',
    linkedLessonIds: ['lesson_6b_digcit_1'],
  },
  {
    id: 'lesson_6b_digcit_1',
    groupId: 'group_6b',
    topicId: 'topic_digital_citizenship',
    trimesterId: trimester2025.id,
    date: '2025-09-02',
    startTime: '10:00',
    endTime: '11:30',
    status: 'planned',
    preActivity: {
      duration: 10,
      objectives: ['Define digital footprint'],
    },
    whileActivity: {
      duration: 70,
      instructions: 'Role play scenarios plus collaborative policy writing.',
    },
    postActivity: {
      duration: 10,
      reflection: 'Students share personal commitments for responsible tech use.',
    },
    resourceIds: ['resource_digcit_skit'],
    rubricId: 'rubric_digital_ethics',
    linkedLessonIds: ['lesson_6a_digcit_1'],
  },
  {
    id: 'lesson_7a_design_1',
    groupId: 'group_7a',
    topicId: 'topic_design_thinking',
    trimesterId: trimester2025.id,
    date: '2025-09-01',
    startTime: '13:30',
    endTime: '15:00',
    status: 'planned',
    preActivity: {
      duration: 15,
      preparation: 'Set up empathy maps on tables.',
    },
    whileActivity: {
      duration: 60,
      instructions: 'Teams interview peers and map user needs.',
    },
    postActivity: {
      duration: 15,
      reflection: 'Post sticky-note insights to gallery wall.',
    },
    linkedLessonIds: ['lesson_7b_design_1', 'lesson_7c_design_1'],
  },
  {
    id: 'lesson_7b_design_1',
    groupId: 'group_7b',
    topicId: 'topic_design_thinking',
    trimesterId: trimester2025.id,
    date: '2025-09-02',
    startTime: '13:30',
    endTime: '15:00',
    status: 'planned',
    preActivity: {
      duration: 15,
      preparation: 'Rearrange space for interview corners.',
    },
    whileActivity: {
      duration: 60,
      instructions: 'Teams interview peers and map user needs with new prompts.',
    },
    postActivity: {
      duration: 15,
      reflection: 'Summarize findings on shared board.',
    },
    linkedLessonIds: ['lesson_7a_design_1', 'lesson_7c_design_1'],
  },
  {
    id: 'lesson_7c_design_1',
    groupId: 'group_7c',
    topicId: 'topic_design_thinking',
    trimesterId: trimester2025.id,
    date: '2025-09-03',
    startTime: '13:30',
    endTime: '15:00',
    status: 'planned',
    preActivity: {
      duration: 15,
      objectives: ['Build shared empathy map vocabulary'],
    },
    whileActivity: {
      duration: 60,
      instructions: 'Small teams rotate interview roles and capture needs.',
    },
    postActivity: {
      duration: 15,
      reflection: 'Set goals for prototype sprint.',
    },
    linkedLessonIds: ['lesson_7a_design_1', 'lesson_7b_design_1'],
  },
];

async function seedDatabase() {
  await db.transaction(
    'rw',
    db.trimesters,
    db.holidays,
    db.levels,
    db.groups,
    db.schedules,
    db.topics,
    db.lessons,
    db.rubrics,
    db.resources,
    db.templates,
    async () => {
      await DataStore.bulkSave('trimesters', [trimester2025]);
      await DataStore.bulkSave('holidays', holidays);
      await DataStore.bulkSave('levels', levels);
      await DataStore.bulkSave('groups', groups);
      await DataStore.bulkSave('schedules', schedules);
      await DataStore.bulkSave('topics', topics);
      await DataStore.bulkSave('lessons', lessons);
      await DataStore.bulkSave('rubrics', rubrics);
      await DataStore.bulkSave('resources', resources);
      await DataStore.bulkSave('templates', templates);
    }
  );
}

export async function ensureSampleData() {
  const existingTrimesters = await DataStore.getAll('trimesters');
  if (existingTrimesters.length > 0) {
    return {
      status: 'skipped',
      message: 'Sample data already present.',
      lastUpdated: formatISO(new Date()),
    } as const;
  }

  await seedDatabase();

  return {
    status: 'seeded',
    message: 'Sample data inserted for development preview.',
    lastUpdated: formatISO(new Date()),
  } as const;
}
