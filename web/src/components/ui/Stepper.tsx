export function Stepper({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <div className="mb-5 flex items-center gap-3" aria-label={`Step ${step} of ${total}`}>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            data-testid="setup-step"
            data-step={index + 1}
            aria-current={index + 1 === step ? 'step' : undefined}
            className={`h-2 w-2 rounded-full ${index + 1 <= step ? 'bg-accent' : 'bg-sunken'}`}
          />
        ))}
      </div>
      <span className="t-meta text-muted">
        Step {step} of {total}
      </span>
    </div>
  );
}
