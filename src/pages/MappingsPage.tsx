import React from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader } from '../components';
import { DataExplorer } from './BackendCockpitPage';

/**
 * v3.24: Mappings & nomenclatures as its own module (Data section). The data
 * lives in ProdMappingEntries — this page opens the explorer directly on it,
 * with a reminder of the kinds and where bulk reloads happen. Everything you
 * could do before (edit in place, filter, insert, CSV) is unchanged.
 */
const KINDS: Array<[string, string]> = [
  ['gl', 'accounting line → GL account (+ TypeOf/SubType)'],
  ['fx', 'currency → CHF rate'],
  ['rt01', 'category → QDL'],
  ['industry', 'industry codes & interco flags'],
  ['label', 'Swiss GAAP prefix labels'],
  ['hfm', 'GL account → HFM account'],
  ['hfmlabel', 'HFM labels (workbook)'],
  ['hfmrule', 'HFM prefix fallback overrides'],
  ['generic', 'generic counterparties referential'],
  ['lanlabel', 'official FINMA LegalAccountNumber nomenclature'],
  ['hfmname', 'official HFM nomenclature'],
];

export const MappingsPage: React.FC = () => {
  const { isAdmin } = useData();
  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <PageHeader title="Mappings & nomenclatures"
        subtitle="The adjustment mapping workbook and both official nomenclatures (FINMA legal accounts + HFM), stored in the database and editable live." />
      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold mb-1.5">One table, eleven kinds</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(([k, desc]) => (
                <span key={k} title={desc}
                  className="text-[11px] font-semibold text-brand-secondary bg-brand-bg-body border border-efg-line rounded-full px-2.5 py-0.5 cursor-help">
                  {k}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-brand-text-secondary mt-2">
              Hover a kind for what it maps. Official nomenclatures (lanlabel, hfmname) are seeded at API startup and
              preserved on workbook re-saves; edits here are audited like everywhere else.
            </p>
          </div>
          {isAdmin && (
            <div className="text-[11.5px] text-brand-text-secondary leading-relaxed border border-efg-line rounded-lg p-3 max-w-xs bg-brand-bg-body/50">
              <b className="text-brand-text-primary">Bulk reload:</b> re-upload the mapping workbook in{' '}
              <Link to="/production" className="text-brand-secondary underline">Production → Reco settings</Link>{' '}
              and save — user-managed kinds are preserved. Stored copies live in the{' '}
              <Link to="/library" className="text-brand-secondary underline">Library</Link> (Production/Mappings).
            </div>
          )}
        </div>
      </Card>
      <DataExplorer initialTable="prodMappingEntries" />
    </div>
  );
};

export default MappingsPage;
