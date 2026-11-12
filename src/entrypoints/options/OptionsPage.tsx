// Options · Keymap (product spec §8): the `/` search, the Keyboard or List view and the selected key's inspector.
import { SearchIcon, ZapIcon } from 'lucide-react';
import { type KeyboardEvent, type Ref, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { clear, type Keymap } from '@/domain/keymap-ops';
import { KEYBOARD_ORDER } from '@/domain/keys';
import { enterTarget, searchKeymap } from '@/domain/search';
import { isOpenNow } from '@/domain/tab-match';
import { useAutosave } from '@/hooks/use-autosave';
import { useKeymap } from '@/hooks/use-keymap';
import { lastWebTab, useOpenTabs } from '@/hooks/use-open-tabs';
import { writeChange } from '@/platform/keymap-store';
import { sendMessage } from '@/platform/messaging';
import { triggerLabel, triggerPlusKey } from '@/platform/platform-labels';
import { Inspector } from './Inspector';
import { KeyboardCard } from './KeyboardCard';
import { ListCard } from './ListCard';
import { useKeyEditor } from './use-key-editor';

type View = 'keyboard' | 'list';

interface SearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
}

function Header({ search }: { search: SearchProps }) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b bg-card px-8 py-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <ZapIcon className="size-4 fill-primary-foreground text-primary-foreground" />
        </span>
        <span className="font-bold text-lg">{i18n.t('extName')}</span>
      </div>
      <InputGroup className="h-10 max-w-lg flex-1">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={search.inputRef}
          type="search"
          aria-label={i18n.t('options.search.label')}
          placeholder={i18n.t('options.search.placeholder')}
          value={search.query}
          onChange={(event) => search.onQueryChange(event.target.value)}
          onKeyDown={search.onKeyDown}
        />
        <InputGroupAddon align="inline-end">
          <Kbd>/</Kbd>
        </InputGroupAddon>
      </InputGroup>
      <p className="ml-auto flex items-center gap-1.5 text-muted-foreground text-ui">
        {i18n.t('options.holdHint.before')} <Kbd>{triggerLabel()}</Kbd> {i18n.t('options.holdHint.after')}
      </p>
    </header>
  );
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));

/** `/` anywhere on the page, outside a field and without ⌘, Ctrl or ⌥, jumps to the search and selects its text. */
function useSlashFocus(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [input]);
}

function KeymapView({ keymap }: { keymap: Keymap }) {
  const [view, setView] = useState<View>('keyboard');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);
  const tabs = useOpenTabs();
  const editor = useKeyEditor(keymap);
  const { key, draft, stored } = editor;
  const autosave = useAutosave({ key, draft, stored });

  const openKeys = useMemo(() => {
    const urls = (tabs ?? []).map((tab) => tab.url);
    return new Set(
      KEYBOARD_ORDER.filter((k) => {
        const shortcut = keymap[k];
        return shortcut !== undefined && isOpenNow(shortcut, urls);
      }),
    );
  }, [keymap, tabs]);
  const matches = useMemo(
    () => (query.trim() === '' ? null : new Set(searchKeymap(keymap, query, 'options'))),
    [keymap, query],
  );
  const webTab = tabs === null ? undefined : lastWebTab(tabs);
  const used = Object.keys(keymap).length;

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = enterTarget(keymap, query, { assignedOnly: view === 'list' });
      if (target === null) return;
      editor.select(target);
      linkRef.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query === '') event.currentTarget.blur();
      else setQuery('');
    }
  };

  const onClear = () => {
    autosave.cancel();
    const change = clear(keymap, key);
    const cleared = editor.markCleared();
    void writeChange(change).then((result) => {
      if (result.ok) return;
      console.error('SpeedLink: could not clear', key, result.error);
      cleared.failed();
    });
  };

  const onTry = async () => {
    await autosave.flush();
    try {
      const reply = await sendMessage('tryKey', { key });
      if (reply.kind === 'failed') console.error('SpeedLink: Try could not open', key);
    } catch (error) {
      console.error('SpeedLink: Try could not reach the background', key, error);
    }
  };

  return (
    <>
      <Header search={{ query, onQueryChange: setQuery, onKeyDown: onSearchKeyDown, inputRef: searchRef }} />
      <main className="flex flex-wrap items-start gap-8 p-8">
        <section className="flex min-w-0 flex-1 basis-3xl flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-bold text-3xl tracking-tight">{i18n.t('options.heading')}</h1>
              <p className="text-muted-foreground text-sm">
                {i18n.t('options.subline.before')} <strong className="text-foreground">{triggerPlusKey()}</strong>{' '}
                {i18n.t('options.subline.after')} {i18n.t('options.subline.used', [used])}
              </p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label={i18n.t('options.view.label')}
              value={view}
              onValueChange={(value) => {
                if (value !== '') setView(value as View);
              }}
              className="bg-card"
            >
              <ToggleGroupItem value="keyboard">{i18n.t('options.view.keyboard')}</ToggleGroupItem>
              <ToggleGroupItem value="list">{i18n.t('options.view.list')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {view === 'keyboard' ? (
            <KeyboardCard
              keymap={keymap}
              openKeys={openKeys}
              selected={key}
              matches={matches}
              onSelect={editor.select}
            />
          ) : (
            <ListCard keymap={keymap} openKeys={openKeys} selected={key} matches={matches} onSelect={editor.select} />
          )}
        </section>
        <Inspector
          keyLabel={key}
          stored={stored}
          draft={draft}
          onDraftChange={editor.setDraft}
          openNow={openKeys.has(key) && stored !== undefined}
          webPage={webTab}
          saveState={autosave.state}
          onClear={onClear}
          onTry={() => void onTry()}
          linkRef={linkRef}
        />
      </main>
    </>
  );
}

export function OptionsPage() {
  const keymap = useKeymap();
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {keymap === null ? (
          <>
            <Header search={{ query: '', onQueryChange: () => {} }} />
            <p role="status" className="p-8 text-muted-foreground text-sm">
              {i18n.t('options.loading')}
            </p>
          </>
        ) : (
          <KeymapView keymap={keymap} />
        )}
      </div>
    </TooltipProvider>
  );
}
