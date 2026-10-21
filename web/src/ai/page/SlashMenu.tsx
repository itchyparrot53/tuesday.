export const SLASH_COMMANDS = [
  {
    command: '/plan',
    label: 'Plan my day',
    description: 'A prioritised list for today',
    prompt:
      'Plan my day: look at my work and recent activity, then give me a prioritised list for today with the reason for each.',
  },
  {
    command: '/summarize',
    label: 'Summarize a board',
    description: 'Status, risks and next steps',
    prompt: 'Summarize the attached board: status, risks, who is overloaded, next steps.',
  },
  {
    command: '/changes',
    label: 'What changed',
    description: 'The last 7 days across your boards',
    prompt:
      'What changed on my boards in the last 7 days? Group by board and highlight anything that needs my attention.',
  },
  {
    command: '/find',
    label: 'Find items',
    description: 'Search by name or status',
    prompt: 'Find items matching: {text}. List them with their status and owner.',
  },
  {
    command: '/notes',
    label: 'Meeting notes',
    description: 'Turn notes into items',
    prompt: '',
  },
  {
    command: '/draft',
    label: 'Draft an update',
    description: 'Progress and next steps',
    prompt: 'Draft an update for the attached item, summarising progress and next steps.',
  },
] as const;

export function SlashMenu({
  filter,
  selected,
  onPick,
}: {
  filter: string;
  selected: number;
  onPick: (command: (typeof SLASH_COMMANDS)[number]) => void;
}) {
  const commands = SLASH_COMMANDS.filter((command) =>
    `${command.command} ${command.label}`.toLowerCase().includes(filter.toLowerCase()),
  );
  if (!commands.length) return null;
  return (
    <div
      data-testid="ai-slash-menu"
      role="listbox"
      className="absolute bottom-full left-0 z-20 mb-1 w-[300px] rounded-pop border border-line bg-surface p-1.5 shadow-pop"
    >
      {commands.map((command, index) => (
        <button
          key={command.command}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={`flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-left ${
            index === selected ? 'bg-sunken' : 'hover:bg-sunken'
          }`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(command);
          }}
        >
          <span className="w-20 shrink-0 t-meta font-semibold text-ink">{command.command}</span>
          <span className="min-w-0">
            <span className="block text-sm text-ink">{command.label}</span>
            <span className="block t-meta text-muted">{command.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
