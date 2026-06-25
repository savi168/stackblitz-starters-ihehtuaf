import React from 'react';
import { Card, PageHeader, BackButton, SectionHeader, BulletList } from '../components';
import { ArrowRight } from 'lucide-react';

export const BusinessCasePage: React.FC = () => {
    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Business Case" subtitle="Strategic value, ROI analysis and operational benefits" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                {/* Executive Summary + Benefits */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <SectionHeader title="Executive Summary" />
                        <p className="text-sm text-brand-text-secondary leading-relaxed">
                            This tool moves regulatory reporting from a manual, spreadsheet-dependent process to an automated, auditable, and centralized repository. By integrating data collection, high-level diagnosis, and multi-entity analysis in a single platform, we reduce operational risk and significantly improve the speed of internal reporting.
                        </p>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <SectionHeader title="Time Savings &amp; ROI" />
                            <BulletList items={[
                                <><strong>−75% time</strong> on monthly data aggregation</>,
                                <>Instant generation of LCR &amp; capital status reports</>,
                                <>Elimination of multi-source reconciliation errors</>,
                                <>Estimated gain: <strong>~120 hours / quarter</strong> across 4 analysts</>,
                            ]} />
                        </Card>

                        <Card>
                            <SectionHeader title="Data Quality Control" />
                            <BulletList items={[
                                <><strong>Automated flags</strong> for retail deposit spikes or RWA anomalies</>,
                                <>Standardized validation workflow for all entities</>,
                                <>Full audit trail of status changes and approvals</>,
                                <>Single point of truth — no more "latest version" searches</>,
                            ]} />
                        </Card>
                    </div>
                </div>

                {/* Workflow Sidebar */}
                <Card className="bg-brand-text-primary text-white border-0">
                    <SectionHeader title="Optimized Workflow" className="border-white/20 [&_h2]:text-white [&_span]:text-white/60" />
                    <div className="space-y-3">
                        {[
                            { id: 1, label: "Core Banking System", desc: "Data generation" },
                            { id: 2, label: "Reg-Reporting Tool", desc: "Technical computation" },
                            { id: 3, label: "Output Extraction", desc: "Raw data extraction" },
                            { id: 4, label: "Database Import", desc: "Central consolidation" },
                            { id: 5, label: "Automated Diagnosis", desc: "High-level controls" },
                            { id: 6, label: "Interactive Dashboard", desc: "Insight &amp; analysis" }
                        ].map((step, i, arr) => (
                            <div key={step.id}>
                                <div className="flex gap-3 items-center">
                                    <div className="w-7 h-7 rounded-full bg-brand-primary flex items-center justify-center text-xs font-bold border border-white/20 flex-shrink-0">
                                        {step.id}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold leading-tight">{step.label}</div>
                                        <div className="text-xs text-white/50">{step.desc}</div>
                                    </div>
                                </div>
                                {i < arr.length - 1 && <div className="ml-3.5 h-3 border-l border-white/15 my-0.5" />}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                {/* Reports Optimization */}
                <Card>
                    <SectionHeader title="Reports Optimized" suffix="manual → automated" />
                    <div className="space-y-3">
                        {[
                            { name: "FINRISK &amp; Capital Position", desc: "Manual monthly production", label: "Automated" },
                            { name: "Monthly LCR &amp; NSFR Pack", desc: "Manual aggregation by entity", label: "Automated" },
                            { name: "FINMA Quarterly Reports", desc: "Complex reconciliation process", label: "Auditable" },
                        ].map(item => (
                            <div key={item.name} className="flex justify-between items-center p-3 bg-brand-bg-body rounded-md border border-efg-line group hover:border-brand-primary/30 transition-colors">
                                <div>
                                    <p className="text-sm font-semibold text-brand-text-primary" dangerouslySetInnerHTML={{ __html: item.name }} />
                                    <p className="text-xs text-brand-text-secondary">{item.desc}</p>
                                </div>
                                <div className="flex items-center gap-1.5 text-brand-primary opacity-40 group-hover:opacity-100 transition-opacity">
                                    <span className="text-xs font-bold">{item.label}</span>
                                    <ArrowRight size={12} />
                                </div>
                            </div>
                        ))}
                        <div className="mt-4 p-4 bg-brand-primary/8 border border-brand-primary/20 rounded-md">
                            <p className="text-xs font-semibold uppercase tracking-widest text-brand-text-secondary">Projected quarterly saving</p>
                            <p className="text-3xl font-light text-brand-text-primary mt-1">~120 <span className="text-base">hours</span></p>
                        </div>
                    </div>
                </Card>

                {/* Operational Continuity */}
                <Card>
                    <SectionHeader title="Operational Continuity" />
                    <div className="space-y-6">
                        {[
                            {
                                label: "Centralized Deadline Repository",
                                color: "bg-brand-primary",
                                text: "Avoid missed regulatory filings with real-time tracking. Transition from fragmented calendar invites to a collaborative dashboard with clear validation status."
                            },
                            {
                                label: "Project & IT Ticket Alignment",
                                color: "bg-brand-secondary",
                                text: "Tie regulatory changes directly to IT tickets and projects. See the impact of computation fixes on final ratios in one single view."
                            },
                            {
                                label: "Single Point of Truth (BAU)",
                                color: "bg-green-500",
                                text: "Teams no longer search for the “latest version” of a report. The tool acts as the departmental repository for all historical regulatory submissions."
                            }
                        ].map(item => (
                            <div key={item.label} className="flex gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${item.color} mt-2 flex-shrink-0`} />
                                <div>
                                    <h3 className="text-sm font-semibold text-brand-text-primary">{item.label}</h3>
                                    <p className="text-sm text-brand-text-secondary mt-1 leading-relaxed">{item.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="flex justify-center">
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 text-sm font-semibold border border-brand-text-primary text-brand-text-primary hover:bg-brand-text-primary hover:text-white py-3 px-8 rounded-md transition-all"
                >
                    Print Full Business Case Report
                </button>
            </div>
        </div>
    );
};
