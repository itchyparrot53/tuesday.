export const GAP = 1024;

export function positionAfter(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return GAP;
  if (prev === null) return (next as number) - GAP;
  if (next === null) return prev + GAP;
  return (prev + next) / 2;
}
