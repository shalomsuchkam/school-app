import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CHAT_MAX, ChatButton, ChatSheet } from '@/components/ChatSheet';
import { api, ApiError, type Message, type Task } from '@/lib/api';
import { t } from '@/lib/i18n';

import { applyEnv, MATRIX } from './helpers';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { messages: jest.fn(), sendMessage: jest.fn() },
}));

const task = { id: 7, kind: 'lesson', label: 'Математика', emoji: '📐', messages: 2 } as Task;
const msg = (over: Partial<Message>): Message => ({ id: 1, role: 'child', name: 'Айгерим', body: 'Не понял задачу 3', created_at: '2026-10-19T13:05:00.000Z', mine: false, ...over });
const THREAD = [msg({}), msg({ id: 2, role: 'parent', name: 'Мама', body: 'Посмотри пример на стр. 42', mine: true })];

beforeEach(() => {
  jest.mocked(api.messages).mockResolvedValue(THREAD);
  jest.mocked(api.sendMessage).mockReset();
});

describe.each(MATRIX)('ChatSheet · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('shows the thread: their bubbles with the author name, mine without; reports the count', async () => {
    const onCount = jest.fn();
    await render(<ChatSheet task={task} onClose={() => {}} onCount={onCount} />);
    expect(await screen.findByText('Не понял задачу 3')).toBeOnTheScreen();
    expect(screen.getByText('Айгерим')).toBeOnTheScreen();
    expect(screen.getByText('Посмотри пример на стр. 42')).toBeOnTheScreen();
    expect(screen.queryByText('Мама')).toBeNull();
    expect(onCount).toHaveBeenCalledWith(7, 2);
    expect(api.messages).toHaveBeenCalledWith(7);
  });

  it('sends optimistically and keeps the server copy', async () => {
    jest.mocked(api.sendMessage).mockResolvedValue(msg({ id: 3, role: 'parent', body: 'Готово?', mine: true }));
    await render(<ChatSheet task={task} onClose={() => {}} />);
    await screen.findByText('Айгерим');
    const input = screen.getByLabelText(t('common.chat.ph'));
    await fireEvent.changeText(input, '  Готово?  ');
    await fireEvent.press(screen.getByRole('button', { name: t('common.chat.send') }));
    expect(api.sendMessage).toHaveBeenCalledWith(7, 'Готово?');
    expect(await screen.findByText('Готово?')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText(t('common.chat.sending'))).toBeNull());
    expect(screen.getByLabelText(t('common.chat.ph')).props.value).toBe('');
  });

  it('a refused message stays as "not sent" and is retried on tap', async () => {
    jest.mocked(api.sendMessage).mockRejectedValueOnce(new ApiError('Сообщение длиннее 500 символов', 400)).mockResolvedValueOnce(msg({ id: 4, body: 'Привет', mine: true }));
    await render(<ChatSheet task={task} onClose={() => {}} />);
    await screen.findByText('Айгерим');
    await fireEvent.changeText(screen.getByLabelText(t('common.chat.ph')), 'Привет');
    await fireEvent.press(screen.getByRole('button', { name: t('common.chat.send') }));
    const failed = await screen.findByRole('button', { name: `Привет. ${t('common.chat.failed')}` });
    expect(screen.getByText('Сообщение длиннее 500 символов')).toBeOnTheScreen();
    await fireEvent.press(failed);
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(t('common.chat.failed'))).toBeNull());
  });

  it('viewers read only: no composer', async () => {
    await render(<ChatSheet task={task} readOnly onClose={() => {}} />);
    await screen.findByText('Айгерим');
    expect(screen.queryByLabelText(t('common.chat.ph'))).toBeNull();
    expect(screen.getByText(t('common.chat.readOnly'))).toBeOnTheScreen();
  });

  it('the composer is capped at 500 characters and cannot send blanks', async () => {
    await render(<ChatSheet task={task} onClose={() => {}} />);
    await screen.findByText('Айгерим');
    expect(screen.getByLabelText(t('common.chat.ph')).props.maxLength).toBe(CHAT_MAX);
    expect(screen.getByRole('button', { name: t('common.chat.send') })).toBeDisabled();
  });
});

describe('ChatSheet polling', () => {
  beforeEach(() => applyEnv({ width: 390, height: 844, lang: 'ru' }));
  afterEach(() => jest.useRealTimers());

  it('polls every 5 s while open and stops when closed', async () => {
    jest.useFakeTimers();
    const view = await render(<ChatSheet task={task} onClose={() => {}} />);
    expect(api.messages).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(api.messages).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(api.messages).toHaveBeenCalledTimes(4);
    await view.rerender(<ChatSheet task={null} onClose={() => {}} />);
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(api.messages).toHaveBeenCalledTimes(4);
  });

  it('the card button shows the count', async () => {
    const onPress = jest.fn();
    await render(<ChatButton count={3} label="Математика" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: t('common.chat.openN', { name: 'Математика', n: 3 }) }));
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalled();
  });
});
