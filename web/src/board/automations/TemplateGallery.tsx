import { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Layers,
  MessageSquare,
  Sparkles,
  UserPlus,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Input } from '../../components/ui/Input';
import { RecipeSentence } from './parts';
import { RECIPE_CATEGORIES, type AutomationRecipe, type RecipeCategory } from './recipeCatalog';

const CATEGORY_ICONS: Record<RecipeCategory, typeof Zap> = {
  communicate: MessageSquare,
  assign: UserPlus,
  schedule: CalendarClock,
  organize: Layers,
  create: Zap,
  ai: Sparkles,
};

function categoryLabel(category: RecipeCategory): string {
  return RECIPE_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

export function CategoryBadge({ category }: { category: RecipeCategory }) {
  const Icon = CATEGORY_ICONS[category] ?? Layers;
  return (
    <span className="inline-flex items-center gap-1 rounded-chip bg-sunken px-1.5 py-0.5 t-meta font-semibold text-muted">
      <Icon size={11} />
      {categoryLabel(category)}
    </span>
  );
}

export function RecipeCard({
  recipe,
  onUse,
  compact = false,
}: {
  recipe: AutomationRecipe;
  onUse: () => void;
  compact?: boolean;
}) {
  return (
    <button
      aria-label={recipe.title}
      onClick={onUse}
      className={cn(
        'group flex w-full flex-col rounded-sheet border border-line bg-surface p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-pop',
        compact ? 'h-full' : 'h-full',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <CategoryBadge category={recipe.category} />
        <span className="inline-flex items-center gap-1 t-meta font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Use <ArrowRight size={11} />
        </span>
      </div>
      <span className="mt-2.5 flex-1">
        <RecipeSentence segments={recipe.segments} />
      </span>
      {!compact && (
        <span className="mt-2 block text-xs leading-5 text-muted">{recipe.description}</span>
      )}
    </button>
  );
}

export function TemplateGallery({
  recipes,
  onUse,
}: {
  recipes: AutomationRecipe[];
  onUse: (recipe: AutomationRecipe) => void;
}) {
  const [category, setCategory] = useState<'all' | RecipeCategory>('all');
  const [query, setQuery] = useState('');

  const visible = recipes.filter((recipe) => {
    if (category !== 'all' && recipe.category !== category) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      recipe.title.toLowerCase().includes(needle) ||
      recipe.description.toLowerCase().includes(needle) ||
      categoryLabel(recipe.category).toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setCategory('all')}
          className={cn(
            'rounded-chip border px-2.5 py-1 t-meta font-semibold transition-colors',
            category === 'all'
              ? 'border-accent bg-accent-soft text-accent-soft-ink'
              : 'border-line text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          All templates
        </button>
        {RECIPE_CATEGORIES.map((entry) => {
          const Icon = CATEGORY_ICONS[entry.id];
          return (
            <button
              key={entry.id}
              onClick={() => setCategory(entry.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-chip border px-2 py-1 t-meta font-semibold transition-colors',
                category === entry.id
                  ? 'border-accent bg-accent-soft text-accent-soft-ink'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <Icon size={11} />
              {entry.label}
            </button>
          );
        })}
        <div className="ml-auto w-full sm:w-[200px]">
          <Input
            aria-label="Search templates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            className="h-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-sheet border border-line bg-surface px-5 py-10 text-center">
          <p className="t-label text-ink">No templates match</p>
          <p className="mt-1 text-sm text-muted">Clear the search or pick another category.</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {visible.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onUse={() => onUse(recipe)} />
          ))}
        </div>
      )}
    </div>
  );
}
