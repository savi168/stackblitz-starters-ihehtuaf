import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Card, PageHeader, InfoBox, DeadlineNotificationBanner } from '../components';

export const HubPage: React.FC = () => {
    const { data } = useData();
    const navigate = useNavigate();
    const [showBanner, setShowBanner] = useState(true);
    const textData = JSON.stringify(data, null, 2);

    const copyData = () => {
        navigator.clipboard.writeText(textData);
        alert('✅ Data copied to clipboard!');
    };
    
    const upcomingDeadlines = useMemo(() => {
        const today = new Date();
        const nextWeek = new Date();
        today.setHours(0, 0, 0, 0);
        nextWeek.setDate(today.getDate() + 7);

        return data.deadlines.filter(d => {
            const dueDate = new Date(d.dueDate + 'T00:00:00Z');
            return d.status !== 'completed' && dueDate >= today && dueDate <= nextWeek;
        });
    }, [data.deadlines]);

    const deadlinesCount = data.deadlines.length;

    // Fix: Explicitly type moduleCards to allow for optional link and alertMsg properties.
    const moduleCards: Array<{
        icon: string;
        title: string;
        desc: string;
        tag: string;
        link?: string;
        alertMsg?: string;
    }> = [
        { icon: '📅', title: 'Calendar & Deadlines', desc: 'Tracking of regulatory and internal deadlines, visual calendar.', tag: 'REGULATORY', link: '/deadlines' },
        { icon: '🔍', title: 'KPI Analysis', desc: 'Analysis, historical trends, and risk appetite in one place.', tag: 'ANALYSIS', link: '/details' },
        { icon: '🚀', title: 'Projects', desc: 'Track project tasks, assign owners, and monitor progress.', tag: 'COLLABORATION', link: '/projects' },
        { icon: '👥', title: 'Team Directory', desc: 'Contact information for the project team members.', tag: 'PEOPLE', link: '/team' },
        { icon: '⚙️', title: 'Data Management', desc: 'Add/modify deadlines, import/export CSV and JSON.', tag: 'ADMIN', link: '/datamanagement' },
    ];

    const StatCard: React.FC<{label: string, value: string | number}> = ({label, value}) => (
        <div className="bg-white p-5 rounded-xl border-l-4 border-brand-primary text-center shadow-sm">
            <div className="text-sm text-brand-text-secondary uppercase tracking-wider">{label}</div>
            <div className="text-3xl font-bold text-brand-text-primary mt-1">{value}</div>
        </div>
    );
    
    return (
        <div className="p-5 md:p-8">
            <PageHeader icon="📊" title="Regulatory Reporting Dashboard" subtitle="Multi-entity regulatory reporting control center" />
            
            {showBanner && upcomingDeadlines.length > 0 && (
                <DeadlineNotificationBanner
                    count={upcomingDeadlines.length}
                    onDismiss={() => setShowBanner(false)}
                />
            )}
            
            <InfoBox>
                <strong>💡 Modular Navigation:</strong> Each module is independent. Open them in separate tabs to work in parallel.
            </InfoBox>

            <Card className="mb-8">
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">📈 Quick Overview</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Entities Tracked" value={data.kpisHistory.length > 0 ? new Set(data.kpisHistory.map(k => k.entity)).size : 0} />
                    <StatCard label="Active Deadlines" value={deadlinesCount} />
                    <StatCard label="Projects" value={data.projects.length} />
                    <StatCard label="Team Members" value={data.team.length} />
                </div>
            </Card>

            <h2 className="text-2xl font-bold text-brand-text-primary mb-5">🗂️ Available Modules</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {moduleCards.map(m => {
                    const content = (
                        <>
                            <div className="text-4xl mb-3">{m.icon}</div>
                            <h3 className="text-xl font-bold text-brand-text-primary">{m.title}</h3>
                            <p className="text-sm text-brand-text-secondary my-2 h-16">{m.desc}</p>
                            <span className="inline-block bg-brand-secondary text-white text-xs font-semibold px-3 py-1 rounded-full mt-2">{m.tag}</span>
                        </>
                    );

                    if(m.link) {
                        return (
                             <Link to={m.link} key={m.title} className="block bg-white p-6 rounded-2xl shadow-lg border-l-4 border-brand-primary transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
                                {content}
                            </Link>
                        )
                    }
                    return (
                        <div key={m.title} onClick={() => m.alertMsg && alert(m.alertMsg)} className="bg-white p-6 rounded-2xl shadow-lg border-l-4 border-gray-300 transform transition-all duration-300 cursor-not-allowed opacity-60">
                            {content}
                        </div>
                    )
                })}
            </div>

            <Card>
                <h2 className="text-xl font-bold text-brand-text-primary mb-4 pb-2 border-b-2 border-brand-accent">💾 Centralized Database</h2>
                <p className="text-brand-text-secondary mb-4 text-sm">This is a read-only view of the application's central data. To edit, import, or export data, please go to the Data Management module.</p>
                <textarea value={textData} readOnly className="w-full h-64 p-3 font-mono text-xs bg-gray-50 border-2 border-gray-200 rounded-lg focus:border-brand-primary focus:ring-brand-primary"/>
                <div className="mt-4 space-x-2">
                    <button onClick={copyData} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors">📋 Copy Data</button>
                    <button onClick={() => navigate('/datamanagement')} className="bg-brand-secondary hover:bg-brand-secondary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors">⚙️ Manage Data</button>
                </div>
            </Card>
        </div>
    );
};