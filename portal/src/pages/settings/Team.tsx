// Settings > Team: who has access, in what role, and pending invitations.
// Admins can invite, change roles and remove people; everyone else can read.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { UserPlus } from 'lucide-react';
import { useSession } from '../../auth/session';
import { initials } from '../../auth/SelectWorkspace';
import { EmptyState, LoadError, TableSkeleton } from '../../components/Page';
import { useData, type MemberRole } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { relativeTime, shortDate } from '../../lib/format';
import { ROLE_HELP } from '../../lib/roles';
import type { TeamMember } from '../../lib/types';

export function Team() {
  const data = useData();
  const { session, can } = useSession();
  const queryClient = useQueryClient();
  const manage = can('team.manage');
  const key = ['team', session?.org?.id];

  const team = useQuery({ queryKey: key, queryFn: () => data.getTeam() });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string } | null>(null);

  const after = (text: string, kind: 'ok' | 'warn' = 'ok') => { setFlash({ kind, text }); void queryClient.invalidateQueries({ queryKey: key }); };
  const failed = (err: unknown) => setFlash({ kind: 'bad', text: errorMessage(err) });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: MemberRole }) => data.updateMember(v.id, { role: v.role }),
    onSuccess: () => after('Role updated. It applies from their next action.'),
    onError: (err) => { failed(err); void queryClient.invalidateQueries({ queryKey: key }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => data.removeMember(id),
    onSuccess: () => { setRemoving(null); after('Access removed. They have been signed out of this workspace.'); },
    onError: (err) => { setRemoving(null); failed(err); },
  });
  const resend = useMutation({
    mutationFn: (id: string) => data.resendInvitation(id),
    onSuccess: (r) => after(r.emailSent ? 'A new invitation was sent. The earlier link no longer works.' : 'A new invitation was created, but the email could not be sent. Try resending.', r.emailSent ? 'ok' : 'warn'),
    onError: failed,
  });
  const revoke = useMutation({ mutationFn: (id: string) => data.revokeInvitation(id), onSuccess: () => after('Invitation withdrawn.'), onError: failed });

  return (
    <>
      {flash && <div className={`notice notice-${flash.kind}`} role="status"><div style={{ flex: 1 }}>{flash.text}</div><button type="button" className="link-btn" onClick={() => setFlash(null)}>Dismiss</button></div>}

      <section className="card" aria-labelledby="people">
        <div className="card-head">
          <h2 id="people">People{team.data ? <span className="muted num" style={{ fontWeight: 500 }}> · {team.data.members.length}</span> : null}</h2>
          {manage && <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}><UserPlus aria-hidden />Invite</button>}
        </div>
        {team.isPending && <TableSkeleton rows={3} cols={5} />}
        {team.isError && <div className="card-body"><LoadError message={errorMessage(team.error)} onRetry={() => void team.refetch()} /></div>}
        {team.data && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Role</th><th>Signs in with</th><th>Last active</th>{manage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {team.data.members.map((m) => {
                  const name = `${m.firstName} ${m.lastName}`.trim() || m.email;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="person">
                          <span className="avatar" aria-hidden>{initials(name)}</span>
                          <span className="who"><strong>{name}{m.isYou && <span className="tag" style={{ marginLeft: 8 }}>You</span>}</strong><span>{m.email}</span></span>
                        </div>
                      </td>
                      <td>
                        {manage ? (
                          <select className="select" style={{ height: 30, width: 'auto', fontSize: 'var(--text-base)' }} aria-label={`Role for ${name}`}
                            value={m.role} disabled={changeRole.isPending}
                            onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as MemberRole })}>
                            {team.data.roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        ) : m.roleLabel}
                        {m.status === 'suspended' && <span className="pill pill-warn" style={{ marginLeft: 8 }}>Suspended</span>}
                      </td>
                      <td>{m.signInMethod === 'sso' ? 'Firm sign-in (SSO)' : 'Password'}</td>
                      <td className="muted num">{relativeTime(m.lastActiveAt)}</td>
                      {manage && <td className="cell-actions">{!m.isYou && <button type="button" className="btn btn-ghost btn-danger" onClick={() => setRemoving(m)}>Remove</button>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manage && team.data && (
        <section className="card" aria-labelledby="pending">
          <div className="card-head"><h2 id="pending">Pending invitations</h2></div>
          {team.data.invitations.length === 0 ? (
            <EmptyState title="No invitations waiting">People you invite appear here until they accept. Invitations expire after 7 days.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Email</th><th>Role</th><th>Sent</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {team.data.invitations.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{i.roleLabel}</td>
                      <td className="muted num">{relativeTime(i.createdAt)}</td>
                      <td>
                        {i.expired ? <span className="pill pill-bad">Expired {shortDate(i.expiresAt)}</span>
                          : i.openedAt ? <span className="pill pill-info">Opened, not accepted</span>
                            : <span className="pill">Sent, expires {shortDate(i.expiresAt)}</span>}
                      </td>
                      <td className="cell-actions">
                        <button type="button" className="btn btn-ghost" disabled={resend.isPending} onClick={() => resend.mutate(i.id)}>Resend</button>
                        <button type="button" className="btn btn-ghost btn-danger" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>Withdraw</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen}
        onDone={(email, sent) => after(sent ? `Invitation sent to ${email}.` : `Invitation created for ${email}, but the email could not be sent. Use Resend.`, sent ? 'ok' : 'warn')} />

      <Dialog.Root open={!!removing} onOpenChange={(v) => { if (!v) setRemoving(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Remove {removing ? (`${removing.firstName} ${removing.lastName}`.trim() || removing.email) : ''}?</Dialog.Title>
            <Dialog.Description className="dialog-desc">
              They lose access to {session?.org?.name} immediately and are signed out. What they did stays in the audit log. You can invite them again later.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancel</Dialog.Close>
              <button type="button" className="btn btn-primary" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
                {remove.isPending ? 'Removing…' : 'Remove access'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function InviteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: (email: string, sent: boolean) => void }) {
  const data = useData();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('reviewer');
  const [error, setError] = useState('');
  const invite = useMutation({
    mutationFn: () => data.invite(email.trim(), role),
    onSuccess: (r) => { onDone(email.trim(), r.emailSent); setEmail(''); setRole('reviewer'); setError(''); onOpenChange(false); },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid work email address.');
    setError('');
    invite.mutate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) setError(''); onOpenChange(v); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Invite someone</Dialog.Title>
          <Dialog.Description className="dialog-desc">They get an email with a link that works once and expires in 7 days.</Dialog.Description>
          <form className="dialog-body" onSubmit={submit} noValidate>
            {error && <div className="notice notice-bad" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="invite-email">Work email</label>
              <input id="invite-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoFocus required />
            </div>
            <fieldset className="field" style={{ border: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>Role</legend>
              <div className="radio-list">
                {(['admin', 'reviewer', 'auditor'] as MemberRole[]).map((r) => (
                  <label key={r} className="radio">
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                    <span><strong>{{ admin: 'Admin / Managing Partner', reviewer: 'Operations / Analyst Reviewer', auditor: 'Read-Only Auditor' }[r]}</strong><span>{ROLE_HELP[r]}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="dialog-actions" style={{ marginTop: 0 }}>
              <Dialog.Close type="button" className="btn">Cancel</Dialog.Close>
              <button type="submit" className="btn btn-primary" disabled={invite.isPending}>{invite.isPending ? 'Sending…' : 'Send invitation'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
