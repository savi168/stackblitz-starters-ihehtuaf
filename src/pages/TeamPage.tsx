import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Contact, TeamMember } from '../types';
import { Card, PageHeader, BackButton, Modal, SectionHeader } from '../components';

/**
 * Team directory + contact directory:
 *  - the team itself (editable cards);
 *  - everyone else worth calling (auditors, custody, legal, IT, group
 *    treasury…), tagged with department and free-text topics so a search like
 *    "garantie bancaire" surfaces who to contact, with an optional pointer to
 *    the related procedure in the Library.
 */

const inputCls = 'block w-full p-2.5 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-[11px] uppercase tracking-wider text-brand-text-secondary mb-1">{label}</label>
        {children}
    </div>
);

const nextId = (...lists: Array<Array<{ id: number }>>): number =>
    Math.max(0, ...lists.flat().map(x => x.id)) + 1;

// --- Team member form -------------------------------------------------------

const MemberForm: React.FC<{
    initial: Partial<TeamMember>;
    onSave: (m: Omit<TeamMember, 'id'>) => void;
    onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
    const [f, setF] = useState({ name: initial.name || '', role: initial.role || '', email: initial.email || '', phone: initial.phone || '' });
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));
    return (
        <form onSubmit={e => { e.preventDefault(); if (f.name.trim()) onSave({ name: f.name.trim(), role: f.role.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined }); }} className="space-y-3">
            <Field label="Name"><input value={f.name} onChange={set('name')} required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Role"><input value={f.role} onChange={set('role')} className={inputCls} placeholder="e.g. Regulatory Analyst" /></Field>
                <Field label="Phone"><input value={f.phone} onChange={set('phone')} className={inputCls} /></Field>
            </div>
            <Field label="Email"><input type="email" value={f.email} onChange={set('email')} className={inputCls} /></Field>
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand-text-secondary bg-brand-bg-body hover:bg-efg-line py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">Save</button>
            </div>
        </form>
    );
};

// --- Contact form -----------------------------------------------------------

const ContactForm: React.FC<{
    initial: Partial<Contact>;
    onSave: (c: Omit<Contact, 'id'>) => void;
    onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
    const [f, setF] = useState({
        name: initial.name || '', role: initial.role || '', department: initial.department || '',
        company: initial.company || '', email: initial.email || '', phone: initial.phone || '',
        topics: initial.topics || '', notes: initial.notes || '', procedure: initial.procedure || '',
    });
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setF(p => ({ ...p, [k]: e.target.value }));
    const clean = (v: string) => v.trim() || undefined;
    return (
        <form onSubmit={e => {
            e.preventDefault();
            if (!f.name.trim()) return;
            onSave({
                name: f.name.trim(), role: clean(f.role), department: clean(f.department), company: clean(f.company),
                email: clean(f.email), phone: clean(f.phone), topics: clean(f.topics), notes: clean(f.notes), procedure: clean(f.procedure),
            });
        }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><input value={f.name} onChange={set('name')} required className={inputCls} /></Field>
                <Field label="Role"><input value={f.role} onChange={set('role')} className={inputCls} /></Field>
                <Field label="Department"><input value={f.department} onChange={set('department')} className={inputCls} placeholder="e.g. Group Treasury, Legal" /></Field>
                <Field label="Company"><input value={f.company} onChange={set('company')} className={inputCls} placeholder="if external (auditor, custodian…)" /></Field>
                <Field label="Email"><input type="email" value={f.email} onChange={set('email')} className={inputCls} /></Field>
                <Field label="Phone"><input value={f.phone} onChange={set('phone')} className={inputCls} /></Field>
            </div>
            <Field label="Topics (searchable keywords)">
                <input value={f.topics} onChange={set('topics')} className={inputCls}
                    placeholder="e.g. garantie bancaire, letter of credit, collateral" />
            </Field>
            <Field label="Comments">
                <textarea value={f.notes} onChange={set('notes')} rows={2} className={inputCls}
                    placeholder="When to contact, escalation, backup person…" />
            </Field>
            <Field label="Library procedure (search term)">
                <input value={f.procedure} onChange={set('procedure')} className={inputCls}
                    placeholder="document title or folder in the Library, e.g. Bank guarantee issuance" />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand-text-secondary bg-brand-bg-body hover:bg-efg-line py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">Save</button>
            </div>
        </form>
    );
};

// --- Page -------------------------------------------------------------------

export const TeamPage: React.FC = () => {
    const { data, setData, isAdmin } = useData();
    const [memberModal, setMemberModal] = useState<{ member?: TeamMember } | null>(null);
    const [contactModal, setContactModal] = useState<{ contact?: Contact } | null>(null);
    const [q, setQ] = useState('');
    const [fDept, setFDept] = useState('');

    const contacts = data.contacts || [];
    const departments = useMemo(
        () => Array.from(new Set(contacts.map(c => c.department).filter((d): d is string => !!d))).sort(),
        [contacts]);

    const needle = q.trim().toLowerCase();
    const matches = (c: Contact) => !needle ||
        [c.name, c.role, c.department, c.company, c.topics, c.notes, c.procedure]
            .some(v => v && v.toLowerCase().includes(needle));
    const shownContacts = contacts
        .filter(c => !fDept || c.department === fDept)
        .filter(matches)
        .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name));
    // The same search also sweeps the team, so one box answers "who handles X?".
    const teamHits = needle
        ? data.team.filter(m => [m.name, m.role, m.email].some(v => v && v.toLowerCase().includes(needle)))
        : data.team;

    const saveMember = (values: Omit<TeamMember, 'id'>) => {
        setData(prev => ({
            ...prev,
            team: memberModal?.member
                ? prev.team.map(m => m.id === memberModal.member!.id ? { ...m, ...values } : m)
                : [...prev.team, { id: nextId(prev.team), ...values }],
        }));
        setMemberModal(null);
    };
    const deleteMember = (m: TeamMember) => {
        if (!window.confirm(`Remove ${m.name} from the team directory?`)) return;
        setData(prev => ({ ...prev, team: prev.team.filter(x => x.id !== m.id) }));
    };

    const saveContact = (values: Omit<Contact, 'id'>) => {
        setData(prev => ({
            ...prev,
            contacts: contactModal?.contact
                ? (prev.contacts || []).map(c => c.id === contactModal.contact!.id ? { ...c, ...values } : c)
                : [...(prev.contacts || []), { id: nextId(prev.contacts || []), ...values }],
        }));
        setContactModal(null);
    };
    const deleteContact = (c: Contact) => {
        if (!window.confirm(`Remove ${c.name} from the contact directory?`)) return;
        setData(prev => ({ ...prev, contacts: (prev.contacts || []).filter(x => x.id !== c.id) }));
    };

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Team & Contacts" subtitle="The team, and everyone else worth calling — searchable by topic" />

            <Card className="mb-6">
                <div className="flex flex-wrap gap-3">
                    <input value={q} onChange={e => setQ(e.target.value)}
                        placeholder='Search a name, department or topic — e.g. "garantie bancaire"…'
                        className="flex-1 min-w-[260px] p-2.5 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary" />
                    <select value={fDept} onChange={e => setFDept(e.target.value)} className="p-2.5 border border-gray-200 rounded-md text-sm bg-white">
                        <option value="">All departments</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </Card>

            <div className="flex items-center justify-between mb-3">
                <SectionHeader title="Team" className="mb-0 pb-0 border-0" suffix={`${teamHits.length} member(s)`} />
                {isAdmin && (
                    <button onClick={() => setMemberModal({})}
                        className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
                        + Add member
                    </button>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {teamHits.map(member => {
                    const initials = member.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                    return (
                        <Card key={member.id} className="border-l-2 border-l-brand-primary">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-brand-bg-body border border-efg-line flex items-center justify-center text-sm font-semibold text-brand-secondary flex-shrink-0">
                                    {initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base font-semibold text-brand-text-primary truncate">{member.name}</h3>
                                    <p className="text-xs uppercase tracking-widest text-brand-text-secondary mt-0.5">{member.role}</p>
                                </div>
                                {isAdmin && (
                                    <div className="flex gap-1.5 self-start">
                                        <button onClick={() => setMemberModal({ member })} title="Edit" className="text-brand-text-secondary hover:text-brand-text-primary text-[13px]">✎</button>
                                        <button onClick={() => deleteMember(member)} title="Remove" className="text-status-red/60 hover:text-status-red text-[13px]">✕</button>
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-efg-line space-y-1">
                                <a href={`mailto:${member.email}`} className="text-sm text-brand-primary hover:underline block truncate">{member.email}</a>
                                {member.phone && <p className="text-sm text-brand-text-secondary">{member.phone}</p>}
                            </div>
                        </Card>
                    );
                })}
                {teamHits.length === 0 && <p className="text-sm text-brand-text-secondary col-span-full">No team member matches the search.</p>}
            </div>

            <div className="flex items-center justify-between mb-3">
                <SectionHeader title="Contact directory" className="mb-0 pb-0 border-0"
                    suffix="outside the team — auditors, custody, legal, IT, group functions" />
                {isAdmin && (
                    <button onClick={() => setContactModal({})}
                        className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
                        + Add contact
                    </button>
                )}
            </div>
            <Card>
                {shownContacts.length === 0 ? (
                    <p className="text-sm text-brand-text-secondary py-6 text-center">
                        {contacts.length === 0
                            ? 'No contact yet. Add the people you call for guarantees, audits, custody, IT tickets… and tag them with topics so the search finds them.'
                            : 'No contact matches the search.'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-efg-line">
                                    {['Name', 'Department', 'Contact', 'Topics & comments', 'Procedure', ''].map((h, i) => (
                                        <th key={i} className="py-2.5 pr-4 text-[10px] uppercase tracking-widest text-brand-text-secondary font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-efg-line">
                                {shownContacts.map(c => (
                                    <tr key={c.id} className="align-top hover:bg-brand-bg-body/60">
                                        <td className="py-3 pr-4">
                                            <p className="font-semibold text-brand-text-primary">{c.name}</p>
                                            <p className="text-xs text-brand-text-secondary">{[c.role, c.company].filter(Boolean).join(' · ')}</p>
                                        </td>
                                        <td className="py-3 pr-4 text-brand-text-secondary whitespace-nowrap">{c.department || '—'}</td>
                                        <td className="py-3 pr-4">
                                            {c.email && <a href={`mailto:${c.email}`} className="text-brand-primary hover:underline block truncate max-w-[220px]">{c.email}</a>}
                                            {c.phone && <p className="text-brand-text-secondary">{c.phone}</p>}
                                            {!c.email && !c.phone && '—'}
                                        </td>
                                        <td className="py-3 pr-4 max-w-md">
                                            {c.topics && (
                                                <p className="flex flex-wrap gap-1 mb-1">
                                                    {c.topics.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                                                        <button key={t} onClick={() => setQ(t)} title="Search this topic"
                                                            className="text-[11px] font-medium bg-brand-secondary/10 text-brand-secondary rounded px-1.5 py-0.5 hover:bg-brand-secondary hover:text-white transition-colors">
                                                            {t}
                                                        </button>
                                                    ))}
                                                </p>
                                            )}
                                            {c.notes && <p className="text-xs text-brand-text-secondary whitespace-pre-wrap">{c.notes}</p>}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {c.procedure ? (
                                                <Link to={`/library?q=${encodeURIComponent(c.procedure)}`}
                                                    className="text-brand-secondary hover:text-brand-primary underline text-xs" title="Open the procedure in the Library">
                                                    📖 {c.procedure}
                                                </Link>
                                            ) : '—'}
                                        </td>
                                        <td className="py-3 text-right whitespace-nowrap">
                                            {isAdmin && (
                                                <>
                                                    <button onClick={() => setContactModal({ contact: c })} title="Edit" className="text-brand-text-secondary hover:text-brand-text-primary text-[13px] mr-2">✎</button>
                                                    <button onClick={() => deleteContact(c)} title="Remove" className="text-status-red/60 hover:text-status-red text-[13px]">✕</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal isOpen={!!memberModal} onClose={() => setMemberModal(null)}
                title={memberModal?.member ? `Edit ${memberModal.member.name}` : 'New team member'}>
                {memberModal && <MemberForm initial={memberModal.member || {}} onSave={saveMember} onCancel={() => setMemberModal(null)} />}
            </Modal>
            <Modal isOpen={!!contactModal} onClose={() => setContactModal(null)}
                title={contactModal?.contact ? `Edit ${contactModal.contact.name}` : 'New contact'}>
                {contactModal && <ContactForm initial={contactModal.contact || {}} onSave={saveContact} onCancel={() => setContactModal(null)} />}
            </Modal>
        </div>
    );
};
