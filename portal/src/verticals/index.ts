// Vertical packs.
//
// A workspace's vertical (organizations.vertical) selects one of these.
// Screens ask the pack for wording instead of hard-coding "property" or
// "loan", so one build of the portal reads naturally to a CRE firm, a bank
// and an investment firm. Later phases add telemetry tiles and workflow
// templates to the same objects.
//
// Rule from marketing/content.js that applies here too: naming a vendor
// system means "we build around it". Never show one as connected unless a
// real connection exists for that workspace.
import type { Vertical } from '../lib/types';

export interface VerticalPack {
  key: Vertical;
  /** Full name, e.g. in the workspace picker. */
  label: string;
  /** Short tag next to the workspace name. */
  tag: string;
  nouns: {
    /** The thing a workflow is about. */
    asset: string;
    assets: string;
    /** The outside party whose documents arrive. */
    counterparty: string;
    counterparties: string;
  };
  /** Document types this vertical's review queue typically holds. */
  documents: string[];
  /** The same, as it reads mid-sentence. Written out so "T-12" and "K-1" keep their capitals. */
  documentsPhrase: string;
  /** Systems firms in this vertical commonly run. Labels only. */
  systems: string[];
}

const packs: Record<Vertical, VerticalPack> = {
  CRE: {
    key: 'CRE',
    label: 'Commercial real estate',
    tag: 'CRE',
    nouns: { asset: 'property', assets: 'properties', counterparty: 'tenant', counterparties: 'tenants' },
    documents: ['Rent rolls', 'T-12 statements', 'Offering memoranda', 'Leases'],
    documentsPhrase: 'rent rolls, T-12 statements and offering memoranda',
    systems: ['Yardi', 'MRI', 'AppFolio', 'Juniper Square', 'Dealpath'],
  },
  BANK: {
    key: 'BANK',
    label: 'Bank',
    tag: 'Bank',
    nouns: { asset: 'loan', assets: 'loans', counterparty: 'borrower', counterparties: 'borrowers' },
    documents: ['Tax returns', 'Financial statements', 'Borrower packages', 'KYC documents'],
    documentsPhrase: 'tax returns, financial statements and borrower packages',
    systems: ['nCino', 'Fiserv', 'Jack Henry', 'FIS', 'Baker Hill'],
  },
  INVESTMENT_FIRM: {
    key: 'INVESTMENT_FIRM',
    label: 'Investment firm',
    tag: 'Investments',
    nouns: { asset: 'fund', assets: 'funds', counterparty: 'investor', counterparties: 'investors' },
    documents: ['Subscription agreements', 'Capital call notices', 'K-1s', 'Investor onboarding forms'],
    documentsPhrase: 'subscription agreements, capital call notices and K-1s',
    systems: ['DealCloud', 'Juniper Square', 'Carta', 'Allvue', 'Addepar', 'Salesforce FSC'],
  },
};

export const verticalPack = (v: Vertical | undefined | null): VerticalPack => packs[v ?? 'CRE'] ?? packs.CRE;
