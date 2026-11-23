// Cmd/Ctrl+K: jump to a page, switch workspace, sign out.
// Later phases add documents and workflows to the same list.
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut } from 'lucide-react';
import { useSession } from '../auth/session';
import { useData } from '../data/PortalDataSource';
import type { NavItem } from './AppShell';

export function CommandPalette({ open, onOpenChange, items }: { open: boolean; onOpenChange: (v: boolean) => void; items: NavItem[] }) {
  const navigate = useNavigate();
  const { session, switchWorkspace, signOut } = useSession();
  const run = (fn: () => void) => { onOpenChange(false); fn(); };
  const others = (session?.workspaces ?? []).filter((w) => w.id !== session?.org?.id);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="palette" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Jump to</Dialog.Title>
          <Command label="Jump to">
            <Command.Input placeholder="Jump to a page or workspace…" autoFocus />
            <Command.List>
              <Command.Empty>Nothing matches.</Command.Empty>
              <Command.Group heading="Pages">
                {items.map((i) => (
                  <Command.Item key={i.to} value={i.label} onSelect={() => run(() => navigate(i.to))}><i.icon aria-hidden />{i.label}</Command.Item>
                ))}
              </Command.Group>
              {others.length > 0 && (
                <Command.Group heading="Switch workspace">
                  {others.map((w) => (
                    <Command.Item key={w.id} value={`workspace ${w.name}`} onSelect={() => run(() => { void switchWorkspace(w.id).then(() => navigate('/dashboard')); })}>
                      <Building2 aria-hidden />{w.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Account">
                <Command.Item value="sign out" onSelect={() => run(() => void signOut())}><LogOut aria-hidden />{useData().demo ? 'Leave the demo' : 'Sign out'}</Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
