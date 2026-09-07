import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Card, PageHeader, BackButton, Modal, SectionHeader } from '../components';
import {
  DEFAULT_STATUSES, PROJECT_COLORS, deriveKey, isDoneTask, nowIso, projIdAlloc, statusesOf,
} from '../services/projects';

export const ProjectsPage: React.FC = () => {
    const { data, setData, isAdmin } = useData();
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const projects = useMemo(() => {
        const rows = data.projects.map(p => {
            const tasks = data.projectTasks.filter(t => t.projectId === p.id && t.parentId == null);
            const statuses = statusesOf(data, p.id);
            const done = tasks.filter(t => isDoneTask(t, statuses)).length;
            return { p, total: tasks.length, done };
        });
        return {
            active: rows.filter(r => !r.p.archived),
            archived: rows.filter(r => r.p.archived),
        };
    }, [data]);

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        setData(prev => {
            const alloc = projIdAlloc(prev);
            const id = alloc();
            const key = deriveKey(newProjectName, prev.projects);
            const color = PROJECT_COLORS[prev.projects.length % PROJECT_COLORS.length];
            return {
                ...prev,
                projects: [...prev.projects, {
                    id, name: newProjectName.trim(), description: newProjectDesc.trim(),
                    key, color, createdAt: nowIso(),
                }],
                projStatuses: [
                    ...(prev.projStatuses || []),
                    ...DEFAULT_STATUSES.map((s, i) => ({
                        id: alloc(), projectId: id, name: s.name, color: s.color, order: i, isDone: s.isDone,
                    })),
                ],
            };
        });
        setIsCreating(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    const ProjectCard: React.FC<{ p: (typeof projects.active)[number] }> = ({ p: row }) => (
        <Link
            to={`/projects/${row.p.id}`}
            className="group flex flex-col gap-2 p-4 rounded-lg border border-efg-line hover:border-brand-secondary hover:shadow-card transition-all bg-white"
        >
            <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.p.color || '#64748b' }} />
                <h3 className="font-semibold text-brand-text-primary group-hover:text-brand-primary transition-colors truncate">{row.p.name}</h3>
                {row.p.key && <span className="text-[11px] font-medium text-brand-text-secondary bg-brand-bg-body rounded px-1.5 py-0.5">{row.p.key}</span>}
            </div>
            {row.p.description && (
                <p className="text-sm text-brand-text-secondary line-clamp-2">{row.p.description}</p>
            )}
            <div className="mt-auto pt-1">
                <div className="flex items-center justify-between text-[11px] text-brand-text-secondary mb-1">
                    <span>{row.total} task{row.total === 1 ? '' : 's'}</span>
                    <span>{row.total > 0 ? `${row.done}/${row.total} done` : '—'}</span>
                </div>
                <div className="h-1.5 rounded-full bg-brand-bg-body overflow-hidden">
                    <div className="h-full rounded-full bg-brand-secondary transition-all"
                        style={{ width: row.total > 0 ? `${(row.done / row.total) * 100}%` : 0 }} />
                </div>
            </div>
        </Link>
    );

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Projects" subtitle="Kanban boards, task lists, timelines and files for the team's regulatory projects" />

            <Card>
                <div className="flex justify-between items-center mb-6">
                    <SectionHeader title="All Projects" className="mb-0 pb-0 border-0 flex-1" />
                    {isAdmin && (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="flex items-center gap-2 text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors"
                        >
                            <span>+ New Project</span>
                        </button>
                    )}
                </div>
                <div className="border-t border-efg-line pt-4">
                    {projects.active.length === 0 ? (
                        <p className="text-sm text-brand-text-secondary py-6 text-center">No projects yet. Create one to get started.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {projects.active.map(row => <ProjectCard key={row.p.id} p={row} />)}
                        </div>
                    )}
                </div>

                {projects.archived.length > 0 && (
                    <div className="mt-6">
                        <button onClick={() => setShowArchived(v => !v)}
                            className="text-[12px] font-semibold text-brand-text-secondary hover:text-brand-text-primary">
                            {showArchived ? '▾' : '▸'} Archived ({projects.archived.length})
                        </button>
                        {showArchived && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 opacity-70">
                                {projects.archived.map(row => <ProjectCard key={row.p.id} p={row} />)}
                            </div>
                        )}
                    </div>
                )}
            </Card>

            <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="New Project">
                <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                        <label htmlFor="projectName" className="block text-sm font-medium text-brand-text-secondary mb-1">Project Name</label>
                        <input
                            id="projectName"
                            type="text"
                            value={newProjectName}
                            onChange={e => setNewProjectName(e.target.value)}
                            className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary"
                            required
                            placeholder="e.g. FINMA Basel IV Implementation"
                        />
                        {newProjectName.trim() && (
                            <p className="text-[11px] text-brand-text-secondary mt-1">
                                Key: <strong>{deriveKey(newProjectName, data.projects)}</strong> — tasks will be numbered {deriveKey(newProjectName, data.projects)}-1, -2…
                            </p>
                        )}
                    </div>
                    <div>
                        <label htmlFor="projectDesc" className="block text-sm font-medium text-brand-text-secondary mb-1">Description</label>
                        <textarea
                            id="projectDesc"
                            value={newProjectDesc}
                            onChange={e => setNewProjectDesc(e.target.value)}
                            className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary"
                            rows={3}
                            placeholder="Brief summary of the project scope…"
                        />
                    </div>
                    <p className="text-[11px] text-brand-text-secondary">
                        The project starts with the standard columns ({DEFAULT_STATUSES.map(s => s.name).join(' · ')}) — rename or add columns from the board.
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setIsCreating(false)} className="text-sm font-semibold text-brand-text-secondary bg-brand-bg-body hover:bg-efg-line py-2 px-4 rounded-md transition-colors">
                            Cancel
                        </button>
                        <button type="submit" className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
                            Create Project
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
