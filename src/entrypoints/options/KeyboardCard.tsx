// The Keyboard view (product spec §8.1): every key in its state, plus the legend. Selection is the page's.
import { cn } from 'cn';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap } from '@/components/KeyCap';
import type { Keymap } from '@/domain/keymap-ops';
import { isAssignable, type Key, type KeyLabel } from '@/domain/keys';
import { displayName, monogram } from '@/domain/shortcut';
import type { Platform } from '@/platform/platform-labels';

export interface KeyboardCardProps {
  keymap: Keymap;
  /** Keys whose shortcut is open in a tab right now. */
  openKeys: ReadonlySet<Key>;
  selected: Key;
  /** The keys a search matches, or null with no search: every other key is dimmed. */
  matches?: ReadonlySet<Key> | null;
  onSelect: (key: Key) => void;
  platform?: Platform;
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('size-3 rounded-sm border', className)} />;
}

export function KeyboardCard({ keymap, openKeys, selected, matches = null, onSelect, platform }: KeyboardCardProps) {
  const renderKey = (label: KeyLabel) => {
    if (!isAssignable(label)) return <KeyCap label={label} state="reserved" platform={platform} />;
    const shortcut = keymap[label];
    return (
      <KeyCap
        label={label}
        state={label === selected ? 'selected' : shortcut === undefined ? 'free' : 'assigned'}
        open={openKeys.has(label)}
        monogram={shortcut === undefined ? undefined : monogram(shortcut)}
        name={shortcut === undefined ? undefined : displayName(shortcut)}
        dimmed={matches !== null && !matches.has(label)}
        platform={platform}
        onClick={() => onSelect(label)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6 overflow-x-auto rounded-2xl border bg-card p-6">
      <KeyboardGrid size="lg" platform={platform} renderKey={renderKey} />
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Swatch className="border-primary/20 bg-primary/7" />
          {i18n.t('options.legend.assigned')}
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch className="border-primary bg-primary" />
          {i18n.t('options.legend.selected')}
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch className="border-input bg-card" />
          {i18n.t('options.legend.free')}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          {i18n.t('options.legend.open')}
        </li>
      </ul>
    </div>
  );
}
