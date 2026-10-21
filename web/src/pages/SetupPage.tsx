import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { AuthShell, Field } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import { ColorThemeSwatches } from '../components/preferences/ColorThemeSwatches';
import type { ColorThemeId } from '../../../shared/themes';

const ZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
})();

export function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [step, setStep] = useState(1);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(ZONES.includes(browserZone) ? browserZone : 'UTC');
  const [colorTheme, setColorTheme] = useState<ColorThemeId>('monday');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const createdRef = useRef(false);

  if (me.data && !createdRef.current && !created) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (step === 1) {
      if (!name.trim() || !email.trim() || password.length < 8) {
        setError('Enter your name, email and a password of at least 8 characters.');
        return;
      }
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      await api('POST', '/auth/setup', {
        orgName,
        name,
        email,
        password,
        colorTheme,
        theme,
        timezone,
      });
      createdRef.current = true;
      setCreated(true);
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['auth', 'state'] });
      await qc.refetchQueries({ queryKey: ['auth', 'state'] });
      await qc.refetchQueries({ queryKey: ['me'] });
      navigate('/welcome?step=starter');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell
      wide
      title={step === 1 ? 'Create your account' : 'Set up your organisation'}
      subtitle={
        step === 1 ? "You'll be the owner of this Tuesday." : 'This is the name your team will see.'
      }
    >
      <Stepper step={step} />
      <form onSubmit={submit}>
        {step === 1 ? (
          <>
            <Field label="Your name" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                maxLength={80}
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 8 characters.">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={200}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Organisation name" htmlFor="orgName">
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                autoFocus
                maxLength={80}
              />
            </Field>
            <Field label="Timezone" htmlFor="timezone">
              <Select
                ariaLabel="Timezone"
                value={timezone}
                onChange={setTimezone}
                options={ZONES.map((zone) => ({ value: zone, label: zone }))}
              />
            </Field>
            <div className="mb-4">
              <p className="t-label mb-1.5 text-ink">Colour theme</p>
              <ColorThemeSwatches
                value={colorTheme}
                onChange={(next, mode) => {
                  setColorTheme(next);
                  setTheme(mode);
                }}
                compact
              />
            </div>
          </>
        )}
        {error && <p className="mb-3 text-sm text-danger-text">{error}</p>}
        <div className="flex gap-2">
          {step === 2 && (
            <Button
              type="button"
              variant="secondary"
              data-testid="setup-back"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
          )}
          <Button type="submit" data-testid="setup-next" loading={saving} className="flex-1">
            {step === 1 ? 'Continue' : 'Create organisation'}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
