// Sections that are designed but not open in this release. Each says plainly
// what will be there. Nothing here pretends to be live.
import { useSession } from '../auth/session';
import { Page } from '../components/Page';
import { verticalPack } from '../verticals';

type Section = 'review' | 'integrations' | 'vault' | 'requests';

export function NotYet({ section }: { section: Section }) {
  const { session } = useSession();
  const pack = verticalPack(session?.org?.vertical);
  const docs = pack.documentsPhrase;

  const copy: Record<Section, { title: string; lead: string; body: string }> = {
    review: {
      title: 'Review',
      lead: 'Documents waiting for a person to check them.',
      body: `Each item will open with the source document on one side and the extracted fields on the other (${docs}), with confidence, reconciliation checks and a full audit trail before anything is approved.`,
    },
    integrations: {
      title: 'Integrations',
      lead: 'The systems your workflows read from and write to.',
      body: `Connection health, credentials and delivery logs for the systems in your engagement (for example ${pack.systems.slice(0, 3).join(', ')}) will be managed here.`,
    },
    vault: {
      title: 'Vault',
      lead: 'Your deliverables in one place.',
      body: 'The audit report, signed agreements, architecture diagrams, walkthrough videos and security documentation for your engagement will be kept here, with version history.',
    },
    requests: {
      title: 'Requests',
      lead: 'Ask for a change or a new workflow.',
      body: 'Describe a bottleneck, attach sample documents and receive a scoped proposal, alongside a direct message thread with the engineer who built your system.',
    },
  };
  const c = copy[section];

  return (
    <Page title={c.title} description={c.lead}>
      <section className="card">
        <div className="empty">
          <h3>Not open yet</h3>
          <p>{c.body}</p>
          <p>Need something in the meantime? Email <a href="mailto:nathan@monkflow.io">nathan@monkflow.io</a> and you will get a reply from the person doing the work.</p>
        </div>
      </section>
    </Page>
  );
}
