import type { Run, WorkflowStatus } from '../../lib/types';

const WORKFLOW: Record<WorkflowStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'pill pill-ok' },
  paused: { label: 'Paused', cls: 'pill' },
  error: { label: 'Needs attention', cls: 'pill pill-bad' },
};
export function WorkflowStatusPill({ status }: { status: WorkflowStatus }) {
  const s = WORKFLOW[status] ?? { label: status, cls: 'pill' };
  return <span className={s.cls}>{s.label}</span>;
}

const RUN: Record<Run['status'], { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'pill pill-ok' },
  failed: { label: 'Failed', cls: 'pill pill-bad' },
  running: { label: 'Running', cls: 'pill pill-info' },
  retrying: { label: 'Retrying', cls: 'pill pill-warn' },
};
export function RunStatusPill({ status }: { status: Run['status'] }) {
  const s = RUN[status] ?? { label: status, cls: 'pill' };
  return <span className={s.cls}>{s.label}</span>;
}

export const TRIGGER: Record<string, string> = { webhook: 'When data arrives', schedule: 'On a schedule', event: 'On an event', manual: 'Started by MonkFlow' };
