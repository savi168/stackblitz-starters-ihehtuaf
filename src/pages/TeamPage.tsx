import React from 'react';
import { useData } from '../context/DataContext';
import { Card, PageHeader, BackButton } from '../components';

export const TeamPage: React.FC = () => {
    const { data } = useData();

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Team Directory" subtitle="Contact information for the project team" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.team.map(member => {
                    const initials = member.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                    return (
                        <Card key={member.id} className="border-l-2 border-l-brand-primary">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-brand-bg-body border border-efg-line flex items-center justify-center text-sm font-semibold text-brand-secondary flex-shrink-0">
                                    {initials}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-brand-text-primary truncate">{member.name}</h3>
                                    <p className="text-xs uppercase tracking-widest text-brand-text-secondary mt-0.5">{member.role}</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-efg-line space-y-1">
                                <a href={`mailto:${member.email}`} className="text-sm text-brand-primary hover:underline block truncate">{member.email}</a>
                                {member.phone && <p className="text-sm text-brand-text-secondary">{member.phone}</p>}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};
