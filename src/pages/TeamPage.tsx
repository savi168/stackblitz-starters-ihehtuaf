import React from 'react';
import { useData } from '../context/DataContext';
import { Card, PageHeader, BackButton } from '../components';

export const TeamPage: React.FC = () => {
    const { data } = useData();

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon="👥" title="Team Directory" subtitle="Contact information for the project team" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.team.map(member => (
                    <Card key={member.id} className="text-center">
                        <h3 className="text-xl font-bold text-brand-text-primary">{member.name}</h3>
                        <p className="text-brand-secondary font-semibold">{member.role}</p>
                        <a href={`mailto:${member.email}`} className="text-sm text-brand-primary hover:underline mt-2 block">{member.email}</a>
                        {member.phone && <p className="text-sm text-brand-text-secondary mt-1">{member.phone}</p>}
                    </Card>
                ))}
            </div>
        </div>
    );
};
