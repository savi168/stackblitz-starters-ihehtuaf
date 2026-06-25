import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { Deadline, Attachment } from '../types';
import { calculateRegulatoryDeadline, getStatusBadge, getTypeBadge } from '../utils';
import { Card, PageHeader, BackButton, Select, Modal, SortableHeader, SectionHeader } from '../components';


const CalendarView: React.FC<{ deadlines: Deadline[] }> = ({ deadlines }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const deadlinesByDate = useMemo(() => {
        const map = new Map<string, Deadline[]>();
        deadlines.forEach(deadline => {
            const dateKey = deadline.dueDate;
            if (!map.has(dateKey)) {
                map.set(dateKey, []);
            }
            map.get(dateKey)!.push(deadline);
        });
        return map;
    }, [deadlines]);

    const changeMonth = (offset: number) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);

    const firstDayOfMonth = (new Date(year, month, 1).getDay() + 6) % 7; // 0 for Monday, 6 for Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Correctly get today's date based on local timezone, not UTC
    const today = new Date();
    today.setHours(0, 0, 0, 0);


    const calendarDays: (Date | null)[] = (Array.from({ length: firstDayOfMonth }, () => null) as (Date | null)[]).concat(
        Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
    );
    
    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-100">&lt;</button>
                <h2 className="text-lg font-semibold text-brand-text-primary capitalize">{monthName}</h2>
                <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-100">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day} className="font-bold text-sm text-brand-text-secondary py-2">{day}</div>
                ))}
                {calendarDays.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="border rounded-lg border-gray-100"></div>;

                    const yearStr = day.getFullYear();
                    const monthStr = String(day.getMonth() + 1).padStart(2, '0');
                    const dayStr = String(day.getDate()).padStart(2, '0');
                    const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

                    const dayDeadlines = deadlinesByDate.get(dateKey) || [];
                    
                    const isToday = today.getTime() === day.getTime();

                    return (
                        <div key={dateKey} className="border rounded-lg p-1 min-h-[120px] flex flex-col bg-white">
                            <span className={`font-semibold text-sm ${isToday ? 'bg-brand-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto' : 'text-brand-text-primary'}`}>
                                {day.getDate()}
                            </span>
                            <div className="flex-grow mt-1 space-y-1 overflow-y-auto">
                                {dayDeadlines.map(d => (
                                    <div key={d.id} title={d.name} className={`p-1 text-xs rounded truncate ${getStatusBadge(d.status)}`}>
                                        {d.name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

export const DeadlinesPage: React.FC = () => {
    const { data, setData } = useData();
    const [showForm, setShowForm] = useState(false);
    const [view, setView] = useState<'table' | 'calendar'>('table');
    const [selectedDeadline, setSelectedDeadline] = useState<Deadline | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [editableDetails, setEditableDetails] = useState<{ ownerGroup: string; validator1: string; validator2: string; comments: string } | null>(null);

    const [newDeadline, setNewDeadline] = useState<Partial<Deadline>>({
        name: '',
        entity: '',
        dueDate: '',
        ownerGroup: '',
        status: 'upcoming',
        type: 'regulatory',
    });
    
    const deadlineEntities = useMemo(() => Array.from(new Set(data.deadlines.map(d => d.entity))).sort(), [data.deadlines]);
    const ownerGroups = useMemo(() => Array.from(new Set(data.deadlines.map(d => d.ownerGroup).filter(Boolean))).sort(), [data.deadlines]);
    const validators1 = useMemo(() => Array.from(new Set(data.deadlines.map(d => d.validator1).filter(Boolean))).sort(), [data.deadlines]);
    const validators2 = useMemo(() => Array.from(new Set(data.deadlines.map(d => d.validator2).filter(Boolean))).sort(), [data.deadlines]);
    const reportingDates = useMemo(() => Array.from(new Set(data.deadlines.map(d => d.endOfPeriod).filter(Boolean))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [data.deadlines]);

    const [filters, setFilters] = useState({ name: '', status: 'all', entity: 'all', type: 'all', ownerGroup: 'all', validator1: 'all', validator2: 'all', reportingDate: 'all' });
    const [sortConfig, setSortConfig] = useState<{ key: keyof Deadline; direction: 'ascending' | 'descending' } | null>({ key: 'dueDate', direction: 'ascending' });

    const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    }, []);
    
    const handleSort = useCallback((key: keyof Deadline) => {
        setSortConfig(prevConfig => {
            let direction: 'ascending' | 'descending' = 'ascending';
            if (prevConfig && prevConfig.key === key && prevConfig.direction === 'ascending') {
                direction = 'descending';
            }
            return { key, direction };
        });
    }, []);
    
    const handleStatusChange = useCallback((deadlineId: number, newStatus: Deadline['status']) => {
        setData(prevData => {
            const newDeadlines = prevData.deadlines.map(d => {
                if (d.id === deadlineId) {
                    const newHistoryEntry = {
                        timestamp: new Date().toISOString(),
                        oldStatus: d.status,
                        newStatus: newStatus,
                    };
                    return {
                        ...d,
                        status: newStatus,
                        history: [...(d.history || []), newHistoryEntry],
                    };
                }
                return d;
            });
            return { ...prevData, deadlines: newDeadlines };
        });
    }, [setData]);

     const handleTypeChange = useCallback((deadlineId: number, newType: Deadline['type']) => {
        setData(prevData => {
            const newDeadlines = prevData.deadlines.map(d => 
                d.id === deadlineId ? { ...d, type: newType } : d
            );
            return { ...prevData, deadlines: newDeadlines };
        });
    }, [setData]);
    
    const handleAttachmentUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && selectedDeadline) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                const newAttachment: Attachment = { name: file.name, type: file.type, dataUrl };

                const updateDeadline = (d: Deadline) => {
                    if (d.id === selectedDeadline.id) {
                        const updated = {
                            ...d,
                            attachments: [...(d.attachments || []), newAttachment],
                        };
                        setSelectedDeadline(updated); 
                        return updated;
                    }
                    return d;
                };

                setData(prevData => ({
                    ...prevData,
                    deadlines: prevData.deadlines.map(updateDeadline),
                }));
            };
            reader.readAsDataURL(file);
        }
    }, [selectedDeadline, setData]);
    
    const handleAttachmentDelete = useCallback((e: React.MouseEvent, attachmentName: string) => {
        e.stopPropagation();
        if (!selectedDeadline) return;

        if (window.confirm(`Are you sure you want to delete the file "${attachmentName}"? This action cannot be undone.`)) {
            const deadlineId = selectedDeadline.id;

            const updatedDeadline = {
                ...selectedDeadline,
                attachments: selectedDeadline.attachments.filter(att => att.name !== attachmentName),
            };

            setSelectedDeadline(updatedDeadline);

            setData(prevData => ({
                ...prevData,
                deadlines: prevData.deadlines.map(d =>
                    d.id === deadlineId ? updatedDeadline : d
                ),
            }));
        }
    }, [selectedDeadline, setData]);

    const handleDeadlineDelete = useCallback((deadlineId: number) => {
        const deadlineToDelete = data.deadlines.find(d => d.id === deadlineId);
        if (!deadlineToDelete) return;

        if (window.confirm(`Are you sure you want to delete the task "${deadlineToDelete.name}"? This action cannot be undone.`)) {
            setData(prevData => ({
                ...prevData,
                deadlines: prevData.deadlines.filter(d => d.id !== deadlineId),
            }));
        }
    }, [data.deadlines, setData]);

    const handleDetailsSave = useCallback(() => {
        const deadlineId = selectedDeadline?.id;
        if (!deadlineId || !editableDetails) return;

        setData(prevData => ({
            ...prevData,
            deadlines: prevData.deadlines.map(d =>
                d.id === deadlineId ? { ...d, ...editableDetails } : d
            )
        }));

        setSelectedDeadline(prev => (prev ? { ...prev, ...editableDetails } : null));
    }, [selectedDeadline, editableDetails, setData]);

    const handleFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewDeadline(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleAddDeadline = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const newId = Math.max(...data.deadlines.map(d => d.id), 0) + 1;
        const deadlineToAdd: Deadline = { 
            id: newId, 
            name: newDeadline.name || '',
            status: 'upcoming',
            comments: '',
            history: [],
            attachments: [],
            endOfPeriod: '',
            dueDate: newDeadline.dueDate || '',
            entity: newDeadline.entity || '',
            type: newDeadline.type || 'regulatory',
            controlNumber: '',
            frequency: '',
            ownerGroup: newDeadline.ownerGroup || '',
            validator1: '',
            validator2: '',
            ownerApproved: false,
            validation1Approved: false,
            validation2Approved: false,
            signedOffWithException: false,
            lightFull: '',
            itemType: '',
            path: '',
        };
        setData(prevData => ({
            ...prevData,
            deadlines: [...prevData.deadlines, deadlineToAdd]
        }));
        setShowForm(false);
        setNewDeadline({ name: '', entity: '', dueDate: '', ownerGroup: '', type: 'regulatory' });
    }, [data.deadlines, newDeadline, setData]);
    
    const openDetailsModal = useCallback((deadline: Deadline) => {
        setSelectedDeadline(deadline);
        setEditableDetails({ ownerGroup: deadline.ownerGroup, validator1: deadline.validator1, validator2: deadline.validator2, comments: deadline.comments });
        setIsDetailsModalOpen(true);
    }, []);

    const filteredAndSortedDeadlines = useMemo(() => {
        let filtered = [...data.deadlines];

        if (filters.name) {
            filtered = filtered.filter(d => d.name.toLowerCase().includes(filters.name.toLowerCase()));
        }
        if (filters.status !== 'all') {
            filtered = filtered.filter(d => d.status === filters.status);
        }
        if (filters.entity !== 'all') {
            filtered = filtered.filter(d => d.entity === filters.entity);
        }
        if (filters.type !== 'all') {
            filtered = filtered.filter(d => d.type === filters.type);
        }
        if (filters.ownerGroup !== 'all') {
            filtered = filtered.filter(d => d.ownerGroup === filters.ownerGroup);
        }
        if (filters.validator1 !== 'all') {
            filtered = filtered.filter(d => d.validator1 === filters.validator1);
        }
        if (filters.validator2 !== 'all') {
            filtered = filtered.filter(d => d.validator2 === filters.validator2);
        }
        if (filters.reportingDate !== 'all') {
            filtered = filtered.filter(d => d.endOfPeriod === filters.reportingDate);
        }

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                
                if (valA < valB) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filtered;
    }, [data.deadlines, filters, sortConfig]);
    
    const hasDetailsChanged = selectedDeadline && editableDetails && (
        selectedDeadline.ownerGroup !== editableDetails.ownerGroup ||
        selectedDeadline.validator1 !== editableDetails.validator1 ||
        selectedDeadline.validator2 !== editableDetails.validator2 ||
        selectedDeadline.comments !== editableDetails.comments
    );

    return (
         <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Calendar & Deadlines" subtitle="Tracking of regulatory and internal deadlines" />
            
            <Card className="mb-8">
                 <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                     <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-brand-text-primary">View &amp; Actions</h2>
                        <div className="bg-brand-bg-body p-1 rounded-md flex">
                             <button onClick={() => setView('table')} className={`px-3 py-1 text-sm font-semibold rounded ${view === 'table' ? 'bg-white shadow-card' : 'text-brand-text-secondary'}`}>Table</button>
                             <button onClick={() => setView('calendar')} className={`px-3 py-1 text-sm font-semibold rounded ${view === 'calendar' ? 'bg-white shadow-card' : 'text-brand-text-secondary'}`}>Calendar</button>
                        </div>
                     </div>
                     <button onClick={() => setShowForm(!showForm)} className="bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-semibold py-2 px-4 rounded-md transition-colors">
                        {showForm ? 'Cancel' : '+ Add Deadline'}
                    </button>
                 </div>
                 
                 {view === 'table' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <input type="text" name="name" placeholder="Search by name..." value={filters.name} onChange={handleFilterChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary" />
                         <Select label="Entity" name="entity" value={filters.entity} onChange={handleFilterChange}>
                             <option value="all">All Entities</option>
                             {deadlineEntities.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                        <Select label="Reporting Date" name="reportingDate" value={filters.reportingDate} onChange={handleFilterChange}>
                            <option value="all">All Reporting Dates</option>
                            {reportingDates.map(d => <option key={d} value={d}>{d}</option>)}
                        </Select>
                        <Select label="Type" name="type" value={filters.type} onChange={handleFilterChange}>
                            <option value="all">All Types</option>
                            <option value="regulatory">Regulatory</option>
                            <option value="internal">Internal</option>
                        </Select>
                        <Select label="Status" name="status" value={filters.status} onChange={handleFilterChange}>
                            <option value="all">All Statuses</option>
                            <option value="completed">Completed</option>
                            <option value="inprogress">In Progress</option>
                            <option value="upcoming">Upcoming</option>
                        </Select>
                        <Select label="Owner Group" name="ownerGroup" value={filters.ownerGroup} onChange={handleFilterChange}>
                            <option value="all">All Owners</option>
                            {ownerGroups.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                        <Select label="Validator 1" name="validator1" value={filters.validator1} onChange={handleFilterChange}>
                            <option value="all">All Validator 1</option>
                            {validators1.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                        <Select label="Validator 2" name="validator2" value={filters.validator2} onChange={handleFilterChange}>
                            <option value="all">All Validator 2</option>
                            {validators2.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                     </div>
                 )}
            </Card>

            {showForm && (
                <Card className="mb-8 border-l-2 border-l-brand-primary">
                    <SectionHeader title="New Deadline" />
                    <form onSubmit={handleAddDeadline} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                             <label htmlFor="name" className="block text-sm font-medium text-brand-text-secondary mb-1">Title / Task</label>
                             <input id="name" type="text" name="name" value={newDeadline.name} onChange={handleFormChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required />
                        </div>
                        <div>
                            <label htmlFor="entity" className="block text-sm font-medium text-brand-text-secondary mb-1">Entity</label>
                            <input id="entity" type="text" name="entity" value={newDeadline.entity} onChange={handleFormChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required />
                        </div>
                         <div>
                            <label htmlFor="ownerGroup" className="block text-sm font-medium text-brand-text-secondary mb-1">Owner Group</label>
                            <input id="ownerGroup" type="text" name="ownerGroup" value={newDeadline.ownerGroup} onChange={handleFormChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required />
                        </div>
                        <div>
                            <label htmlFor="dueDate" className="block text-sm font-medium text-brand-text-secondary mb-1">Due Date</label>
                             <input id="dueDate" type="date" name="dueDate" value={newDeadline.dueDate} onChange={handleFormChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required />
                        </div>
                        <div>
                            <label htmlFor="type" className="block text-sm font-medium text-brand-text-secondary mb-1">Type</label>
                            <select id="type" name="type" value={newDeadline.type} onChange={handleFormChange} className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm" required>
                                <option value="regulatory">Regulatory</option>
                                <option value="internal">Internal</option>
                            </select>
                        </div>
                        <div className="md:col-span-2 text-right space-x-2">
                             <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-lg transition-colors">Cancel</button>
                             <button type="submit" className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-6 rounded-lg transition-colors">Save</button>
                        </div>
                    </form>
                </Card>
            )}

            {view === 'table' ? (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-brand-text-secondary">
                            <thead className="text-xs text-brand-text-primary uppercase bg-brand-bg-body">
                                <tr>
                                    <SortableHeader label="Title" sortKey="name" sortConfig={sortConfig} onSort={handleSort} />
                                    <th scope="col" className="px-6 py-3">SharePoint</th>
                                    <SortableHeader label="Reporting Date" sortKey="endOfPeriod" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Internal Deadline" sortKey="dueDate" sortConfig={sortConfig} onSort={handleSort} />
                                    <th scope="col" className="px-6 py-3">Regulatory Deadline</th>
                                    <SortableHeader label="Entity" sortKey="entity" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Owner Group" sortKey="ownerGroup" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Validator 1" sortKey="validator1" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Validator 2" sortKey="validator2" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Type" sortKey="type" sortConfig={sortConfig} onSort={handleSort} />
                                    <SortableHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
                                    <th scope="col" className="px-6 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSortedDeadlines.map(d => (
                                    <tr key={d.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-brand-text-primary">{d.name}</td>
                                        <td className="px-6 py-4">
                                            {d.path && d.path.startsWith('shp/') ? (
                                                <a 
                                                    href={`https://inside.efgz.efg.corp/${d.path}/EditForm.aspx?ID=${d.id}`}
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-brand-primary hover:underline inline-flex items-center gap-1 text-sm"
                                                    aria-label={`Open SharePoint link for ${d.name}`}
                                                >
                                                    <span>Open</span>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">{d.endOfPeriod}</td>
                                        <td className="px-6 py-4">{d.dueDate}</td>
                                        <td className="px-6 py-4 font-semibold text-brand-text-primary">{calculateRegulatoryDeadline(d.dueDate)}</td>
                                        <td className="px-6 py-4">{d.entity}</td>
                                        <td className="px-6 py-4">{d.ownerGroup}</td>
                                        <td className="px-6 py-4">{d.validator1}</td>
                                        <td className="px-6 py-4">{d.validator2}</td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={d.type}
                                                onChange={(e) => handleTypeChange(d.id, e.target.value as Deadline['type'])}
                                                className={`w-full p-2 text-xs font-semibold rounded-lg border-transparent focus:ring-2 focus:ring-brand-primary focus:border-transparent cursor-pointer ${getTypeBadge(d.type)}`}
                                                aria-label={`Update type for ${d.name}`}
                                            >
                                                <option value="regulatory">Regulatory</option>
                                                <option value="internal">Internal</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={d.status}
                                                onChange={(e) => handleStatusChange(d.id, e.target.value as Deadline['status'])}
                                                className={`w-full p-2 text-xs font-semibold rounded-lg border-transparent focus:ring-2 focus:ring-brand-primary focus:border-transparent cursor-pointer ${getStatusBadge(d.status)}`}
                                                aria-label={`Update status for ${d.name}`}
                                            >
                                                <option value="upcoming">Upcoming</option>
                                                <option value="inprogress">In Progress</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => openDetailsModal(d)} className="text-sm bg-brand-secondary hover:bg-brand-secondary-dark text-white font-bold py-1 px-3 rounded-lg transition-colors">
                                                    Details
                                                </button>
                                                <button 
                                                    onClick={() => handleDeadlineDelete(d.id)} 
                                                    className="p-1.5 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                                    aria-label={`Delete deadline ${d.name}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : <CalendarView deadlines={filteredAndSortedDeadlines} />}
            
            <Modal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} title={`Details for: ${selectedDeadline?.name}`}>
                {selectedDeadline && editableDetails && (
                    <div className="space-y-6 text-sm">
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <DetailItemModal label="Entity" value={selectedDeadline.entity} />
                             <DetailItemModal label="Control Number" value={selectedDeadline.controlNumber} />
                             <DetailItemModal label="Frequency" value={selectedDeadline.frequency} />
                             <DetailItemModal label="End of Period" value={selectedDeadline.endOfPeriod} />
                             <DetailItemModal label="Due Date" value={selectedDeadline.dueDate} />
                             <DetailItemModal label="Item Type" value={selectedDeadline.itemType} />
                        </div>
                        <hr />

                        <div>
                             <label className="block text-sm font-medium text-brand-text-secondary mb-1">Owner Group</label>
                             <input type="text" value={editableDetails.ownerGroup} onChange={(e) => setEditableDetails(prev => prev ? {...prev, ownerGroup: e.target.value} : null)} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-brand-text-secondary mb-1">Validator 1</label>
                                <input type="text" value={editableDetails.validator1} onChange={(e) => setEditableDetails(prev => prev ? {...prev, validator1: e.target.value} : null)} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-brand-text-secondary mb-1">Validator 2</label>
                                <input type="text" value={editableDetails.validator2} onChange={(e) => setEditableDetails(prev => prev ? {...prev, validator2: e.target.value} : null)} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm" />
                            </div>
                        </div>
                         <div>
                            <h3 className="text-lg font-bold text-brand-text-primary mb-2 border-b pb-2">💬 Comments</h3>
                            <textarea
                                value={editableDetails.comments}
                                onChange={(e) => setEditableDetails(prev => prev ? {...prev, comments: e.target.value} : null)}
                                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary"
                                rows={4}
                                placeholder="Add comments here..."
                            />
                        </div>
                        <div className="text-right">
                                <button
                                    onClick={handleDetailsSave}
                                    className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    disabled={!hasDetailsChanged}
                                >
                                    Save Changes
                                </button>
                            </div>
                        <hr/>
                        <div>
                            <h3 className="text-lg font-bold text-brand-text-primary mb-2 border-b pb-2">📋 Status History</h3>
                            {selectedDeadline.history && selectedDeadline.history.length > 0 ? (
                                <ul className="space-y-2 list-disc list-inside text-gray-600 max-h-40 overflow-y-auto">
                                    {[...selectedDeadline.history].reverse().map((log, index) => (
                                        <li key={index}>
                                            <span className={`font-semibold capitalize px-1.5 py-0.5 rounded text-xs ${getStatusBadge(log.oldStatus)}`}>{log.oldStatus}</span>
                                            {' → '}
                                            <span className={`font-semibold capitalize px-1.5 py-0.5 rounded text-xs ${getStatusBadge(log.newStatus)}`}>{log.newStatus}</span>
                                            {' on '}
                                            <span className="font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-brand-text-secondary">No status changes recorded.</p>}
                        </div>
                        
                        <div>
                            <h3 className="text-lg font-bold text-brand-text-primary mb-2 border-b pb-2">📎 Attachments</h3>
                             {selectedDeadline.attachments && selectedDeadline.attachments.length > 0 ? (
                                <ul className="space-y-2">
                                    {selectedDeadline.attachments.map((file) => (
                                        <li key={file.name} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                                            <span className="text-blue-600 truncate flex-grow" title={file.name}>{file.name}</span>
                                            <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                                                <a href={file.dataUrl} download={file.name} className="text-sm bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-1 px-3 rounded-lg transition-colors">Download</a>
                                                <button 
                                                    onClick={(e) => handleAttachmentDelete(e, file.name)} 
                                                    className="p-1.5 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                                    aria-label={`Delete file ${file.name}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-brand-text-secondary">No attachments found.</p>}
                            <div className="mt-4">
                                <label htmlFor="file-upload" className="block text-sm font-medium text-brand-text-secondary mb-1">Add Attachment:</label>
                                <input 
                                    id="file-upload"
                                    type="file"
                                    onChange={handleAttachmentUpload}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

        </div>
    );
};
const DetailItemModal: React.FC<{label: string, value: string | boolean | undefined}> = ({label, value}) => (
    <div className="bg-slate-50 p-2 rounded-md">
        <p className="text-xs text-brand-text-secondary">{label}</p>
        <p className="font-semibold text-brand-text-primary">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || 'N/A')}</p>
    </div>
);