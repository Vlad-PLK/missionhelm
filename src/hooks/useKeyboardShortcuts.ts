'use client';

import { useEffect, useRef } from 'react';

interface KeyboardShortcutOptions {
  onSearch?: () => void;
  onNew?: () => void;
  onGoOperations?: () => void;
  onGoSystem?: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function useKeyboardShortcuts({
  onSearch,
  onNew,
  onGoOperations,
  onGoSystem,
}: KeyboardShortcutOptions) {
  const pendingSequenceRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearSequence = () => {
      pendingSequenceRef.current = null;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const queueSequence = (value: string) => {
      pendingSequenceRef.current = value;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(clearSequence, 900);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        clearSequence();
        return;
      }

      if (isEditableTarget(event.target)) {
        clearSequence();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === '/') {
        if (!onSearch) {
          return;
        }
        event.preventDefault();
        clearSequence();
        onSearch();
        return;
      }

      if (key === 'n' && onNew) {
        event.preventDefault();
        clearSequence();
        onNew();
        return;
      }

      if (pendingSequenceRef.current === 'g') {
        if (key === 'o' && onGoOperations) {
          event.preventDefault();
          clearSequence();
          onGoOperations();
          return;
        }

        if (key === 's' && onGoSystem) {
          event.preventDefault();
          clearSequence();
          onGoSystem();
          return;
        }

        clearSequence();
        return;
      }

      if (key === 'g') {
        queueSequence('g');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearSequence();
    };
  }, [onGoOperations, onGoSystem, onNew, onSearch]);
}
