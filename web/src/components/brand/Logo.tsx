import { cn } from '../../lib/cn';

export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="img"
      aria-label="Tuesday"
    >
      <svg width="30" height="27" viewBox="8 14 86 76" aria-hidden>
        <rect
          x="14"
          y="20"
          width="54"
          height="54"
          rx="15"
          fill="var(--logo-back)"
          transform="rotate(-10 41 47)"
        />
        <rect
          x="34"
          y="30"
          width="56"
          height="56"
          rx="15"
          fill="var(--logo-front)"
          transform="rotate(6 62 58)"
        />
        <path
          d="M49 59 L58 68 L76 48"
          fill="none"
          stroke="var(--logo-check)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="rotate(6 62 58)"
        />
      </svg>
      {!collapsed && <span className="logo-wordmark text-ink">tuesday</span>}
    </div>
  );
}
