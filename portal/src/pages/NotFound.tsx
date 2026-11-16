import { useData } from '../data/PortalDataSource';
import { Link } from 'react-router-dom';
import { Page } from '../components/Page';

export function NotFound() {
  return (
    <Page title="Page not found" description="That address does not match anything in your workspace.">
      <div><Link className="btn" to={useData().base}>Go to Overview</Link></div>
    </Page>
  );
}
