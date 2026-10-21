import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';

export function ReleasePage() {
  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Release guide"
        description="The ordered path from a local Docker instance to a public deployment."
      />
      <div className="max-w-[760px] space-y-5 text-sm text-ink">
        <section className="rounded-sheet border border-line bg-surface p-4">
          <h2 className="t-section text-ink">1. Public HTTPS</h2>
          <p className="mt-1 text-muted">
            Put the app behind Caddy or a Cloudflare Tunnel, then set <code>APP_URL</code> to the
            public HTTPS origin and <code>COOKIE_SECURE=true</code>. The full compose example is in
            <code> deploy/docker-compose.prod.example.yml</code> and the step-by-step checklist is
            in <code>docs/RELEASE.md</code>.
          </p>
        </section>
        <section className="rounded-sheet border border-line bg-surface p-4">
          <h2 className="t-section text-ink">2. Email</h2>
          <p className="mt-1 text-muted">
            Add SPF, DKIM and DMARC for the sending domain using the records from Purelymail, then
            use{' '}
            <Link to="/admin?tab=email" className="text-accent underline hover:text-accent-hover">
              Admin → Email
            </Link>{' '}
            → Check domain.
          </p>
        </section>
        <section className="rounded-sheet border border-line bg-surface p-4">
          <h2 className="t-section text-ink">3. Backups and restore</h2>
          <p className="mt-1 text-muted">
            Configure an off-site S3-compatible target, take a backup in{' '}
            <Link to="/admin?tab=data" className="text-accent underline hover:text-accent-hover">
              Admin → Data
            </Link>
            , and restore it into a throwaway instance. Then tick the restore drill in the go-live
            checklist.
          </p>
        </section>
        <section className="rounded-sheet border border-line bg-surface p-4">
          <h2 className="t-section text-ink">4. Launch settings</h2>
          <p className="mt-1 text-muted">
            Set <code>VAPID_SUBJECT</code>, configure an AI budget in{' '}
            <Link to="/admin?tab=ai" className="text-accent underline hover:text-accent-hover">
              Admin → AI
            </Link>
            , and send a real test email to Gmail and Outlook.
          </p>
        </section>
        <p className="t-meta text-muted">
          The live status of each item is on{' '}
          <Link to="/admin?tab=go-live" className="text-accent underline hover:text-accent-hover">
            Admin → Go-live
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
