import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { labelStyle, useTheme } from '../lib/labelColors';
import { CheckCircle2 } from 'lucide-react';
import type { PublicForm } from '../../../shared/types';

export function PublicFormPage() {
  const { token = '' } = useParams();
  const theme = useTheme();
  const form = useQuery({
    queryKey: ['public-form', token],
    queryFn: () => api<PublicForm>('GET', `/public/forms/${token}`),
    retry: false,
  });
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [website, setWebsite] = useState('');

  if (form.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted">
        <Spinner size={20} />
      </div>
    );
  }

  if (form.error) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-[640px] rounded-pop border border-line bg-surface p-8 text-center">
          <h1 className="t-title text-ink">Form unavailable</h1>
          <p className="mt-2 text-sm text-muted">This form isn't accepting responses.</p>
        </div>
      </div>
    );
  }

  const data = form.data!;

  function set(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  }

  async function submit() {
    const nextErrors: Record<string, string> = {};
    for (const field of data.fields) {
      const value = values[field.key];
      if (field.required && (value === undefined || value === null || value === '')) {
        nextErrors[field.key] = `${field.label} is required`;
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ message: string }>('POST', `/public/forms/${token}`, {
        values,
        website,
      });
      setSubmitted(result.message);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Something went wrong' });
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-[640px] rounded-[16px] border border-line bg-surface p-8">
          <EmptyState
            icon={<CheckCircle2 size={30} className="text-success" />}
            title={data.title}
            description={submitted}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSubmitted(null);
                  setValues({});
                }}
              >
                Send another response
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[640px] rounded-pop border border-line bg-surface p-8">
        <h1 className="t-title text-ink">{data.title}</h1>
        {data.description && <p className="mt-1 text-sm text-muted">{data.description}</p>}
        <div className="mt-5 space-y-5">
          {data.fields.map((field) => {
            const value = values[field.key];
            return (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {field.label}
                  {field.required && <span className="text-danger"> *</span>}
                </label>
                {field.help && <p className="mb-1 t-meta text-muted">{field.help}</p>}
                {(field.type === 'text' ||
                  field.type === 'email' ||
                  field.type === 'phone' ||
                  field.type === 'link' ||
                  field.type === 'name') && (
                  <Input
                    type={field.type === 'email' ? 'email' : 'text'}
                    aria-label={field.label}
                    value={String(value ?? '')}
                    onChange={(event) =>
                      set(
                        field.key,
                        field.type === 'link'
                          ? { url: event.target.value }
                          : field.type === 'name'
                            ? event.target.value
                            : { text: event.target.value },
                      )
                    }
                  />
                )}
                {field.type === 'long_text' && (
                  <Textarea
                    aria-label={field.label}
                    rows={4}
                    value={String((value as { text?: string } | undefined)?.text ?? '')}
                    onChange={(event) => set(field.key, { text: event.target.value })}
                  />
                )}
                {field.type === 'number' && (
                  <Input
                    type="number"
                    aria-label={field.label}
                    value={String((value as { number?: number } | undefined)?.number ?? '')}
                    onChange={(event) => set(field.key, { number: Number(event.target.value) })}
                  />
                )}
                {field.type === 'date' && (
                  <Input
                    type="date"
                    aria-label={field.label}
                    value={String((value as { date?: string } | undefined)?.date ?? '')}
                    onChange={(event) => set(field.key, { date: event.target.value })}
                  />
                )}
                {field.type === 'timeline' && (
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      aria-label={`${field.label} start`}
                      value={String((value as { from?: string } | undefined)?.from ?? '')}
                      onChange={(event) =>
                        set(field.key, {
                          from: event.target.value,
                          to: (value as { to?: string } | undefined)?.to ?? '',
                        })
                      }
                    />
                    <Input
                      type="date"
                      aria-label={`${field.label} end`}
                      value={String((value as { to?: string } | undefined)?.to ?? '')}
                      onChange={(event) =>
                        set(field.key, {
                          from: (value as { from?: string } | undefined)?.from ?? '',
                          to: event.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {field.type === 'checkbox' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean((value as { checked?: boolean } | undefined)?.checked)}
                      onChange={(event) => set(field.key, { checked: event.target.checked })}
                    />
                    Yes
                  </label>
                )}
                {field.type === 'rating' && (
                  <div className="flex gap-1">
                    {Array.from({ length: field.max ?? 5 }, (_, index) => index + 1).map(
                      (rating) => (
                        <button
                          key={rating}
                          type="button"
                          className={
                            (value as { rating?: number } | undefined)?.rating === rating
                              ? 'text-warning'
                              : 'text-line-strong'
                          }
                          onClick={() => set(field.key, { rating })}
                        >
                          ★
                        </button>
                      ),
                    )}
                  </div>
                )}
                {(field.type === 'status' || field.type === 'dropdown') && (
                  <div className="space-y-1">
                    {(field.options ?? []).map((option) => {
                      const checked =
                        field.type === 'status'
                          ? (value as { labelId?: string } | undefined)?.labelId === option.id
                          : (
                              (value as { optionIds?: string[] } | undefined)?.optionIds ?? []
                            ).includes(option.id);
                      return (
                        <label key={option.id} className="flex items-center gap-2 text-sm">
                          <input
                            type={field.type === 'status' ? 'radio' : 'checkbox'}
                            name={field.key}
                            checked={checked}
                            onChange={() => {
                              if (field.type === 'status') set(field.key, { labelId: option.id });
                              else {
                                const current =
                                  (value as { optionIds?: string[] } | undefined)?.optionIds ?? [];
                                set(field.key, {
                                  optionIds: checked
                                    ? current.filter((id) => id !== option.id)
                                    : [...current, option.id],
                                });
                              }
                            }}
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: labelStyle(option.color, theme).solid }}
                          />
                          {option.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors[field.key] && (
                  <p className="mt-1 t-meta text-danger">{errors[field.key]}</p>
                )}
              </div>
            );
          })}
          <input
            type="text"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />
          {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
          <Button
            data-testid="form-public-submit"
            loading={saving}
            className="w-full"
            onClick={submit}
          >
            Send response
          </Button>
        </div>
      </div>
    </div>
  );
}
