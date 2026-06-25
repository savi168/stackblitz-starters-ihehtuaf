import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Project } from '../types';
import { Card, PageHeader, BackButton, Modal, SectionHeader } from '../components';

export const ProjectsPage: React.FC = () => {
    const { data, setData } = useData();
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
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
            <PageHeader title="Projects" subtitle="Manage and track ongoing regulatory improvement projects" />

            <Card>
                <div className="flex justify-between items-center mb-6">
                    <SectionHeader title="All Projects" className="mb-0 pb-0 border-0 flex-1" />
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors"
                    >
                        <span>+ New Project</span>
                    </button>
                </div>
                <div className="border-t border-efg-line pt-4 space-y-2">
                    {data.projects.length === 0 ? (
                        <p className="text-sm text-brand-text-secondary py-6 text-center">No projects yet. Create one to get started.</p>
                    ) : data.projects.map(project => (
                        <Link
                            to={`/projects/${project.id}`}
                            key={project.id}
                            className="group flex items-center justify-between p-4 rounded-md hover:bg-brand-bg-body border border-transparent hover:border-efg-line transition-all"
                        >
                            <div>
                                <h3 className="font-semibold text-brand-text-primary group-hover:text-brand-primary transition-colors">{project.name}</h3>
                                {project.description && (
                                    <p className="text-sm text-brand-text-secondary mt-0.5">{project.description}</p>
                                )}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-brand-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    ))}
                </div>
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
