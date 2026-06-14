/**
 * Popover focus-trap state machine (RS §5a/§8b). Event-detail, day, and the `?` shortcuts
 * overlay are all focus-trapped, Escape-dismissible, and return focus to their trigger.
 *
 * The core owns the trap logic; the skin registers the ordered focusable element ids and
 * applies the focus target the core returns. This keeps a11y from forking across skins (S2-7).
 */
export type PopoverKey = 'Tab' | 'Shift+Tab' | 'Escape';

export interface PopoverFocusAction {
  /** Element id to move focus to (a focusable inside the popover, or the trigger on close). */
  focus: string | null;
  closed: boolean;
}

export interface PopoverFocusApi {
  isOpen(): boolean;
  /** Open, trapping focus among `focusables` (in tab order); remembers the trigger. */
  open(triggerId: string, focusables: string[]): PopoverFocusAction;
  close(): PopoverFocusAction;
  onKey(key: PopoverKey): PopoverFocusAction;
}

export function createPopoverFocus(): PopoverFocusApi {
  let open = false;
  let trigger: string | null = null;
  let focusables: string[] = [];
  let index = 0;

  const closed = (focus: string | null): PopoverFocusAction => ({ focus, closed: true });

  return {
    isOpen: () => open,
    open(triggerId, items) {
      open = true;
      trigger = triggerId;
      focusables = items.slice();
      index = 0;
      return { focus: focusables[0] ?? null, closed: false };
    },
    close() {
      if (!open) return closed(null);
      open = false;
      const t = trigger;
      trigger = null;
      focusables = [];
      return closed(t);
    },
    onKey(key) {
      if (!open) return closed(null);
      if (key === 'Escape') return this.close();
      if (focusables.length === 0) return { focus: null, closed: false };
      index =
        key === 'Tab'
          ? (index + 1) % focusables.length
          : (index - 1 + focusables.length) % focusables.length;
      return { focus: focusables[index] ?? null, closed: false };
    },
  };
}
