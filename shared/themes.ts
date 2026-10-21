export const COLOR_THEME_IDS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

export interface ColorTheme {
  id: ColorThemeId;
  name: string;
  description: string;
  accent: string;
  accentDark: string;
  defaultMode: 'light' | 'dark';
}

const LEGACY_THEME_IDS: Record<string, ColorThemeId> = {
  forest: 'wednesday',
  amber: 'thursday',
  violet: 'friday',
};

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'monday',
    name: 'Monday',
    description: 'The original Monday blue.',
    accent: '#0073EA',
    accentDark: '#4C9AFF',
    defaultMode: 'light',
  },
  {
    id: 'tuesday',
    name: 'Tuesday',
    description: 'Our signature Tuesday pink.',
    accent: '#C9356C',
    accentDark: '#F27BA5',
    defaultMode: 'light',
  },
  {
    id: 'wednesday',
    name: 'Wednesday',
    description: 'A grounded midweek green.',
    accent: '#2F7D5B',
    accentDark: '#63C79A',
    defaultMode: 'light',
  },
  {
    id: 'thursday',
    name: 'Thursday',
    description: 'A warm Thursday amber.',
    accent: '#B45309',
    accentDark: '#F6AC36',
    defaultMode: 'light',
  },
  {
    id: 'friday',
    name: 'Friday',
    description: 'A calm Friday violet.',
    accent: '#6D4AFF',
    accentDark: '#B390FF',
    defaultMode: 'dark',
  },
  {
    id: 'saturday',
    name: 'Saturday',
    description: 'Black field, one neon light.',
    accent: '#007F91',
    accentDark: '#00E5FF',
    defaultMode: 'dark',
  },
  {
    id: 'sunday',
    name: 'Sunday',
    description: 'A warm Sunday red.',
    accent: '#C2414B',
    accentDark: '#FF8A8A',
    defaultMode: 'light',
  },
];

export function isColorTheme(value: unknown): value is ColorThemeId {
  return typeof value === 'string' && (COLOR_THEME_IDS as readonly string[]).includes(value);
}

export function normalizeColorTheme(value: unknown): ColorThemeId {
  if (isColorTheme(value)) return value;
  if (typeof value === 'string' && LEGACY_THEME_IDS[value]) return LEGACY_THEME_IDS[value];
  return 'monday';
}
