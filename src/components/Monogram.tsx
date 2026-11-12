// A square tile with the shortcut's monogram (product spec §12.2). Only the popup page card passes a favicon
// `src`; the monogram shows while it loads and when it fails.
import { cn } from 'cn';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { monogram, type Shortcut } from '@/domain/shortcut';

export interface MonogramProps {
  shortcut: Shortcut;
  /** The tab's favicon, on the popup page card only. */
  src?: string;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

export function Monogram({ shortcut, src, size = 'lg', className }: MonogramProps) {
  return (
    <Avatar shape="square" size={size} className={className}>
      {src !== undefined && <AvatarImage src={src} alt="" />}
      <AvatarFallback className={cn('bg-primary/7 font-bold text-link', size === 'sm' ? 'text-3xs' : 'text-xs')}>
        {monogram(shortcut)}
      </AvatarFallback>
    </Avatar>
  );
}
