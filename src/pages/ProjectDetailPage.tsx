import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { ProjectTask } from '../types';
import { Card, PageHeader, BackButton, Select } from '../components';

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
        if (!newTask.title || !newTask.assignee) {
            alert('Title and Assignee are required.');
            return;
        }
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
        return <div className="p-8">Project not found.</div>;
    }

    const doneTasks = tasks.filter(t => t.status === 'Done').length;
    const progress = tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0;

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon="🚀" title={project.name} subtitle={project.description} />
            
            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-2">Project Progress</h2>
                <div className="flex items-center gap-4">
                    <div className="w-full bg-gray-200 rounded-full h-4">
                        <div className="bg-brand-primary h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="font-bold text-brand-primary">{Math.round(progress)}%</span>
                </div>
                <p className="text-sm text-brand-text-secondary mt-1">{doneTasks} of {tasks.length} tasks completed.</p>
            </Card>
            
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-brand-text-primary">Tasks</h2>
                    <button onClick={() => setShowTaskForm(!showTaskForm)} className="bg-brand-secondary hover:bg-brand-secondary-dark text-white font-bold py-2 px-4 rounded-lg">
                        {showTaskForm ? 'Cancel' : '+ Add Task'}
                    </button>
                </div>
                
                {showTaskForm && (
                     <form onSubmit={handleAddTask} className="p-4 bg-gray-50 rounded-lg mb-6 space-y-4">
                        <input type="text" placeholder="Task title" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" required />
                        <div className="grid grid-cols-2 gap-4">
                            <Select label="" value={newTask.assignee} onChange={e => setNewTask(p => ({ ...p, assignee: e.target.value }))}>
                                <option value="">Assign to...</option>
                                {data.team.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}
                            </Select>
                            <input type="text" placeholder="IT Ticket (optional)" value={newTask.itTicket} onChange={e => setNewTask(p => ({ ...p, itTicket: e.target.value }))} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="text-right">
                             <button type="submit" className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg">Add Task</button>
                        </div>
                     </form>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-brand-text-secondary">
                        <thead className="text-xs text-brand-text-primary uppercase bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">Task</th>
                                <th className="px-6 py-3">Assignee</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">IT Ticket</th>
                            </tr>
                        </thead>
                        <tbody>
                             {tasks.map(task => (
                                <tr key={task.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-brand-text-primary">{task.title}</td>
                                    <td className="px-6 py-4">{task.assignee}</td>
                                    <td className="px-6 py-4">
                                        <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value as ProjectTask['status'])} className="p-1 rounded-md border-gray-300">
                                            <option value="To Do">To Do</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Done">Done</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4">{task.itTicket || 'N/A'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
