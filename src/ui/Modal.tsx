import { useEffect, useRef, type KeyboardEventHandler, type MouseEvent, type ReactNode } from 'react';

function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
}

export function Modal({
  label,
  className = '',
  children,
  onClose,
  onKeyDown,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPointerDown = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${className}`}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])')).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onPointerDown={(event) => { backdropPointerDown.current = isBackdrop(event); }}
      onClick={(event) => {
        if (backdropPointerDown.current && isBackdrop(event)) onClose();
      }}
    >
      <button className="dialog-close" type="button" onClick={onClose} aria-label={`Close ${label}`} autoFocus>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      {children}
    </dialog>
  );
}
