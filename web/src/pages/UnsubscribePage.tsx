import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Logo } from '../components/brand/Logo';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';

export function UnsubscribePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function unsubscribe() {
    setState('sending');
    setError('');
    try {
      const result = await api<{ email: string }>('POST', '/email/unsubscribe', { token });
      setEmail(result.email);
      setState('done');
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div
        data-testid="unsubscribe-page"
        className="w-full max-w-[460px] rounded-sheet border border-line bg-surface p-6"
      >
        <Logo />
        {state === 'done' ? (
          <div data-testid="unsubscribe-done">
            <h1 className="mt-6 t-title text-ink">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">
              We've stopped Tuesday emails to {email}. You can turn them back on any time in
              Profile, Notifications.
            </p>
            <div className="mt-5">
              <Button onClick={() => navigate('/')}>Open Tuesday</Button>
            </div>
          </div>
        ) : !token ? (
          <div>
            <h1 className="mt-6 t-title text-ink">This link is incomplete</h1>
            <p className="mt-2 text-sm text-muted">
              The unsubscribe token is missing. Open the link from the email again, or manage your
              emails from Profile, Notifications.
            </p>
            <p className="mt-5 t-meta">
              <Link to="/login" className="font-semibold text-accent hover:underline">
                Sign in to Tuesday
              </Link>
            </p>
          </div>
        ) : (
          <div>
            <h1 className="mt-6 t-title text-ink">Unsubscribe from Tuesday emails</h1>
            <p className="mt-2 text-sm text-muted">
              This stops instant mention and assignment emails, item updates and the daily digest
              for your account. You can turn them back on in Profile, Notifications.
            </p>
            <p className="mt-3 t-meta text-muted">
              Account emails such as password resets and invites are not affected.
            </p>
            {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                data-testid="unsubscribe-submit"
                loading={state === 'sending'}
                onClick={() => void unsubscribe()}
              >
                Unsubscribe
              </Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>
                Keep emails
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
