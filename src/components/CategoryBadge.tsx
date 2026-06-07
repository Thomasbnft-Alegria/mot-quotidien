import { WordCategory, WordGender } from '@/types/word';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CategoryBadgeProps {
  category: WordCategory;
  gender?: WordGender;
  className?: string;
}

const categoryLabels: Record<WordCategory, string> = {
  nom: 'Nom',
  adjectif: 'Adj.',
  verbe: 'Verbe',
  adverbe: 'Adv.',
};

const categoryStyles: Record<WordCategory, string> = {
  nom: 'bg-badge-nom/15 text-badge-nom border-badge-nom/30',
  adjectif: 'bg-badge-adjectif/15 text-badge-adjectif border-badge-adjectif/30',
  verbe: 'bg-badge-verbe/15 text-badge-verbe border-badge-verbe/30',
  adverbe: 'bg-badge-adverbe/15 text-badge-adverbe border-badge-adverbe/30',
};

function getBadgeLabel(category: WordCategory, gender?: WordGender): string {
  if (category === 'nom' && gender) {
    return gender === 'masculin' ? 'n.m.' : 'n.f.';
  }
  if (category === 'adjectif' && gender) {
    return gender === 'masculin' ? 'adj. m.' : 'adj. f.';
  }
  return categoryLabels[category];
}

export function CategoryBadge({ category, gender, className }: CategoryBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'font-medium text-xs px-3 py-1',
        categoryStyles[category],
        className
      )}
    >
      {getBadgeLabel(category, gender)}
    </Badge>
  );
}
