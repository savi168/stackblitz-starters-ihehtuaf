import { CentralData as AppData, Project, ProjectTask, ProjStatus, ProjActivity, ProjComment, TaskPriority } from '../types';

/**
 * Projects module helpers — feature set ported from the "Pilote" project
 * management tool (Kanban with per-project columns, subtasks, comments,
 * activity log, Gantt timeline), rebuilt on the RegReport data flow:
 * everything lives in AppData (relational SQL Server tables behind /api/data)
 * and actions are signed by the Windows-authenticated user.
 */

export const PRIORITIES: Array<{ value: TaskPriority; label: string; color: string; rank: number }> = [
  { value: 'URGENT', label: 'Urgent', color: '#dc2626', rank: 0 },
  { value: 'HIGH', label: 'High', color: '#ea580c', rank: 1 },
  { value: 'MEDIUM', label: 'Medium', color: '#0891b2', rank: 2 },
  { value: 'LOW', label: 'Low', color: '#64748b', rank: 3 },
];
export const priorityMeta = (value?: string) =>
  PRIORITIES.find(p => p.value === value) ?? PRIORITIES[2];

/** Columns created automatically with each new project. */
export const DEFAULT_STATUSES: Array<{ name: string; color: string; isDone?: boolean }> = [
  { name: 'To do', color: '#94a3b8' },
  { name: 'In progress', color: '#3b82f6' },
  { name: 'In review', color: '#a855f7' },
  { name: 'Done', color: '#22c55e', isDone: true },
];

export const PROJECT_COLORS = [
  '#0d5c63', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#64748b',
];

export const initials = (name: string): string =>
  name.split(/[\s.\\/_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

/** Stable pastel-ish color per person, derived from the name. */
export const personColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
};

/** Project key: 2–6 uppercase letters derived from the name (BASL, FINM…). */
export const deriveKey = (name: string, existing: Project[]): string => {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'PRJ';
  const taken = new Set(existing.map(p => p.key).filter(Boolean));
  let key = base, n = 1;
  while (taken.has(key)) key = `${base}${++n}`;
  return key;
};

export const projectKeyOf = (p: Project): string => p.key || deriveKey(p.name, []);

export const nowIso = () => new Date().toISOString();

/** Small sequential ids (backend columns are 32-bit ints — no Date.now() ids). */
export const projIdAlloc = (data: AppData): (() => number) => {
  let max = 0;
  for (const list of [data.projects, data.projectTasks, data.projStatuses || [],
    data.projComments || [], data.projActivities || []] as Array<Array<{ id: number }>>) {
    for (const x of list) if (x.id > max && x.id < 2_000_000_000) max = x.id;
  }
  return () => ++max;
};

const LEGACY_MAP: Record<string, string> = { 'to do': 'To do', 'in progress': 'In progress', 'done': 'Done' };

/**
 * Lazy migration: gives a project its Kanban columns if it predates them, and
 * stamps statusId / number / order on legacy tasks (mapped from the old
 * To Do / In Progress / Done field). Idempotent — returns the input unchanged
 * when there is nothing to do.
 */
export const ensureProjectSetup = (data: AppData, projectId: number): AppData => {
  const statuses = (data.projStatuses || []).filter(s => s.projectId === projectId);
  const tasks = data.projectTasks.filter(t => t.projectId === projectId);
  const needStatuses = statuses.length === 0;
  const needTasks = tasks.some(t => t.statusId === undefined || t.number === undefined);
  const project = data.projects.find(p => p.id === projectId);
  const needKey = project && !project.key;
  if (!needStatuses && !needTasks && !needKey) return data;

  const alloc = projIdAlloc(data);
  let next = { ...data };

  if (needKey && project) {
    next = {
      ...next,
      projects: next.projects.map(p => p.id === projectId
        ? { ...p, key: deriveKey(p.name, next.projects.filter(x => x.id !== projectId)) }
        : p),
    };
  }

  let cols = statuses;
  if (needStatuses) {
    cols = DEFAULT_STATUSES.map((s, i) => ({
      id: alloc(), projectId, name: s.name, color: s.color, order: i, isDone: s.isDone,
    }));
    next = { ...next, projStatuses: [...(next.projStatuses || []), ...cols] };
  }

  if (needTasks || needStatuses) {
    const byName = new Map(cols.map(c => [c.name.toLowerCase(), c]));
    const first = [...cols].sort((a, b) => a.order - b.order)[0];
    let number = Math.max(0, ...tasks.map(t => t.number || 0));
    const perCol = new Map<number, number>();
    next = {
      ...next,
      projectTasks: next.projectTasks.map(t => {
        if (t.projectId !== projectId) return t;
        if (t.statusId !== undefined && t.number !== undefined) return t;
        const col = t.statusId !== undefined
          ? cols.find(c => c.id === t.statusId) || first
          : byName.get((LEGACY_MAP[t.status?.toLowerCase() || ''] || t.status || '').toLowerCase()) || first;
        const order = t.order ?? (perCol.set(col.id, (perCol.get(col.id) ?? -1) + 1), perCol.get(col.id)!);
        return {
          ...t,
          statusId: col.id,
          number: t.number ?? ++number,
          order,
          priority: t.priority ?? 'MEDIUM',
        };
      }),
    };
  }
  return next;
};

export const statusesOf = (data: AppData, projectId: number): ProjStatus[] =>
  (data.projStatuses || []).filter(s => s.projectId === projectId).sort((a, b) => a.order - b.order);

export const isDoneTask = (t: ProjectTask, statuses: ProjStatus[]): boolean =>
  !!statuses.find(s => s.id === t.statusId)?.isDone || (t.statusId === undefined && t.status === 'Done');

/** Keeps the legacy tri-state field roughly in sync so old views/CSV stay meaningful. */
export const legacyStatusFor = (statusId: number | undefined, statuses: ProjStatus[]): 'To Do' | 'In Progress' | 'Done' => {
  const s = statuses.find(x => x.id === statusId);
  if (!s) return 'To Do';
  if (s.isDone) return 'Done';
  return s.order === 0 ? 'To Do' : 'In Progress';
};

export const makeActivity = (
  alloc: () => number, taskId: number, actor: string, type: string, from?: string, to?: string,
): ProjActivity => ({ id: alloc(), taskId, actor, type, from, to, createdAt: nowIso() });

export const makeComment = (
  alloc: () => number, taskId: number, author: string, body: string,
): ProjComment => ({ id: alloc(), taskId, author, body, createdAt: nowIso() });

/** Human wording of one activity entry ("moved to In review", "assigned to X"…). */
export const activityLabel = (a: ProjActivity): string => {
  switch (a.type) {
    case 'created': return 'created the task';
    case 'status': return `moved from ${a.from ?? '—'} to ${a.to ?? '—'}`;
    case 'assignee': return `assigned to ${a.to || 'nobody'}${a.from ? ` (was ${a.from})` : ''}`;
    case 'priority': return `set priority to ${a.to ?? '—'}`;
    case 'dates': return `changed ${a.from ?? 'dates'} → ${a.to ?? 'none'}`;
    case 'title': return `renamed from "${a.from ?? ''}"`;
    case 'description': return 'edited the description';
    case 'comment': return 'commented';
    case 'subtask': return `added subtask "${a.to ?? ''}"`;
    case 'detached': return `detached subtask "${a.to ?? ''}"`;
    case 'attachment': return `attached "${a.to ?? ''}"`;
    case 'attachment_removed': return `removed the file "${a.to ?? ''}"`;
    default: return a.type;
  }
};

export const fmtShortDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(d);
};

/** Days until due (negative = overdue), using end-of-day semantics. */
export const daysUntil = (dueDate: string): number => {
  const due = new Date(dueDate + 'T23:59:59');
  return Math.ceil((due.getTime() - Date.now()) / 86400000);
};
