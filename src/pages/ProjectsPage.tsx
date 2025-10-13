import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Project } from '../types';
import { Card, PageHeader, BackButton, Modal } from '../components';

export const ProjectsPage: React.FC = () => {
    const { data, setData } = useData();
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) {
            alert("Project name cannot be empty.");
            return;
        }
        setData(prev => {
            const newProject: Project = { 
                id: Date.now(), 
                name: newProjectName, 
                description: newProjectDesc 
            };
            return { ...prev, projects: [...prev.projects, newProject] };
        });
        setIsCreating(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon="🚀" title="Projects" subtitle="Manage and track your ongoing projects" />

            <Card className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-brand-text-primary">All Projects</h2>
                    <button onClick={() => setIsCreating(true)} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        + Create New Project
                    </button>
                </div>

                <div className="space-y-4">
                    {data.projects.map(project => (
                        <Link to={`/projects/${project.id}`} key={project.id} className="block p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border">
                            <h3 className="font-bold text-brand-text-primary">{project.name}</h3>
                            <p className="text-sm text-brand-text-secondary">{project.description}</p>
                        </Link>
                    ))}
                </div>
            </Card>

            <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Create New Project">
                <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                        <label htmlFor="projectName" className="block text-sm font-medium text-brand-text-secondary mb-1">Project Name</label>
                        <input id="projectName" type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" required />
                    </div>
                    <div>
                        <label htmlFor="projectDesc" className="block text-sm font-medium text-brand-text-secondary mb-1">Description</label>
                        <textarea id="projectDesc" value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" rows={3}></textarea>
                    </div>
                    <div className="flex justify-end gap-4">
                        <button type="button" onClick={() => setIsCreating(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                        <button type="submit" className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg">Create</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
