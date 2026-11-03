import { fireEvent, render, screen } from '@testing-library/react-native';
import { MinutesPicker } from '@/components/screen/AppPicker';
import { duration } from '@/lib/format';
import { t } from '@/lib/i18n';

it('lets a parent choose a one-minute app limit directly', async () => {
  const change = jest.fn();
  await render(<MinutesPicker value={60} onChange={change} />);
  await fireEvent.press(screen.getByText(duration(1)));
  expect(change).toHaveBeenCalledWith(1);
});

it('can reduce fifteen minutes to one minute without allowing zero', async () => {
  const change = jest.fn();
  const view = await render(<MinutesPicker value={15} onChange={change} />);
  await fireEvent.press(screen.getByLabelText(t('screen.min.less')));
  expect(change).toHaveBeenLastCalledWith(1);
  change.mockClear();
  await view.rerender(<MinutesPicker value={1} onChange={change} />);
  await fireEvent.press(screen.getByLabelText(t('screen.min.less')));
  expect(change).not.toHaveBeenCalled();
});
