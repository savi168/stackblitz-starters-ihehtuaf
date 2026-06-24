import React from 'react';
import { Card, PageHeader, BackButton } from '../components';
import { 
  Trophy, 
  Clock, 
  ShieldCheck, 
  Database, 
  Workflow, 
  ArrowRight, 
  FileCheck, 
  Zap,
  CheckCircle2
} from 'lucide-react';

export const BusinessCasePage: React.FC = () => {
    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader icon={<Trophy className="text-brand-primary" size={32} />} title="Business Case: Regulatory Dashboard" subtitle="Strategic value, ROI, and Operational Benefits" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                {/* Key Benefits Summary */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="bg-gradient-to-br from-brand-primary/5 to-transparent border-brand-primary/20">
                        <h2 className="text-2xl font-bold text-brand-text-primary mb-4 flex items-center gap-2">
                            <Zap className="text-brand-secondary" /> Executive Summary
                        </h2>
                        <p className="text-brand-text-secondary leading-relaxed">
                            This tool is designed to move our Regulatory Reporting from a manual, spreadsheet-dependent process to an automated, auditable, and centralized repository. By integrating data collection, high-level diagnosis, and multi-entity analysis into a single platform, we reduce operational risk and significantly improve the speed of internal reporting.
                        </p>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-brand-primary">
                            <h3 className="text-lg font-bold text-brand-text-primary mb-3 flex items-center gap-2">
                                <Clock className="text-brand-primary" /> Time Gap & ROI
                            </h3>
                            <ul className="space-y-2 text-sm text-brand-text-secondary">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span><strong>-75% time</strong> on monthly data aggregation.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span><strong>Instant generation</strong> of LCR/Capital status reports.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span>Elimination of multi-source reconciliation errors.</span>
                                </li>
                            </ul>
                        </Card>

                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-brand-secondary">
                            <h3 className="text-lg font-bold text-brand-text-primary mb-3 flex items-center gap-2">
                                <ShieldCheck className="text-brand-secondary" /> Data Quality Control
                            </h3>
                            <ul className="space-y-2 text-sm text-brand-text-secondary">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span><strong>Automated Flags:</strong> Detection of retail deposit spikes or RWA anomalies.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span>Standardized validation workflow for all entities.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                                    <span>Full audit trail of status changes and approvals.</span>
                                </li>
                            </ul>
                        </Card>
                    </div>
                </div>

                {/* Workflow Card */}
                <div className="space-y-6">
                    <Card className="bg-brand-text-primary text-white h-full border-0">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <Workflow /> Optimized Workflow
                        </h2>
                        <div className="space-y-4">
                            {[
                                { id: 1, label: "Core Banking System", desc: "Data generation" },
                                { id: 2, label: "Reg-Reporting Tool", desc: "Technical computation" },
                                { id: 3, label: "Output Extraction", desc: "Raw data extraction" },
                                { id: 4, label: "Database Import", desc: "Central consolidation" },
                                { id: 5, label: "Automated Diagnosis", desc: "High-level controls" },
                                { id: 6, label: "Interactive Dashboard", desc: "Insight & Analysis" }
                            ].map((step, i, arr) => (
                                <div key={step.id} className="relative">
                                    <div className="flex gap-4 items-center">
                                        <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-xs font-bold border-2 border-white/20">
                                            {step.id}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">{step.label}</div>
                                            <div className="text-xs text-white/60">{step.desc}</div>
                                        </div>
                                    </div>
                                    {i < arr.length - 1 && (
                                        <div className="ml-4 h-4 border-l border-white/20 my-1"></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {/* Replacement of Internal Reports */}
                <Card>
                    <h2 className="text-xl font-bold text-brand-text-primary mb-6 flex items-center gap-2">
                        <FileCheck className="text-brand-primary" /> Reports Optimization
                    </h2>
                    <div className="space-y-4">
                        <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center group">
                            <div>
                                <div className="font-bold text-brand-text-primary">FINRISK & Capital Position</div>
                                <div className="text-xs text-brand-text-secondary">Manual monthly production</div>
                            </div>
                            <div className="flex items-center gap-2 text-brand-primary opacity-50 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs font-bold">Automated</span>
                                <ArrowRight size={14} />
                            </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center group">
                            <div>
                                <div className="font-bold text-brand-text-primary">Monthly LCR & NSFR Pack</div>
                                <div className="text-xs text-brand-text-secondary">Manual aggregation by entity</div>
                            </div>
                            <div className="flex items-center gap-2 text-brand-primary opacity-50 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs font-bold">Automated</span>
                                <ArrowRight size={14} />
                            </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center group">
                            <div>
                                <div className="font-bold text-brand-text-primary">FINMA Quarterly Reports</div>
                                <div className="text-xs text-brand-text-secondary">Complex reconciliation process</div>
                            </div>
                            <div className="flex items-center gap-2 text-brand-primary opacity-50 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs font-bold">Auditable</span>
                                <ArrowRight size={14} />
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 p-4 bg-brand-primary/10 rounded-lg">
                        <div className="text-sm font-bold text-brand-primary">Projected Time Gain:</div>
                        <div className="text-3xl font-black text-brand-text-primary mt-1">~120 Hours / Quarter</div>
                        <div className="text-xs text-brand-text-secondary mt-1">Based on reduction in manual spreadsheet consolidation and review time across 4 analysts.</div>
                    </div>
                </Card>

                {/* Operations & Calendar Benefits */}
                <Card>
                    <h2 className="text-xl font-bold text-brand-text-primary mb-6 flex items-center gap-2">
                        <Database className="text-brand-secondary" /> Operational Continuity
                    </h2>
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-bold text-brand-text-primary flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-primary"></div>
                                Centralized Deadline Repository
                            </h3>
                            <p className="text-sm text-brand-text-secondary mt-2">
                                Avoid missed regulatory filings with real-time tracking. Transition from fragmented "Calendar Invites" to a collaborative dashboard with clear validation status.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-bold text-brand-text-primary flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-secondary"></div>
                                Project & IT Ticket Alignment
                            </h3>
                            <p className="text-sm text-brand-text-secondary mt-2">
                                Tie regulatory changes directly to IT tickets and projects. See the impact of "Computation fixes" on the final Ratios in one single view.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-bold text-brand-text-primary flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                Single Point of Truth (BAU)
                            </h3>
                            <p className="text-sm text-brand-text-secondary mt-2">
                                Teams no longer search for the "latest version" of a report. The tool acts as the departmental repository for all historical regulatory submissions.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="flex justify-center">
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-brand-text-primary hover:bg-black text-white font-bold py-3 px-8 rounded-full transition-all hover:scale-105 shadow-xl"
                >
                    Print Full Business Case Report
                </button>
            </div>
        </div>
    );
};
