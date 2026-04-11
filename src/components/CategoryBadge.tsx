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
  adjectif: 'Adjectif',
  verbe: 'Verbe',
  adverbe: 'Adverbe',
};

const categoryStyles: Record<WordCategory, string> = {
  nom: 'bg-badge-nom/15 text-badge-nom border-badge-nom/30',
  adjectif: 'bg-badge-adjectif/15 text-badge-adjectif border-badge-adjectif/30',
  verbe: 'bg-badge-verbe/15 text-badge-verbe border-badge-verbe/30',
  adverbe: 'bg-badge-adverbe/15 text-badge-adverbe border-badge-adverbe/30',
};

const genderAbbr: Record<WordGender, string> = {
  masculin: 'n.m.',
  féminin: 'n.f.',
};

export function CategoryBadge({ category, gender, className }: CategoryBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'font-medium text-xs px-3 py-1 gap-1.5',
        categoryStyles[category],
        className
      )}
    >
      {categoryLabels[category]}
      {category === 'nom' && gender && (
        <span className="italic opacity-70">{genderAbbr[gender]}</span>
      )}
    </Badge>
  );
}
