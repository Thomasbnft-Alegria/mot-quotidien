import { NavLink } from 'react-router-dom';
import { Home, Brain, Calendar, BarChart3, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProgress } from '@/hooks/useProgress';

const navItems = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/quiz', icon: Brain, label: 'Quiz' },
  { to: '/revision', icon: Calendar, label: 'Révision', requiresSunday: true },
  { to: '/progress', icon: BarChart3, label: 'Progrès' },
];

export function BottomNav() {
  const { isWeeklyReviewAvailable } = useProgress();
  const isSunday = isWeeklyReviewAvailable();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label, requiresSunday }) => {
          const isLocked = requiresSunday && !isSunday;
          
          return (
            <NavLink
              key={to}
              to={isLocked ? '#' : to}
              onClick={(e) => isLocked && e.preventDefault()}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                  isActive && !isLocked
                    ? 'text-primary'
                    : isLocked
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {isLocked && (
                  <Lock className="w-3 h-3 absolute -top-1 -right-1 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
