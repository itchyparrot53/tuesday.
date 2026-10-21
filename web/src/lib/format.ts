import { format, formatDistanceToNowStrict, parseISO, startOfDay } from 'date-fns';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function shortDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return iso;
  }
}

export function longDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

export function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function isPastDate(date: string): boolean {
  try {
    return new Date(`${date}T00:00:00`) < startOfDay(new Date());
  } catch {
    return false;
  }
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
