// The Keyboard view (product spec §8.1, §8.7): every key in its state, the legend, and drag-to-swap. Selection
// and what a drop writes are the page's.
import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { cn } from 'cn';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap, type KeyCapState } from '@/components/KeyCap';
import { ARROWS, neighbourKey } from '@/domain/key-grid';
import type { Keymap } from '@/domain/keymap-ops';
import { isAssignable, type Key, type KeyLabel } from '@/domain/keys';
import { displayName, monogram } from '@/domain/shortcut';
import { chordLabel, type Platform } from '@/platform/platform-labels';

/** A drag in progress: the key being carried and the key it would land on, if any. */
export interface DragFrame {
  source: Key;
  target: Key | null;
}

/** What both views of the keymap show and report. */
export interface KeymapViewProps {
  keymap: Keymap;
  /** Keys whose shortcut is open in a tab right now. */
  openKeys: ReadonlySet<Key>;
  selected: Key;
  /** The keys a search matches, or null with no search: every other key is dimmed. */
  matches?: ReadonlySet<Key> | null;
  onSelect: (key: Key) => void;
  platform?: Platform;
}

export interface KeyboardCardProps extends KeymapViewProps {
  /** A shortcut was dropped from one key onto another. */
  onDrop: (from: Key, to: Key) => void;
  /** Freezes the card mid-drag, for the gallery. */
  frozenDrag?: DragFrame;
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('size-3 rounded-sm border', className)} />;
}

const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] };

interface Point {
  x: number;
  y: number;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const centreOf = (box: Box): Point => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
const contains = (box: Box, { x, y }: Point) =>
  x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;

/** The key under the point, read from the rendered droppable rects. */
function keyAt(rects: ReadonlyMap<string | number, Box>, point: Point): Key | null {
  for (const [id, rect] of rects) if (contains(rect, point)) return id as Key;
  return null;
}

/** The key under the pointer, or under the centre of the keyboard-moved key; never the key being dragged. */
const keyUnderDrag: CollisionDetection = ({
  active,
  collisionRect,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  const point = pointerCoordinates ?? centreOf(collisionRect);
  const hit = droppableContainers.find((container) => {
    const rect = droppableRects.get(container.id);
    return container.id !== active.id && rect !== undefined && contains(rect, point);
  });
  return hit === undefined ? [] : [{ id: hit.id, data: { droppableContainer: hit, value: 0 } }];
};

/** An arrow jumps to the neighbouring key on the staggered grid, passing over S. */
const keyToKey: KeyboardCoordinateGetter = (event, { active, context }) => {
  const direction = ARROWS[event.code];
  if (direction === undefined) return undefined;
  event.preventDefault();
  const { collisionRect, droppableRects } = context;
  const current = (collisionRect === null ? null : keyAt(droppableRects, centreOf(collisionRect))) ?? (active as Key);
  const next = neighbourKey(current, direction);
  const rect = next === null ? undefined : droppableRects.get(next);
  return rect === undefined ? undefined : { x: rect.left, y: rect.top };
};

/** One assignable key: always a drop target, and draggable while it holds a shortcut. */
function DragKey({
  label,
  draggable,
  nodes,
  children,
}: {
  label: Key;
  draggable: boolean;
  nodes: Map<Key, HTMLElement>;
  children: (props: Record<string, unknown>) => ReactNode;
}) {
  const drag = useDraggable({ id: label, disabled: !draggable });
  const drop = useDroppable({ id: label });
  const ref = (node: HTMLElement | null) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
    if (node === null) nodes.delete(label);
    else nodes.set(label, node);
  };
  // Only the instructions: dnd-kit's role, tabIndex and aria-pressed would clash with the KeyCap button's own.
  const describedBy = draggable ? drag.attributes['aria-describedby'] : undefined;
  return children({ ref, 'aria-describedby': describedBy, ...drag.listeners });
}

export function KeyboardCard({
  keymap,
  openKeys,
  selected,
  matches = null,
  onSelect,
  onDrop,
  frozenDrag,
  platform,
}: KeyboardCardProps) {
  const [liveDrag, setLiveDrag] = useState<DragFrame | null>(null);
  const drag = frozenDrag ?? liveDrag;
  const nodes = useRef(new Map<Key, HTMLElement>()).current;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES, coordinateGetter: keyToKey }),
  );

  // The announcements outlive a render: they read the keymap as it is when they speak.
  const live = useRef(keymap);
  live.current = keymap;
  const chord = (id: string | number) => chordLabel(id as Key, platform);
  const named = (id: string | number) => {
    const shortcut = live.current[id as Key];
    return shortcut === undefined ? undefined : displayName(shortcut);
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => i18n.t('options.drag.pickedUp', [chord(active.id), named(active.id) ?? '']),
    onDragOver: ({ over }) => {
      if (over === null) return i18n.t('options.drag.overNone');
      const name = named(over.id);
      return name === undefined
        ? i18n.t('options.drag.overFree', [chord(over.id)])
        : i18n.t('options.drag.overAssigned', [chord(over.id), name]);
    },
    onDragEnd: ({ active, over }) => {
      if (over === null) return i18n.t('options.drag.unchanged');
      return named(over.id) === undefined
        ? i18n.t('options.drag.moved', [chord(over.id)])
        : i18n.t('options.drag.swapped', [chord(active.id), chord(over.id)]);
    },
    onDragCancel: () => i18n.t('options.drag.cancelled'),
  };

  // A remote change freed the key being carried. dnd-kit has no cancel call, so press Esc for it: both sensors
  // cancel on an Escape keydown on the document.
  const carried = liveDrag?.source;
  useEffect(() => {
    if (carried !== undefined && keymap[carried] === undefined)
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  }, [carried, keymap]);

  const keyCapOf = (label: Key, extra: Record<string, unknown> = {}) => {
    const shortcut = keymap[label];
    const state: KeyCapState =
      drag?.target === label
        ? 'drop-target'
        : label === selected
          ? 'selected'
          : shortcut === undefined
            ? 'free'
            : 'assigned';
    return (
      <KeyCap
        label={label}
        state={state}
        open={openKeys.has(label)}
        monogram={shortcut === undefined ? undefined : monogram(shortcut)}
        name={shortcut === undefined ? undefined : displayName(shortcut)}
        dimmed={drag?.source === label || (matches !== null && !matches.has(label))}
        platform={platform}
        onClick={() => onSelect(label)}
        {...extra}
      />
    );
  };

  /** The copy of the carried key that follows the pointer: out of the tab order and the accessibility tree. */
  const lifted = (source: Key, className?: string) => {
    const shortcut = keymap[source];
    return (
      <KeyCap
        label={source}
        state={source === selected ? 'selected' : 'assigned'}
        monogram={shortcut === undefined ? undefined : monogram(shortcut)}
        name={shortcut === undefined ? undefined : displayName(shortcut)}
        platform={platform}
        aria-hidden="true"
        tabIndex={-1}
        className={cn('cursor-grabbing shadow-lg', className)}
      />
    );
  };

  const renderKey = (label: KeyLabel) => {
    if (!isAssignable(label)) return <KeyCap label={label} state="reserved" platform={platform} />;
    if (frozenDrag !== undefined) {
      if (frozenDrag.target !== label) return keyCapOf(label);
      return (
        <span className="relative inline-flex">
          {keyCapOf(label)}
          {lifted(frozenDrag.source, 'absolute -top-3 left-4')}
        </span>
      );
    }
    return (
      <DragKey label={label} draggable={keymap[label] !== undefined} nodes={nodes}>
        {(props) => keyCapOf(label, props)}
      </DragKey>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={keyUnderDrag}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: i18n.t('options.drag.instructions') },
        restoreFocus: false,
      }}
      onDragStart={({ active }) => setLiveDrag({ source: active.id as Key, target: null })}
      onDragOver={({ active, over }) =>
        setLiveDrag({ source: active.id as Key, target: over === null ? null : (over.id as Key) })
      }
      onDragCancel={() => setLiveDrag(null)}
      onDragEnd={({ active, over, activatorEvent }) => {
        setLiveDrag(null);
        if (over === null || over.id === active.id) return;
        // Space on a focused button clicks it on keyup: move focus with the shortcut, so that click can't
        // select the source again after the selection followed the drop.
        if (activatorEvent instanceof KeyboardEvent) nodes.get(over.id as Key)?.focus();
        onDrop(active.id as Key, over.id as Key);
      }}
    >
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
          <li className="ml-auto">{i18n.t('options.legend.drag')}</li>
        </ul>
      </div>
      <DragOverlay dropAnimation={null}>{liveDrag === null ? null : lifted(liveDrag.source)}</DragOverlay>
    </DndContext>
  );
}
