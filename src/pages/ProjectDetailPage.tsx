import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { ProjectTask } from '../types';
import { Card, PageHeader, BackButton, Select, SectionHeader } from '../components';

export const ProjectDetailPage: React.FC = () => {
    const { projectId } = useParams<{ projectId: string }>();
    const { data, setData } = useData();
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', assignee: '', itTicket: '' });

    const project = useMemo(() => data.projects.find(p => p.id === Number(projectId)), [data.projects, projectId]);
    const tasks = useMemo(() => data.projectTasks.filter(t => t.projectId === Number(projectId)), [data.projectTasks, projectId]);

    const handleStatusChange = (taskId: number, newStatus: ProjectTask['status']) => {
        setData(prev => ({
            ...prev,
            projectTasks: prev.projectTasks.map(task =>
                task.id === taskId ? { ...task, status: newStatus } : task
            )
        }));
    };

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.title || !newTask.assignee) return;
        setData(prev => {
            const taskToAdd: ProjectTask = {
                id: Date.now(),
                projectId: Number(projectId),
                title: newTask.title,
                assignee: newTask.assignee,
                itTicket: newTask.itTicket,
                status: 'To Do'
            };
            return { ...prev, projectTasks: [...prev.projectTasks, taskToAdd] };
        });
        setShowTaskForm(false);
        setNewTask({ title: '', assignee: '', itTicket: '' });
    };

    if (!project) {
        return <div className="p-8 text-brand-text-secondary">Project not found.</div>;
    }

    const doneTasks = tasks.filter(t => t.status === 'Done').length;
    const progress = tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0;

    const statusBadge = (status: ProjectTask['status']) => {
        const map: Record<ProjectTask['status'], string> = {
            'Done': 'bg-green-50 text-green-700 border-green-200',
            'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
            'To Do': 'bg-gray-50 text-gray-600 border-gray-200',
        };
        return map[status] || map['To Do'];
    };

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title={project.name} subtitle={project.description} />

            <Card className="mb-6">
                <SectionHeader title="Project Progress" suffix={`${doneTasks} of ${tasks.length} tasks complete`} />
                <div className="flex items-center gap-4">
                    <div className="flex-1 bg-efg-line rounded-full h-2">
                        <div
                            className="bg-brand-primary h-2 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <span className="text-sm font-semibold text-brand-primary w-10 text-right">{Math.round(progress)}%</span>
                </div>
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-6">
                    <SectionHeader title="Tasks" className="mb-0 pb-0 border-0 flex-1" />
                    <button
                        onClick={() => setShowTaskForm(!showTaskForm)}
                        className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors"
                    >
                        {showTaskForm ? 'Cancel' : '+ Add Task'}
                    </button>
                </div>

                {showTaskForm && (
                    <form onSubmit={handleAddTask} className="p-4 bg-brand-bg-body rounded-md mb-6 space-y-3 border border-efg-line">
                        <input
                            type="text"
                            placeholder="Task title"
                            value={newTask.title}
                            onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                            className="block w-full p-2.5 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary"
                            required
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <Select label="" value={newTask.assignee} onChange={e => setNewTask(p => ({ ...p, assignee: e.target.value }))}>
                                <option value="">Assign to…</option>
                                {data.team.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}
                            </Select>
                            <input
                                type="text"
                                placeholder="IT Ticket (optional)"
                                value={newTask.itTicket}
                                onChange={e => setNewTask(p => ({ ...p, itTicket: e.target.value }))}
                                className="block w-full p-2.5 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary"
                            />
                        </div>
                        <div className="text-right">
                            <button type="submit" className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
                                Add Task
                            </button>
                        </div>
                    </form>
                )}

                <div className="border-t border-efg-line">
                    {tasks.length === 0 ? (
                        <p className="text-sm text-brand-text-secondary py-6 text-center">No tasks yet. Add one above.</p>
                    ) : (
                        <table className="w-full text-sm text-left text-brand-text-secondary">
                            <thead>
                                <tr className="border-b border-efg-line">
                                    <th className="py-3 text-xs uppercase tracking-widest text-brand-text-secondary font-medium">Task</th>
                                    <th className="py-3 text-xs uppercase tracking-widest text-brand-text-secondary font-medium">Assignee</th>
                                    <th className="py-3 text-xs uppercase tracking-widest text-brand-text-secondary font-medium">Status</th>
                                    <th className="py-3 text-xs uppercase tracking-widest text-brand-text-secondary font-medium">IT Ticket</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.map(task => (
                                    <tr key={task.id} className="border-b border-efg-line last:border-0 hover:bg-brand-bg-body transition-colors">
                                        <td className="py-3 pr-4 font-medium text-brand-text-primary">{task.title}</td>
                                        <td className="py-3 pr-4">{task.assignee}</td>
                                        <td className="py-3 pr-4">
                                            <select
                                                value={task.status}
                                                onChange={e => handleStatusChange(task.id, e.target.value as ProjectTask['status'])}
                                                className={`text-xs font-semibold px-2 py-1 rounded border ${statusBadge(task.status)} cursor-pointer`}
                                            >
                                                <option value="To Do">To Do</option>
                                                <option value="In Progress">In Progress</option>
                                                <option value="Done">Done</option>
                                            </select>
                                        </td>
                                        <td className="py-3 text-brand-text-secondary">{task.itTicket || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
};
