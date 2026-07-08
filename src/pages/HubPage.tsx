import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Card, PageHeader, InfoBox, DeadlineNotificationBanner, SectionHeader } from '../components';

export const HubPage: React.FC = () => {
    const { data, isAdmin } = useData();
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

    const moduleCards: Array<{
        title: string;
        desc: string;
        tag: string;
        link?: string;
        alertMsg?: string;
        adminOnly?: boolean;
    }> = [
        { title: 'Calendar & Deadlines', desc: 'Tracking of regulatory and internal deadlines, visual calendar.', tag: 'Regulatory', link: '/deadlines' },
        { title: 'Management Report', desc: 'Capital adequacy, LCR & NSFR pack: bridges between any periods, monthly detail, projections.', tag: 'Reporting', link: '/report' },
        { title: 'KPI Analysis', desc: 'Analysis, historical trends, and risk appetite in one place.', tag: 'Analysis', link: '/details' },
        { title: 'Capital & Liquidity Workbench', desc: 'Import FINMA/SNB Excel returns (CASABIS, LCR_G, NSFR_G) or enter components per entity.', tag: 'Data Entry', link: '/capital', adminOnly: true },
        { title: 'Daily Reports', desc: 'Daily / weekly LCR and large exposure reports for key entities.', tag: 'Monitoring', link: '/daily-reports' },
        { title: 'Projects', desc: 'Track project tasks, assign owners, and monitor progress.', tag: 'Collaboration', link: '/projects' },
        { title: 'Team Directory', desc: 'Contact information for the project team members.', tag: 'People', link: '/team' },
        { title: 'Business Case', desc: 'ROI, operational benefits and justification for the tool.', tag: 'Strategy', link: '/business-case' },
        { title: 'Backend Cockpit', desc: 'Connection status, live tables, schema and API map; reboot and insert data.', tag: 'Backend', link: '/cockpit', adminOnly: true },
        { title: 'Data Management', desc: 'Add / modify deadlines, import / export CSV and JSON.', tag: 'Admin', link: '/datamanagement', adminOnly: true },
    ].filter(card => !card.adminOnly || isAdmin);

    const StatCard: React.FC<{label: string, value: string | number}> = ({label, value}) => (
        <div className="bg-white p-5 rounded-lg border border-efg-line border-l-2 border-l-brand-primary text-center shadow-card">
            <div className="text-xs text-brand-text-secondary uppercase tracking-widest">{label}</div>
            <div className="text-3xl font-light text-brand-text-primary mt-1">{value}</div>
        </div>
    );

    return (
        <div className="p-5 md:p-8">
            <PageHeader title="Regulatory Reporting Dashboard" subtitle="Multi-entity regulatory reporting control center" />

            {showBanner && upcomingDeadlines.length > 0 && (
                <DeadlineNotificationBanner
                    count={upcomingDeadlines.length}
                    onDismiss={() => setShowBanner(false)}
                />
            )}

            <InfoBox>
                <strong>Modular navigation —</strong> each module is independent. Open them in separate tabs to work in parallel.
            </InfoBox>

            <Card className="mb-8">
                <SectionHeader title="Quick Overview" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Entities Tracked" value={data.kpisHistory.length > 0 ? new Set(data.kpisHistory.map(k => k.entity)).size : 0} />
                    <StatCard label="Active Deadlines" value={deadlinesCount} />
                    <StatCard label="Projects" value={data.projects.length} />
                    <StatCard label="Team Members" value={data.team.length} />
                </div>
            </Card>

            <h2 className="text-lg font-semibold text-brand-text-primary mb-4 pb-2 border-b border-brand-text-primary/80">Available Modules</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {moduleCards.map(m => {
                    const content = (
                        <>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-text-secondary">{m.tag}</span>
                            <h3 className="text-lg font-semibold text-brand-text-primary mt-2 group-hover:text-brand-primary transition-colors">{m.title}</h3>
                            <p className="text-sm text-brand-text-secondary mt-1.5 leading-relaxed">{m.desc}</p>
                        </>
                    );

                    if(m.link) {
                        return (
                             <Link to={m.link} key={m.title} className="group block bg-white p-6 rounded-lg shadow-card border border-efg-line border-l-2 border-l-brand-primary hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                                {content}
                            </Link>
                        )
                    }
                    return (
                        <div key={m.title} onClick={() => m.alertMsg && alert(m.alertMsg)} className="group bg-white p-6 rounded-lg shadow-card border border-efg-line border-l-2 border-l-gray-300 transition-all duration-300 cursor-not-allowed opacity-60">
                            {content}
                        </div>
                    )
                })}
            </div>

            <Card>
                <SectionHeader title="Centralized Database" suffix="read-only" />
                <p className="text-brand-text-secondary mb-4 text-sm">A read-only view of the application's central data. To edit, import, or export, go to the Data Management module.</p>
                <textarea value={textData} readOnly className="w-full h-64 p-3 font-mono text-xs bg-gray-50 border-2 border-gray-200 rounded-lg focus:border-brand-primary focus:ring-brand-primary"/>
                <div className="mt-4 flex gap-3">
                    <button onClick={copyData} className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">Copy Data</button>
                    <button onClick={() => navigate('/datamanagement')} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-5 rounded-md transition-colors">Manage Data</button>
                </div>
            </Card>
        </div>
    );
};