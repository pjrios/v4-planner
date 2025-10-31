import Dexie, { Table } from 'dexie';
import type {
  ActivityTemplate,
  BackupPayload,
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

export class AgendaPlannerDB extends Dexie {
  trimesters!: Table<Trimester, string>;
  holidays!: Table<Holiday, string>;
  levels!: Table<Level, string>;
  groups!: Table<Group, string>;
  schedules!: Table<Schedule, string>;
  topics!: Table<Topic, string>;
  lessons!: Table<Lesson, string>;
  rubrics!: Table<Rubric, string>;
  resources!: Table<Resource, string>;
  templates!: Table<ActivityTemplate, string>;

  constructor() {
    super('agenda_planner');

    this.version(1).stores({
      trimesters: 'id,startDate,endDate,status',
      holidays: 'id,startDate,endDate,[startDate+endDate]',
      levels: 'id,gradeNumber,subject',
      groups: 'id,levelId,displayName',
      schedules: 'id,groupId,trimesterId',
      topics: 'id,trimesterId,*levelIds,name',
      lessons: 'id,groupId,trimesterId,topicId,date,status,[groupId+date]',
      rubrics: 'id,attachedTo,attachedId',
      resources: 'id,attachedTo,attachedId',
      templates: 'id,phase,name',
    });
  }
}

export const db = new AgendaPlannerDB();

export type CollectionName =
  | 'trimesters'
  | 'holidays'
  | 'levels'
  | 'groups'
  | 'schedules'
  | 'topics'
  | 'lessons'
  | 'rubrics'
  | 'resources'
  | 'templates';

type CollectionEntityMap = {
  trimesters: Trimester;
  holidays: Holiday;
  levels: Level;
  groups: Group;
  schedules: Schedule;
  topics: Topic;
  lessons: Lesson;
  rubrics: Rubric;
  resources: Resource;
  templates: ActivityTemplate;
};

const tables: { [K in CollectionName]: Table<CollectionEntityMap[K], string> } = {
  trimesters: db.trimesters,
  holidays: db.holidays,
  levels: db.levels,
  groups: db.groups,
  schedules: db.schedules,
  topics: db.topics,
  lessons: db.lessons,
  rubrics: db.rubrics,
  resources: db.resources,
  templates: db.templates,
};

function getTable<K extends CollectionName>(collection: K) {
  return tables[collection];
}

export const DataStore = {
  async save<K extends CollectionName>(collection: K, entity: CollectionEntityMap[K]) {
    await getTable(collection).put(entity);
  },
  async bulkSave<K extends CollectionName>(collection: K, entities: CollectionEntityMap[K][]) {
    if (!entities.length) return;
    await getTable(collection).bulkPut(entities);
  },
  async get<K extends CollectionName>(collection: K, id: string) {
    return getTable(collection).get(id);
  },
  async getAll<K extends CollectionName>(collection: K) {
    return getTable(collection).toArray();
  },
  async update<K extends CollectionName>(collection: K, id: string, updates: Partial<CollectionEntityMap[K]>) {
    const table = getTable(collection);
    const current = await table.get(id);
    if (!current) {
      throw new Error(`Cannot update missing ${collection} record with id "${id}"`);
    }
    await table.put({ ...current, ...updates });
  },
  async remove<K extends CollectionName>(collection: K, id: string) {
    await getTable(collection).delete(id);
  },
  async clear<K extends CollectionName>(collection: K) {
    await getTable(collection).clear();
  },
  async exportBackup() {
    const dump: Record<CollectionName, unknown[]> = {
      trimesters: await db.trimesters.toArray(),
      holidays: await db.holidays.toArray(),
      levels: await db.levels.toArray(),
      groups: await db.groups.toArray(),
      schedules: await db.schedules.toArray(),
      topics: await db.topics.toArray(),
      lessons: await db.lessons.toArray(),
      rubrics: await db.rubrics.toArray(),
      resources: await db.resources.toArray(),
      templates: await db.templates.toArray(),
    };

    const payload: BackupPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: dump,
    };

    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  },
  async importBackup(input: string | Blob) {
    const json = typeof input === 'string' ? input : await input.text();
    const parsed: BackupPayload = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object' || !parsed.data) {
      throw new Error('Invalid backup payload');
    }

    const collectionNames: CollectionName[] = [
      'trimesters',
      'holidays',
      'levels',
      'groups',
      'schedules',
      'topics',
      'lessons',
      'rubrics',
      'resources',
      'templates',
    ];

    const tablesInTransaction = collectionNames.map((name) => getTable(name));
    const dataset = parsed.data as Partial<
      Record<CollectionName, CollectionEntityMap[CollectionName][]>
    >;

    const restoreCollection = async <K extends CollectionName>(collection: K) => {
      const table = getTable(collection);
      const rows = Array.isArray(dataset[collection])
        ? (dataset[collection] as CollectionEntityMap[K][])
        : [];

      await table.clear();
      if (rows.length > 0) {
        await table.bulkPut(rows);
      }
    };

    await db.transaction('rw', tablesInTransaction, async () => {
      for (const name of collectionNames) {
        await restoreCollection(name);
      }
    });
  },
};

export type { CollectionEntityMap };
