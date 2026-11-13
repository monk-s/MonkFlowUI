import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  open: boolean;
  secondsLeft: number;
  onStay: () => void;
  onSignOut: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Shown two minutes before the workspace's idle limit. It cannot be dismissed
 * by clicking outside or pressing Escape: staying signed in is a deliberate
 * choice, which is the point of an idle timeout.
 */
export function IdleTimeoutDialog({ open, secondsLeft, onStay, onSignOut }: Props) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title>Still there?</Dialog.Title>
          <Dialog.Description className="dialog-desc">
            For your firm's security you will be signed out after a period without activity.
          </Dialog.Description>
          <p aria-live="polite" className="num" style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>
            {clock(secondsLeft)}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onSignOut}>Sign out now</button>
            <button type="button" className="btn btn-primary" onClick={onStay} autoFocus>Stay signed in</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
