import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { CentralData as AppData, ProjActivity, ProjStatus, ProjectTask, TaskPriority } from '../types';
import { Card, PageHeader, BackButton } from '../components';
import { DocumentsPanel } from './LibraryPage';
import {
  DocMeta, deleteDocument, downloadDocument, fmtSize, listDocuments, uploadDocument,
} from '../services/documents';
import {
  PRIORITIES, activityLabel, daysUntil, ensureProjectSetup, fmtShortDate, initials, isDoneTask,
  legacyStatusFor, makeActivity, makeComment, nowIso, personColor, priorityMeta, projIdAlloc,
  projectKeyOf, statusesOf,
} from '../services/projects';

/**
 * Project workspace, ported from the "Pilote" tool: Kanban board with
 * per-project columns and drag & drop, filterable list, Gantt timeline with
 * expandable subtasks, project files (document library), and a task panel
 * with subtasks, comments and a full activity log — every action signed by
 * the Windows-authenticated user.
 */

type View = 'board' | 'list' | 'timeline' | 'files';

// --- Small UI atoms ---------------------------------------------------------

const PriorityBadge: React.FC<{ priority?: string }> = ({ priority }) => {
  const meta = priorityMeta(priority);
  return (
    <span style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
      <span style={{ backgroundColor: meta.color }} className="w-1.5 h-1.5 rounded-full" />
      {meta.label}
    </span>
  );
};

/** Due-date chip: red when overdue, amber under 3 days (unless done). */
const DueBadge: React.FC<{ dueDate?: string; done?: boolean }> = ({ dueDate, done }) => {
  if (!dueDate) return null;
  const days = daysUntil(dueDate);
  let cls = 'bg-brand-bg-body text-brand-text-secondary';
  let prefix = '';
  if (!done) {
    if (days < 0) { cls = 'bg-status-red/10 text-status-red'; prefix = 'Overdue '; }
    else if (days <= 3) cls = 'bg-status-amber/15 text-status-amber';
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}
      title={days < 0 && !done ? `${Math.abs(days)} day(s) overdue` : `Due ${fmtShortDate(dueDate)}`}>
      {prefix}{fmtShortDate(dueDate)}
    </span>
  );
};

const Avatar: React.FC<{ name?: string; size?: number }> = ({ name, size = 24 }) => (
  name ? (
    <span title={name}
      style={{ width: size, height: size, backgroundColor: personColor(name), fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white">
      {initials(name)}
    </span>
  ) : (
    <span title="Unassigned" style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-brand-text-secondary">?</span>
  )
);

// --- Page -------------------------------------------------------------------

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const { data, setData, currentUser } = useData();
  const navigate = useNavigate();
  const actor = currentUser.name.split('\\').pop() || currentUser.name;

  const [view, setView] = useState<View>('board');
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);

  // Lazy migration: default columns + statusId/number on legacy tasks.
  useEffect(() => {
    setData(prev => ensureProjectSetup(prev, pid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const project = useMemo(() => data.projects.find(p => p.id === pid), [data.projects, pid]);
  const statuses = useMemo(() => statusesOf(data, pid), [data, pid]);
  const allTasks = useMemo(() => data.projectTasks.filter(t => t.projectId === pid), [data.projectTasks, pid]);
  const topTasks = useMemo(() => allTasks.filter(t => t.parentId === undefined), [allTasks]);
  const projectKey = project ? projectKeyOf(project) : 'PRJ';

  // Every mutation runs on a migrated snapshot, so handlers can rely on
  // statusId/number being present even before the effect above has flushed.
  const mutate = (fn: (prev: AppData, alloc: () => number) => AppData) =>
    setData(prev => {
      const migrated = ensureProjectSetup(prev, pid);
      return fn(migrated, projIdAlloc(migrated));
    });

  // ---- Task mutations (all signed + logged) --------------------------------

  const patchTask = (taskId: number, patch: Partial<ProjectTask>) =>
    mutate((prev, alloc) => {
      const before = prev.projectTasks.find(t => t.id === taskId);
      if (!before) return prev;
      const sts = statusesOf(prev, pid);
      const log: ProjActivity[] = [];
      const push = (type: string, from?: string, to?: string) =>
        log.push(makeActivity(alloc, taskId, actor, type, from, to));
      if (patch.title !== undefined && patch.title !== before.title) push('title', before.title, patch.title);
      if (patch.description !== undefined && (patch.description || '') !== (before.description || '')) push('description');
      if (patch.statusId !== undefined && patch.statusId !== before.statusId) {
        push('status', sts.find(s => s.id === before.statusId)?.name, sts.find(s => s.id === patch.statusId)?.name);
        patch = { ...patch, status: legacyStatusFor(patch.statusId, sts) };
      }
      if (patch.priority !== undefined && patch.priority !== (before.priority || 'MEDIUM'))
        push('priority', priorityMeta(before.priority).label, priorityMeta(patch.priority).label);
      if (patch.assignee !== undefined && patch.assignee !== before.assignee)
        push('assignee', before.assignee || undefined, patch.assignee || undefined);
      if (patch.startDate !== undefined && (patch.startDate || '') !== (before.startDate || ''))
        push('dates', `Start: ${before.startDate || 'none'}`, patch.startDate || 'none');
      if (patch.dueDate !== undefined && (patch.dueDate || '') !== (before.dueDate || ''))
        push('dates', `Due: ${before.dueDate || 'none'}`, patch.dueDate || 'none');
      if (log.length === 0 && Object.keys(patch).length > 0) {
        // No observable change — leave the state untouched.
        return prev;
      }
      return {
        ...prev,
        projectTasks: prev.projectTasks.map(t => t.id === taskId ? { ...t, ...patch, updatedAt: nowIso() } : t),
        projActivities: [...(prev.projActivities || []), ...log],
      };
    });

  /** Board drag & drop: move into a column, optionally before a given card. */
  const moveTask = (taskId: number, toStatusId: number, beforeTaskId?: number) =>
    mutate((prev, alloc) => {
      const task = prev.projectTasks.find(t => t.id === taskId);
      if (!task) return prev;
      const sts = statusesOf(prev, pid);
      const column = prev.projectTasks
        .filter(t => t.projectId === pid && t.parentId === undefined && t.statusId === toStatusId && t.id !== taskId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const at = beforeTaskId !== undefined ? column.findIndex(t => t.id === beforeTaskId) : -1;
      const ordered = at >= 0
        ? [...column.slice(0, at), task, ...column.slice(at)]
        : [...column, task];
      const orderOf = new Map(ordered.map((t, i) => [t.id, i]));
      const changed = task.statusId !== toStatusId;
      const log = changed
        ? [makeActivity(alloc, taskId, actor, 'status',
            sts.find(s => s.id === task.statusId)?.name, sts.find(s => s.id === toStatusId)?.name)]
        : [];
      return {
        ...prev,
        projectTasks: prev.projectTasks.map(t => {
          if (t.id === taskId) {
            return { ...t, statusId: toStatusId, status: legacyStatusFor(toStatusId, sts), order: orderOf.get(t.id) ?? 0, updatedAt: nowIso() };
          }
          return orderOf.has(t.id) ? { ...t, order: orderOf.get(t.id)! } : t;
        }),
        projActivities: [...(prev.projActivities || []), ...log],
      };
    });

  const addTask = (statusId: number, title: string, assignee = '') =>
    mutate((prev, alloc) => {
      const trimmed = title.trim();
      if (!trimmed) return prev;
      const sts = statusesOf(prev, pid);
      const id = alloc();
      const proj = prev.projectTasks.filter(t => t.projectId === pid);
      const inCol = proj.filter(t => t.statusId === statusId && t.parentId === undefined);
      return {
        ...prev,
        projectTasks: [...prev.projectTasks, {
          id, projectId: pid, title: trimmed, assignee,
          status: legacyStatusFor(statusId, sts), statusId,
          number: Math.max(0, ...proj.map(t => t.number || 0)) + 1,
          priority: 'MEDIUM' as TaskPriority,
          order: Math.max(-1, ...inCol.map(t => t.order ?? 0)) + 1,
          createdAt: nowIso(), updatedAt: nowIso(),
        }],
        projActivities: [...(prev.projActivities || []), makeActivity(alloc, id, actor, 'created')],
      };
    });

  /** A subtask is a task like any other — same column and dates as its parent
   * at creation, one level only. */
  const addSubtask = (parentId: number, title: string) =>
    mutate((prev, alloc) => {
      const trimmed = title.trim();
      const parent = prev.projectTasks.find(t => t.id === parentId);
      if (!trimmed || !parent || parent.parentId !== undefined) return prev;
      const id = alloc();
      const proj = prev.projectTasks.filter(t => t.projectId === pid);
      const siblings = proj.filter(t => t.parentId === parentId);
      return {
        ...prev,
        projectTasks: [...prev.projectTasks, {
          id, projectId: pid, title: trimmed, assignee: '',
          status: parent.status, statusId: parent.statusId, parentId,
          number: Math.max(0, ...proj.map(t => t.number || 0)) + 1,
          priority: 'MEDIUM' as TaskPriority,
          startDate: parent.startDate, dueDate: parent.dueDate,
          order: Math.max(-1, ...siblings.map(t => t.order ?? 0)) + 1,
          createdAt: nowIso(), updatedAt: nowIso(),
        }],
        projActivities: [...(prev.projActivities || []),
          makeActivity(alloc, id, actor, 'created'),
          makeActivity(alloc, parentId, actor, 'subtask', undefined, trimmed)],
      };
    });

  const detachSubtask = (taskId: number) =>
    mutate((prev, alloc) => {
      const task = prev.projectTasks.find(t => t.id === taskId);
      if (!task || task.parentId === undefined) return prev;
      const inCol = prev.projectTasks.filter(t =>
        t.projectId === pid && t.parentId === undefined && t.statusId === task.statusId);
      return {
        ...prev,
        projectTasks: prev.projectTasks.map(t => t.id === taskId
          ? { ...t, parentId: undefined, order: Math.max(-1, ...inCol.map(x => x.order ?? 0)) + 1 }
          : t),
        projActivities: [...(prev.projActivities || []),
          makeActivity(alloc, task.parentId, actor, 'detached', undefined, task.title)],
      };
    });

  /** Deleting a parent deletes its subtasks; comments and log go with them. */
  const deleteTask = (taskId: number) => {
    const task = allTasks.find(t => t.id === taskId);
    const subCount = allTasks.filter(t => t.parentId === taskId).length;
    if (!window.confirm(`Delete "${task?.title}"${subCount ? ` and its ${subCount} subtask(s)` : ''}?`)) return;
    setOpenTaskId(null);
    mutate(prev => {
      const ids = new Set([taskId, ...prev.projectTasks.filter(t => t.parentId === taskId).map(t => t.id)]);
      return {
        ...prev,
        projectTasks: prev.projectTasks.filter(t => !ids.has(t.id)),
        projComments: (prev.projComments || []).filter(c => !ids.has(c.taskId)),
        projActivities: (prev.projActivities || []).filter(a => !ids.has(a.taskId)),
      };
    });
  };

  const addComment = (taskId: number, body: string) =>
    mutate((prev, alloc) => body.trim() ? {
      ...prev,
      projComments: [...(prev.projComments || []), makeComment(alloc, taskId, actor, body.trim())],
      projActivities: [...(prev.projActivities || []), makeActivity(alloc, taskId, actor, 'comment')],
    } : prev);

  const deleteComment = (commentId: number) =>
    mutate(prev => ({ ...prev, projComments: (prev.projComments || []).filter(c => c.id !== commentId) }));

  /** Attachments live in the document library; only the add/remove trace goes
   * into the task's activity log. */
  const logAttachment = (taskId: number, type: 'attachment' | 'attachment_removed', name: string) =>
    mutate((prev, alloc) => ({
      ...prev,
      projActivities: [...(prev.projActivities || []), makeActivity(alloc, taskId, actor, type, undefined, name)],
    }));

  // ---- Column mutations ----------------------------------------------------

  const addColumn = () => {
    const name = window.prompt('New column name:');
    if (!name?.trim()) return;
    mutate((prev, alloc) => {
      const sts = statusesOf(prev, pid);
      if (sts.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
        window.alert('A column with that name already exists.');
        return prev;
      }
      return {
        ...prev,
        projStatuses: [...(prev.projStatuses || []), {
          id: alloc(), projectId: pid, name: name.trim(), color: '#94a3b8',
          order: Math.max(-1, ...sts.map(s => s.order)) + 1,
        }],
      };
    });
  };

  const renameColumn = (s: ProjStatus) => {
    const name = window.prompt('Column name:', s.name);
    if (!name?.trim() || name.trim() === s.name) return;
    mutate(prev => ({
      ...prev,
      projStatuses: (prev.projStatuses || []).map(x => x.id === s.id ? { ...x, name: name.trim() } : x),
    }));
  };

  /** Refuses to delete a non-empty column rather than cascading silently. */
  const deleteColumn = (s: ProjStatus) => {
    const count = topTasks.filter(t => t.statusId === s.id).length;
    if (count > 0) { window.alert(`Cannot delete: ${count} task(s) still in "${s.name}". Move them first.`); return; }
    if (!window.confirm(`Delete the empty column "${s.name}"?`)) return;
    mutate(prev => ({ ...prev, projStatuses: (prev.projStatuses || []).filter(x => x.id !== s.id) }));
  };

  const toggleColumnDone = (s: ProjStatus) =>
    mutate(prev => ({
      ...prev,
      projStatuses: (prev.projStatuses || []).map(x => x.id === s.id ? { ...x, isDone: !x.isDone } : x),
    }));

  // ---- Project mutations ---------------------------------------------------

  const editProject = () => {
    if (!project) return;
    const name = window.prompt('Project name:', project.name);
    if (name === null) return;
    const description = window.prompt('Description:', project.description) ?? project.description;
    if (!name.trim()) return;
    mutate(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === pid ? { ...p, name: name.trim(), description } : p),
    }));
  };

  const toggleArchive = () =>
    mutate(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === pid ? { ...p, archived: !p.archived } : p),
    }));

  const deleteProject = () => {
    if (!project) return;
    if (!window.confirm(`Delete the project "${project.name}" with its ${allTasks.length} task(s), comments and history? Files in the Library are kept.`)) return;
    mutate(prev => {
      const ids = new Set(prev.projectTasks.filter(t => t.projectId === pid).map(t => t.id));
      return {
        ...prev,
        projects: prev.projects.filter(p => p.id !== pid),
        projStatuses: (prev.projStatuses || []).filter(s => s.projectId !== pid),
        projectTasks: prev.projectTasks.filter(t => t.projectId !== pid),
        projComments: (prev.projComments || []).filter(c => !ids.has(c.taskId)),
        projActivities: (prev.projActivities || []).filter(a => !ids.has(a.taskId)),
      };
    });
    navigate('/projects');
  };

  if (!project) return <div className="p-8 text-brand-text-secondary">Project not found.</div>;

  const openTask = openTaskId !== null ? allTasks.find(t => t.id === openTaskId) || null : null;

  const VIEWS: Array<[View, string]> = [['board', 'Board'], ['list', 'List'], ['timeline', 'Timeline'], ['files', 'Files']];

  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full mt-1" style={{ backgroundColor: project.color || '#64748b' }} />
          <PageHeader title={`${project.name}${project.archived ? ' (archived)' : ''}`} subtitle={project.description} />
        </div>
        <div className="flex gap-2 text-[12px]">
          <button onClick={editProject} className="font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-3 rounded-md transition-colors">Edit</button>
          <button onClick={toggleArchive} className="font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-3 rounded-md transition-colors">{project.archived ? 'Unarchive' : 'Archive'}</button>
          <button onClick={deleteProject} className="font-semibold text-status-red/80 border border-status-red/40 hover:bg-status-red hover:text-white py-1.5 px-3 rounded-md transition-colors">Delete</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-efg-line mb-5 mt-2">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              view === v ? 'border-brand-primary text-brand-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'board' && (
        <BoardView statuses={statuses} tasks={allTasks} projectKey={projectKey}
          comments={data.projComments || []} team={data.team.map(m => m.name)}
          onOpen={setOpenTaskId} onMove={moveTask} onAdd={addTask}
          onAddColumn={addColumn} onRenameColumn={renameColumn} onDeleteColumn={deleteColumn}
          onToggleDone={toggleColumnDone} />
      )}
      {view === 'list' && (
        <ListView statuses={statuses} tasks={allTasks} projectKey={projectKey} onOpen={setOpenTaskId} />
      )}
      {view === 'timeline' && (
        <TimelineView statuses={statuses} tasks={allTasks} projectKey={projectKey} onOpen={setOpenTaskId} />
      )}
      {view === 'files' && (
        <Card>
          <p className="text-[11px] text-brand-text-secondary mb-3">
            Project documents, stored in the Library under <strong>Projects/{project.name}</strong> — they also appear in the Library page.
          </p>
          <DocumentsPanel folder={`Projects/${project.name}`} folderFilter />
        </Card>
      )}

      {openTask && (
        <TaskPanel
          task={openTask} statuses={statuses} projectKey={projectKey} projectName={project.name}
          parent={openTask.parentId !== undefined ? allTasks.find(t => t.id === openTask.parentId) || null : null}
          subtasks={allTasks.filter(t => t.parentId === openTask.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))}
          comments={(data.projComments || []).filter(c => c.taskId === openTask.id)}
          activities={(data.projActivities || []).filter(a => a.taskId === openTask.id)}
          team={data.team.map(m => m.name)} actor={actor}
          onClose={() => setOpenTaskId(null)} onOpen={setOpenTaskId}
          onPatch={patchTask} onDelete={deleteTask}
          onAddSubtask={addSubtask} onDetach={detachSubtask}
          onAddComment={addComment} onDeleteComment={deleteComment}
          onLogAttachment={logAttachment}
        />
      )}
    </div>
  );
};

// --- Board ------------------------------------------------------------------

const BoardView: React.FC<{
  statuses: ProjStatus[]; tasks: ProjectTask[]; projectKey: string;
  comments: Array<{ taskId: number }>; team: string[];
  onOpen: (id: number) => void;
  onMove: (taskId: number, toStatusId: number, beforeTaskId?: number) => void;
  onAdd: (statusId: number, title: string) => void;
  onAddColumn: () => void; onRenameColumn: (s: ProjStatus) => void; onDeleteColumn: (s: ProjStatus) => void;
  onToggleDone: (s: ProjStatus) => void;
}> = ({ statuses, tasks, projectKey, comments, onOpen, onMove, onAdd, onAddColumn, onRenameColumn, onDeleteColumn, onToggleDone }) => {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const top = tasks.filter(t => t.parentId === undefined);
  const columnTasks = (statusId: number) =>
    top.filter(t => t.statusId === statusId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const commentCount = (taskId: number) => comments.filter(c => c.taskId === taskId).length;
  const subStats = (taskId: number) => {
    const subs = tasks.filter(t => t.parentId === taskId);
    return { total: subs.length, done: subs.filter(s => isDoneTask(s, statuses)).length };
  };

  const dropOnColumn = (statusId: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverCol(null);
    if (dragId !== null) onMove(dragId, statusId);
    setDragId(null);
  };
  const dropOnCard = (statusId: number, beforeId: number) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setOverCol(null);
    if (dragId !== null && dragId !== beforeId) onMove(dragId, statusId, beforeId);
    setDragId(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start">
      {statuses.map(s => {
        const col = columnTasks(s.id);
        return (
          <section key={s.id} className="w-72 shrink-0">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span style={{ backgroundColor: s.color }} className="w-2.5 h-2.5 shrink-0 rounded-full" />
              <h2 className="text-sm font-semibold text-brand-text-primary">{s.name}</h2>
              <button onClick={() => onToggleDone(s)}
                title={s.isDone ? 'Tasks here count as done — click to unset' : 'Mark this column as "done" (progress counters, muted timeline bars)'}
                className={`text-[11px] ${s.isDone ? 'text-status-green' : 'text-brand-text-secondary/40 hover:text-brand-text-secondary'}`}>✓</button>
              <span className="rounded bg-brand-bg-body px-1.5 text-[11px] font-medium text-brand-text-secondary">{col.length}</span>
              <div className="flex-1" />
              <button onClick={() => onRenameColumn(s)} title="Rename column" className="text-brand-text-secondary hover:text-brand-text-primary text-[12px]">✎</button>
              <button onClick={() => onDeleteColumn(s)} title="Delete column (must be empty)" className="text-brand-text-secondary hover:text-status-red text-[12px]">✕</button>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setOverCol(s.id); }}
              onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverCol(c => c === s.id ? null : c); }}
              onDrop={dropOnColumn(s.id)}
              className={`flex min-h-[90px] flex-col gap-2 rounded-lg p-2 transition-colors border ${
                overCol === s.id ? 'bg-brand-secondary/10 border-brand-secondary/40' : 'bg-brand-bg-body/70 border-transparent'}`}
            >
              {col.map(t => {
                const subs = subStats(t.id);
                const nc = commentCount(t.id);
                return (
                  <article key={t.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => setDragId(t.id), 0); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={dropOnCard(s.id, t.id)}
                    className={`bg-white rounded-md border border-efg-line p-3 space-y-2 cursor-grab shadow-sm hover:shadow-card transition ${dragId === t.id ? 'opacity-40' : ''}`}
                  >
                    <button onClick={() => onOpen(t.id)}
                      className="block text-left text-sm leading-snug font-medium text-brand-text-primary hover:text-brand-primary w-full">
                      {t.title}
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={t.priority} />
                      <DueBadge dueDate={t.dueDate} done={isDoneTask(t, statuses)} />
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[11px] font-medium text-brand-text-secondary">{projectKey}-{t.number}</span>
                      {nc > 0 && <span className="text-[11px] text-brand-text-secondary" title={`${nc} comment(s)`}>💬 {nc}</span>}
                      {subs.total > 0 && <span className="text-[11px] text-brand-text-secondary" title={`${subs.done} of ${subs.total} subtask(s) done`}>☰ {subs.done}/{subs.total}</span>}
                      <div className="flex-1" />
                      <Avatar name={t.assignee || undefined} size={22} />
                    </div>
                  </article>
                );
              })}
              {col.length === 0 && <p className="px-2 py-4 text-center text-xs text-brand-text-secondary">Drop a task here</p>}
              {adding === s.id ? (
                <form onSubmit={e => { e.preventDefault(); onAdd(s.id, newTitle); setNewTitle(''); setAdding(null); }}
                  className="mt-1">
                  <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onBlur={() => { if (newTitle.trim()) onAdd(s.id, newTitle); setNewTitle(''); setAdding(null); }}
                    placeholder="Task title…"
                    className="w-full p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary" />
                </form>
              ) : (
                <button onClick={() => setAdding(s.id)}
                  className="mt-1 text-left text-[12px] font-semibold text-brand-text-secondary hover:text-brand-secondary px-2 py-1">
                  + Add task
                </button>
              )}
            </div>
          </section>
        );
      })}
      <button onClick={onAddColumn}
        className="w-56 shrink-0 rounded-lg border border-dashed border-gray-300 py-4 text-sm font-semibold text-brand-text-secondary hover:border-brand-secondary hover:text-brand-secondary transition-colors">
        + Add column
      </button>
    </div>
  );
};

// --- List -------------------------------------------------------------------

const ListView: React.FC<{
  statuses: ProjStatus[]; tasks: ProjectTask[]; projectKey: string; onOpen: (id: number) => void;
}> = ({ statuses, tasks, projectKey, onOpen }) => {
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAssignee, setFAssignee] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [sort, setSort] = useState<{ by: 'number' | 'title' | 'priority' | 'due'; dir: 1 | -1 }>({ by: 'number', dir: 1 });

  const top = tasks.filter(t => t.parentId === undefined);
  const assignees = Array.from(new Set(top.map(t => t.assignee).filter(Boolean))).sort();

  const rows = top
    .filter(t => !q || t.title.toLowerCase().includes(q.toLowerCase()) || `${projectKey}-${t.number}`.toLowerCase().includes(q.toLowerCase()))
    .filter(t => !fStatus || String(t.statusId) === fStatus)
    .filter(t => !fAssignee || t.assignee === fAssignee)
    .filter(t => !fPriority || (t.priority || 'MEDIUM') === fPriority)
    .sort((a, b) => {
      const d = sort.dir;
      switch (sort.by) {
        case 'title': return d * a.title.localeCompare(b.title);
        case 'priority': return d * (priorityMeta(a.priority).rank - priorityMeta(b.priority).rank);
        case 'due': return d * ((a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
        default: return d * ((a.number || 0) - (b.number || 0));
      }
    });

  const header = (label: string, by: typeof sort.by, right?: boolean) => (
    <th className={`py-2.5 px-3 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold cursor-pointer select-none ${right ? 'text-right' : 'text-left'}`}
      onClick={() => setSort(s => ({ by, dir: s.by === by ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.by === by ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks…"
          className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary w-56" />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white">
          <option value="">All columns</option>
          {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white">
          <option value="">Everyone</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fPriority} onChange={e => setFPriority(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white">
          <option value="">Any priority</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <span className="text-[11px] text-brand-text-secondary self-center ml-auto">{rows.length} task(s)</span>
      </div>
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-brand-bg-body">
            <tr>
              {header('#', 'number')}
              {header('Task', 'title')}
              <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Column</th>
              <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Assignee</th>
              {header('Priority', 'priority')}
              <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Start</th>
              {header('Due', 'due')}
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {rows.map(t => {
              const s = statuses.find(x => x.id === t.statusId);
              const subs = tasks.filter(x => x.parentId === t.id);
              const done = subs.filter(x => isDoneTask(x, statuses)).length;
              return (
                <tr key={t.id} className="hover:bg-brand-bg-body/60 cursor-pointer" onClick={() => onOpen(t.id)}>
                  <td className="py-2 px-3 text-[11px] text-brand-text-secondary">{projectKey}-{t.number}</td>
                  <td className="py-2 px-3 font-medium text-brand-text-primary max-w-md truncate">
                    {t.title}
                    {subs.length > 0 && <span className="ml-2 text-[11px] font-normal text-brand-text-secondary">{done}/{subs.length} subtask(s)</span>}
                  </td>
                  <td className="py-2 px-3">
                    {s && <span className="inline-flex items-center gap-1.5 text-[12px] text-brand-text-primary">
                      <span style={{ backgroundColor: s.color }} className="w-2 h-2 rounded-full" />{s.name}
                    </span>}
                  </td>
                  <td className="py-2 px-3"><span className="inline-flex items-center gap-1.5"><Avatar name={t.assignee || undefined} size={20} /><span className="text-[12px]">{t.assignee || '—'}</span></span></td>
                  <td className="py-2 px-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="py-2 px-3 text-[12px] text-brand-text-secondary">{fmtShortDate(t.startDate) || '—'}</td>
                  <td className="py-2 px-3"><DueBadge dueDate={t.dueDate} done={isDoneTask(t, statuses)} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-brand-text-secondary">No task matches the filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// --- Timeline (Gantt) -------------------------------------------------------

type Dated = ProjectTask & { start: Date; end: Date };

const toDated = (t: ProjectTask): Dated | null => {
  const rawStart = t.startDate || t.dueDate;
  const rawEnd = t.dueDate || t.startDate;
  if (!rawStart || !rawEnd) return null;
  let start = new Date(rawStart + 'T00:00:00');
  let end = new Date(rawEnd + 'T00:00:00');
  if (end < start) [start, end] = [end, start];
  return { ...t, start, end };
};
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

const ZOOMS = [
  { key: 'day', label: 'Day', width: 34 },
  { key: 'week', label: 'Week', width: 14 },
  { key: 'month', label: 'Month', width: 5 },
] as const;

const TimelineView: React.FC<{
  statuses: ProjStatus[]; tasks: ProjectTask[]; projectKey: string; onOpen: (id: number) => void;
}> = ({ statuses, tasks, projectKey, onOpen }) => {
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]['key']>('week');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const dayWidth = ZOOMS.find(z => z.key === zoom)!.width;

  const top = tasks.filter(t => t.parentId === undefined);
  const scheduled = useMemo(
    () => top.map(toDated).filter((t): t is Dated => t !== null).sort((a, b) => a.start.getTime() - b.start.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]);
  const subtasksOf = useMemo(() => {
    const map = new Map<number, Dated[]>();
    for (const parent of scheduled) {
      const subs = tasks.filter(t => t.parentId === parent.id)
        .map(toDated).filter((t): t is Dated => t !== null)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      if (subs.length > 0) map.set(parent.id, subs);
    }
    return map;
  }, [scheduled, tasks]);
  const undated = top.filter(t => !t.startDate && !t.dueDate).length;

  const range = useMemo(() => {
    const all = [...scheduled, ...Array.from(subtasksOf.values()).flat()];
    if (all.length === 0) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // The scale always includes today, so the red marker stays visible even
    // when every task is in the past or the future.
    const min = new Date(Math.min(today.getTime(), ...all.map(t => t.start.getTime())));
    const max = new Date(Math.max(today.getTime(), ...all.map(t => t.end.getTime())));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 3);
    return { from: min, days: dayDiff(min, max) + 1 };
  }, [scheduled, subtasksOf]);

  useEffect(() => {
    if (!range || !scroller.current) return;
    scroller.current.scrollLeft = Math.max(0, dayDiff(range.from, new Date()) * dayWidth - 220);
  }, [range, dayWidth]);

  if (!range) {
    return (
      <Card>
        <p className="text-sm text-brand-text-secondary py-8 text-center">
          No dated tasks — set a start or due date on a task to see it on the timeline.
        </p>
      </Card>
    );
  }

  const rows: Array<{ task: Dated; depth: number }> = [];
  for (const t of scheduled) {
    rows.push({ task: t, depth: 0 });
    if (expanded.has(t.id)) for (const sub of subtasksOf.get(t.id) || []) rows.push({ task: sub, depth: 1 });
  }

  const days = Array.from({ length: range.days }, (_, i) => {
    const d = new Date(range.from); d.setDate(d.getDate() + i); return d;
  });
  const months: Array<{ label: string; span: number }> = [];
  const MFMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
  for (const d of days) {
    const label = MFMT.format(d);
    const last = months[months.length - 1];
    if (last && last.label === label) last.span += 1;
    else months.push({ label, span: 1 });
  }
  const todayOffset = dayDiff(range.from, new Date()) * dayWidth + dayWidth / 2;
  const ROW_H = 34;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm text-brand-text-secondary">
          {scheduled.length} scheduled task(s){undated > 0 && `, ${undated} with no date`} — click a row to expand its subtasks
        </p>
        <div className="flex-1" />
        <div className="flex gap-1 rounded-lg bg-brand-bg-body p-1">
          {ZOOMS.map(z => (
            <button key={z.key} onClick={() => setZoom(z.key)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${
                zoom === z.key ? 'bg-white text-brand-text-primary shadow-sm' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}>
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex border border-efg-line rounded-lg overflow-hidden">
        <div className="w-64 shrink-0 border-r border-efg-line">
          <div className="h-12 border-b border-efg-line bg-brand-bg-body px-3 flex items-end pb-1.5 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Task</div>
          {rows.map(({ task, depth }) => {
            const hasSubs = subtasksOf.has(task.id);
            return (
              <div key={`${task.id}-${depth}`} style={{ height: ROW_H, paddingLeft: depth ? 26 : 8 }}
                className="flex items-center gap-1.5 border-b border-efg-line/60 pr-2 cursor-pointer hover:bg-brand-bg-body/60"
                onClick={() => hasSubs && depth === 0 ? setExpanded(prev => {
                  const next = new Set(prev); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next;
                }) : onOpen(task.id)}>
                {hasSubs && depth === 0 && <span className="text-[10px] text-brand-text-secondary">{expanded.has(task.id) ? '▾' : '▸'}</span>}
                <Avatar name={task.assignee || undefined} size={18} />
                <button className="truncate text-[12px] text-brand-text-primary hover:text-brand-primary text-left flex-1"
                  onClick={e => { e.stopPropagation(); onOpen(task.id); }}>
                  <span className="text-brand-text-secondary mr-1">{projectKey}-{task.number}</span>{task.title}
                </button>
              </div>
            );
          })}
        </div>
        <div ref={scroller} className="overflow-x-auto flex-1">
          <div style={{ width: range.days * dayWidth }} className="relative">
            <div className="h-12 border-b border-efg-line bg-brand-bg-body sticky top-0">
              <div className="flex h-6 text-[10px] font-semibold text-brand-text-secondary">
                {months.map((m, i) => (
                  <div key={i} style={{ width: m.span * dayWidth }} className="border-r border-efg-line/60 px-1.5 truncate leading-6">{m.label}</div>
                ))}
              </div>
              {zoom !== 'month' && (
                <div className="flex h-6 text-[9px] text-brand-text-secondary">
                  {days.map((d, i) => (
                    <div key={i} style={{ width: dayWidth }}
                      className={`border-r border-efg-line/40 text-center leading-6 ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-efg-line/30' : ''}`}>
                      {zoom === 'day' ? d.getDate() : (d.getDay() === 1 ? d.getDate() : '')}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* today marker */}
            <div className="absolute top-0 bottom-0 w-px bg-status-red z-10" style={{ left: todayOffset }} title="Today" />
            {rows.map(({ task, depth }) => {
              const s = statuses.find(x => x.id === task.statusId);
              const left = dayDiff(range.from, task.start) * dayWidth;
              const width = Math.max(dayWidth, (dayDiff(task.start, task.end) + 1) * dayWidth);
              const done = isDoneTask(task, statuses);
              return (
                <div key={`${task.id}-${depth}`} style={{ height: ROW_H }} className="relative border-b border-efg-line/60">
                  <button
                    onClick={() => onOpen(task.id)}
                    title={`${task.title} — ${fmtShortDate(task.startDate || task.dueDate)} → ${fmtShortDate(task.dueDate || task.startDate)}`}
                    style={{ left, width, backgroundColor: s?.color || '#94a3b8', height: depth ? 8 : 14, opacity: done ? 0.45 : 0.9 }}
                    className="absolute top-1/2 -translate-y-1/2 rounded-full hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

// --- Task panel -------------------------------------------------------------

const TaskPanel: React.FC<{
  task: ProjectTask; statuses: ProjStatus[]; projectKey: string; projectName: string;
  parent: ProjectTask | null;
  subtasks: ProjectTask[]; comments: Array<{ id: number; taskId: number; author: string; body: string; createdAt: string }>;
  activities: ProjActivity[]; team: string[]; actor: string;
  onClose: () => void; onOpen: (id: number) => void;
  onPatch: (id: number, patch: Partial<ProjectTask>) => void;
  onDelete: (id: number) => void;
  onAddSubtask: (parentId: number, title: string) => void;
  onDetach: (id: number) => void;
  onAddComment: (taskId: number, body: string) => void;
  onDeleteComment: (id: number) => void;
  onLogAttachment: (taskId: number, type: 'attachment' | 'attachment_removed', name: string) => void;
}> = ({ task, statuses, projectKey, projectName, parent, subtasks, comments, activities, team, actor,
  onClose, onOpen, onPatch, onDelete, onAddSubtask, onDetach, onAddComment, onDeleteComment, onLogAttachment }) => {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || '');
  const [newSub, setNewSub] = useState('');
  const [newComment, setNewComment] = useState('');
  const [showLog, setShowLog] = useState(false);
  useEffect(() => { setTitle(task.title); setDesc(task.description || ''); }, [task.id, task.title, task.description]);

  const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-brand-text-secondary mb-0.5">{label}</label>
      {node}
    </div>
  );
  const inputCls = 'w-full p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-efg-line px-5 py-3 flex items-center gap-3 z-10">
          {parent ? (
            <button onClick={() => onOpen(parent.id)} title={`Back to ${projectKey}-${parent.number}`}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-secondary hover:text-brand-primary min-w-0">
              <span>‹</span>
              <span className="truncate max-w-[180px]">{projectKey}-{parent.number} {parent.title}</span>
            </button>
          ) : (
            <span className="text-[12px] font-semibold text-brand-text-secondary">{projectKey}-{task.number}</span>
          )}
          {task.parentId !== undefined && <span className="text-[10px] uppercase tracking-wider bg-brand-bg-body rounded px-1.5 py-0.5 text-brand-text-secondary shrink-0">subtask · {projectKey}-{task.number}</span>}
          <div className="flex-1" />
          <button onClick={() => onDelete(task.id)} className="text-[12px] font-semibold text-status-red/70 hover:text-status-red">Delete</button>
          <button onClick={onClose} className="text-brand-text-secondary hover:text-brand-text-primary text-lg leading-none px-1">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <input value={title} onChange={e => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && onPatch(task.id, { title: title.trim() })}
            className="w-full text-lg font-semibold text-brand-text-primary border-b border-transparent hover:border-gray-200 focus:border-brand-primary outline-none bg-transparent pb-1" />

          <div className="grid grid-cols-2 gap-3">
            {field('Column', (
              <select value={task.statusId ?? ''} onChange={e => onPatch(task.id, { statusId: Number(e.target.value) })} className={inputCls}>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ))}
            {field('Priority', (
              <select value={task.priority || 'MEDIUM'} onChange={e => onPatch(task.id, { priority: e.target.value as TaskPriority })} className={inputCls}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            ))}
            {field('Assignee', (
              <select value={task.assignee} onChange={e => onPatch(task.id, { assignee: e.target.value })} className={inputCls}>
                <option value="">Unassigned</option>
                {team.map(m => <option key={m} value={m}>{m}</option>)}
                {task.assignee && !team.includes(task.assignee) && <option value={task.assignee}>{task.assignee}</option>}
              </select>
            ))}
            {field('IT ticket', (
              <input value={task.itTicket || ''} onChange={e => onPatch(task.id, { itTicket: e.target.value })}
                placeholder="e.g. SNOW-1234" className={inputCls} />
            ))}
            {field('Start date', (
              <input type="date" value={task.startDate || ''} onChange={e => onPatch(task.id, { startDate: e.target.value || undefined })} className={inputCls} />
            ))}
            {field('Due date', (
              <input type="date" value={task.dueDate || ''} onChange={e => onPatch(task.id, { dueDate: e.target.value || undefined })} className={inputCls} />
            ))}
          </div>

          {field('Description', (
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              onBlur={() => (desc || '') !== (task.description || '') && onPatch(task.id, { description: desc || undefined })}
              rows={4} placeholder="Add a description…" className={inputCls} />
          ))}

          {task.parentId === undefined && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-brand-text-secondary mb-1.5">
                Subtasks {subtasks.length > 0 && `— ${subtasks.filter(s => isDoneTask(s, statuses)).length}/${subtasks.length} done`}
              </p>
              <div className="space-y-1">
                {subtasks.map(s => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md border border-efg-line px-2.5 py-1.5">
                    <span style={{ backgroundColor: statuses.find(x => x.id === s.statusId)?.color || '#94a3b8' }} className="w-2 h-2 rounded-full shrink-0" />
                    <button onClick={() => onOpen(s.id)} className={`text-sm text-left flex-1 truncate hover:text-brand-primary ${isDoneTask(s, statuses) ? 'line-through text-brand-text-secondary' : 'text-brand-text-primary'}`}>
                      {s.title}
                    </button>
                    <Avatar name={s.assignee || undefined} size={18} />
                    <button onClick={() => onDetach(s.id)} title="Detach — becomes a standalone task"
                      className="text-brand-text-secondary hover:text-brand-text-primary text-[12px]">↗</button>
                  </div>
                ))}
              </div>
              <form onSubmit={e => { e.preventDefault(); if (newSub.trim()) { onAddSubtask(task.id, newSub); setNewSub(''); } }} className="mt-1.5">
                <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="+ Add a subtask (inherits column & dates)…"
                  className="w-full p-2 border border-dashed border-gray-300 rounded-md text-sm bg-transparent focus:border-brand-primary" />
              </form>
            </div>
          )}

          <TaskFiles
            folder={`Projects/${projectName}/${projectKey}-${task.number}`}
            onLog={(type, name) => onLogAttachment(task.id, type, name)}
          />

          <div>
            <p className="text-[10px] uppercase tracking-wider text-brand-text-secondary mb-1.5">Comments ({comments.length})</p>
            <div className="space-y-2.5">
              {[...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.author} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-brand-text-secondary">
                      <span className="font-semibold text-brand-text-primary">{c.author}</span> · {fmtWhen(c.createdAt)}
                      {c.author === actor && (
                        <button onClick={() => onDeleteComment(c.id)} className="ml-2 text-status-red/60 hover:text-status-red">delete</button>
                      )}
                    </p>
                    <p className="text-sm text-brand-text-primary whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); if (newComment.trim()) { onAddComment(task.id, newComment); setNewComment(''); } }} className="mt-2 flex gap-2">
              <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={`Comment as ${actor}…`} className={inputCls} />
              <button type="submit" className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-3 rounded-md transition-colors shrink-0">Send</button>
            </form>
          </div>

          <div>
            <button onClick={() => setShowLog(v => !v)} className="text-[12px] font-semibold text-brand-text-secondary hover:text-brand-text-primary">
              {showLog ? '▾' : '▸'} Activity ({activities.length})
            </button>
            {showLog && (
              <ul className="mt-2 space-y-1.5 border-l-2 border-efg-line pl-3">
                {[...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(a => (
                  <li key={a.id} className="text-[12px] text-brand-text-secondary">
                    <span className="font-semibold text-brand-text-primary">{a.actor || '—'}</span> {activityLabel(a)}
                    <span className="text-brand-text-secondary/70"> · {fmtWhen(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-brand-text-secondary border-t border-efg-line pt-3">
            Created {task.createdAt ? fmtWhen(task.createdAt) : '—'}{task.updatedAt ? ` · updated ${fmtWhen(task.updatedAt)}` : ''}
          </p>
        </div>
      </aside>
    </>
  );
};

// --- Task attachments -------------------------------------------------------

/**
 * Files attached to one task (or subtask), stored in the document library
 * under Projects/<project>/<KEY-n> — they also show up in the Library page
 * and in the project's Files tab, with uploader and timestamp as the audit
 * trail; adds/removals are traced in the task's activity log. Re-uploading a
 * changed file adds a new entry next to the old one (both stay downloadable),
 * so delete the outdated one only when it should really disappear.
 */
const TaskFiles: React.FC<{
  folder: string;
  onLog: (type: 'attachment' | 'attachment_removed', name: string) => void;
}> = ({ folder, onLog }) => {
  const { mode, apiBaseUrl, isAdmin } = useData();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = React.useCallback(() => {
    if (mode !== 'api') return;
    listDocuments(apiBaseUrl!)
      .then(all => setDocs(all.filter(d => d.folder === folder)))
      .catch(e => setError(String((e as Error).message || e)));
  }, [mode, apiBaseUrl, folder]);
  useEffect(() => { refresh(); }, [refresh]);

  if (mode !== 'api') {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-brand-text-secondary mb-1.5">Attachments</p>
        <p className="text-[12px] text-brand-text-secondary">Connect the API backend to attach files (stored in the database, docs/SQL_DOCUMENTS.sql).</p>
      </div>
    );
  }

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      await uploadDocument(apiBaseUrl!, f, { folder });
      onLog('attachment', f.name);
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  const onDelete = async (d: DocMeta) => {
    if (!window.confirm(`Delete "${d.fileName}"?`)) return;
    try {
      await deleteDocument(apiBaseUrl!, d.id);
      onLog('attachment_removed', d.fileName);
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
  };

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-brand-text-secondary mb-1.5">Attachments ({docs.length})</p>
      {error && <p className="text-[11px] text-status-red mb-1.5">{error}</p>}
      <div className="space-y-1">
        {docs
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
          .map(d => (
            <div key={d.id} className="flex items-center gap-2 rounded-md border border-efg-line px-2.5 py-1.5">
              <button
                onClick={() => downloadDocument(apiBaseUrl!, d).catch(e => setError(String((e as Error).message || e)))}
                className="text-sm text-brand-secondary hover:text-brand-primary underline text-left truncate flex-1"
                title={`Download ${d.fileName}`}>
                {d.fileName}
              </button>
              <span className="text-[11px] text-brand-text-secondary whitespace-nowrap">{fmtSize(d.sizeBytes)}</span>
              <span className="text-[11px] text-brand-text-secondary whitespace-nowrap hidden sm:inline"
                title={`Uploaded by ${d.uploadedBy} on ${d.uploadedAt}`}>
                {d.uploadedBy.split('\\').pop()} · {d.uploadedAt.slice(0, 10)}
              </span>
              {isAdmin && (
                <button onClick={() => onDelete(d)} title="Delete file"
                  className="text-status-red/60 hover:text-status-red text-[12px]">✕</button>
              )}
            </div>
          ))}
      </div>
      {isAdmin && (
        <label className={`mt-1.5 flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-2.5 py-2 text-[12px] text-brand-text-secondary cursor-pointer hover:border-brand-secondary hover:text-brand-secondary transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <input type="file" className="hidden" disabled={busy}
            onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
          {busy ? 'Uploading…' : '+ Attach a file (stored in the database — modified versions add a new entry)'}
        </label>
      )}
      <p className="text-[10px] text-brand-text-secondary mt-1">
        Also visible in Library → {folder}
      </p>
    </div>
  );
};
