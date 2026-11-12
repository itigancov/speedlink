// The List view (product spec §8.1): the assigned keys in keyboard order, one row each. Selection is the page's.
import { cn } from 'cn';
import { KeyCap } from '@/components/KeyCap';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KEYBOARD_ORDER } from '@/domain/keys';
import { siteOf } from '@/domain/link';
import { displayName, type Shortcut } from '@/domain/shortcut';
import type { KeyboardCardProps } from './KeyboardCard';

/** The same inputs as the Keyboard view; `matches` hides the rows outside a search instead of dimming them. */
export type ListCardProps = KeyboardCardProps;

function opensAs(shortcut: Shortcut): string {
  const mode = i18n.t(`options.openMode.${shortcut.openMode}.title`);
  // Close current is ignored with This tab, so the list doesn't claim it.
  return shortcut.closeCurrent && shortcut.openMode !== 'this'
    ? `${mode} ${i18n.t('options.list.closesCurrent')}`
    : mode;
}

function Message({ children }: { children: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function ListCard({ keymap, openKeys, selected, matches = null, onSelect, platform }: ListCardProps) {
  const assigned = KEYBOARD_ORDER.flatMap((key) => {
    const shortcut = keymap[key];
    return shortcut === undefined ? [] : [{ key, shortcut }];
  });
  const rows = matches === null ? assigned : assigned.filter(({ key }) => matches.has(key));

  return (
    <div className="rounded-2xl border bg-card p-4">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{i18n.t('options.list.key')}</TableHead>
            <TableHead>{i18n.t('options.list.name')}</TableHead>
            <TableHead>{i18n.t('options.list.link')}</TableHead>
            <TableHead>{i18n.t('options.list.opensAs')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assigned.length === 0 ? (
            <Message>{i18n.t('options.list.empty')}</Message>
          ) : rows.length === 0 ? (
            <Message>{i18n.t('options.list.noMatch')}</Message>
          ) : (
            rows.map(({ key, shortcut }) => {
              const isSelected = key === selected;
              return (
                // The key button in the first cell is the row's keyboard path; a click anywhere on the row selects too.
                <TableRow
                  key={key}
                  aria-selected={isSelected}
                  data-state={isSelected ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => onSelect(key)}
                >
                  <TableCell className="w-12">
                    <KeyCap
                      label={key}
                      size="sm"
                      state={isSelected ? 'selected' : 'assigned'}
                      open={openKeys.has(key)}
                      name={displayName(shortcut)}
                      platform={platform}
                    />
                  </TableCell>
                  <TableCell className={cn('font-medium', shortcut.name === undefined && 'text-muted-foreground')}>
                    {shortcut.name ?? siteOf(shortcut.link)}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate text-muted-foreground">{shortcut.link}</span>
                      </TooltipTrigger>
                      <TooltipContent>{shortcut.link}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{opensAs(shortcut)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
