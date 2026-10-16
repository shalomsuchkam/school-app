import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChildTaskCard, ParentTaskCard } from '@/components/TaskCards';
import type { Task } from '@/lib/api';
import { t } from '@/lib/i18n';

import { applyEnv, MATRIX } from './helpers';

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  kind: 'lesson',
  label: 'Математика',
  emoji: '📐',
  light: false,
  needs_photo: true,
  required: true,
  status: 'todo',
  skip_reason: null,
  accepted: false,
  done_at: null,
  done_hm: null,
  note: null,
  parent_comment: null,
  photos: [],
  ...over,
});
const noop = () => {};
const child = { onPhoto: noop, onSkip: noop, onCheck: noop, onOpen: noop };

describe.each(MATRIX)('task cards · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('child photo task: label, status, camera and "no homework" buttons', async () => {
    await render(<ChildTaskCard t={task()} {...child} onNote={noop} />);
    expect(screen.getByText('Математика')).toBeOnTheScreen();
    expect(screen.getByText(t('child.st.needPhoto'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('child.card.takePhoto') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('child.card.noHw') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('child.note.add') })).toBeOnTheScreen();
  });

  it('child checklist item: a checkbox that reports the new state; overdue turns the status red', async () => {
    const onCheck = jest.fn();
    await render(<ChildTaskCard t={task({ kind: 'item', label: 'Форма', emoji: '👕', needs_photo: false })} {...child} onCheck={onCheck} overdue />);
    expect(screen.getByText(t('child.st.overdueChild'))).toBeOnTheScreen();
    const box = screen.getByRole('checkbox', { name: 'Форма' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);
  });

  it('child: the parent comment and the assigned note are shown', async () => {
    await render(<ChildTaskCard t={task({ status: 'redo', note: 'стр. 42, № 5', parent_comment: 'Переделай второй пример' })} {...child} />);
    expect(screen.getByText(t('child.st.redoChild'))).toBeOnTheScreen();
    expect(screen.getByText('стр. 42, № 5')).toBeOnTheScreen();
    expect(screen.getByText('Переделай второй пример')).toBeOnTheScreen();
  });

  it('parent: a skip request offers approve / decline and passes the action', async () => {
    const onAction = jest.fn();
    await render(<ParentTaskCard t={task({ status: 'skip_pending', skip_reason: 'Не задали' })} busy={false} onAction={onAction} onOpen={noop} />);
    expect(screen.getByText(`${t('child.st.asksSkip')}: Не задали`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('child.card.approve') }));
    await fireEvent.press(screen.getByRole('button', { name: t('child.card.decline') }));
    expect(onAction.mock.calls.map((c) => c[1])).toEqual(['skip_ok', 'skip_no']);
  });

  it('parent: a submitted photo can be accepted, sent back or undone; buttons lock while busy', async () => {
    await render(<ParentTaskCard t={task({ status: 'done', done_hm: '18:05' })} busy onAction={noop} onOpen={noop} />);
    expect(screen.getByText(`${t('child.st.submitted')} · 18:05`)).toBeOnTheScreen();
    for (const k of ['child.card.accept', 'child.card.redo', 'child.card.undo']) expect(screen.getByRole('button', { name: t(k) })).toBeDisabled();
  });
});
