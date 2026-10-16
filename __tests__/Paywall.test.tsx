import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { Paywall } from '@/components/Paywall';
import { api } from '@/lib/api';
import { loadPlan } from '@/lib/billing';
import { t, tn } from '@/lib/i18n';

import { applyEnv, flat, MATRIX } from './helpers';

// The store SDK and the server are faked: the screen is tested for what it shows and what it asks for.
jest.mock('@/lib/billing', () => ({
  billingAvailable: jest.fn(() => true),
  loadPlan: jest.fn(),
  buy: jest.fn(() => Promise.resolve(true)),
  restore: jest.fn(() => Promise.resolve()),
  openManage: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { me: jest.fn(), billingRefresh: jest.fn() },
}));

const me = (paid: string | null) => ({ family: { id: 'fam-1' }, access: { paid_until: paid, granted_until: null } });
const PRICE = '2 990 ₸';

beforeEach(() => {
  jest.mocked(api.me).mockResolvedValue(me(null) as never);
  jest.mocked(api.billingRefresh).mockResolvedValue({ active: false } as never);
  jest.mocked(loadPlan).mockResolvedValue({ pkg: {} as never, price: PRICE, trialDays: 7, period: 'P1M' });
});

// The paywall column is capped (640pt) and centred on tablets and foldables.
function expectCapped() {
  const scroll = screen.root!.queryAll((n) => !!n.props.contentContainerStyle, { includeSelf: true })[0];
  const st = flat(scroll.props.contentContainerStyle);
  expect(st.maxWidth).toBe(640);
  expect(st.alignSelf).toBe('center');
}

describe.each(MATRIX)('Paywall · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('parent with a store offer: trial title, the billed price, subscribe / restore / manage, legal links', async () => {
    await render(<Paywall role="parent" onActive={() => {}} />);
    expect(await screen.findByText(tn('parent.paywall.titleTrial', 7))).toBeOnTheScreen();
    expect(screen.getByText(tn('parent.paywall.trialLine', 7, { price: PRICE }))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('parent.paywall.subscribe') })).toBeEnabled();
    expect(screen.getByRole('button', { name: t('parent.paywall.restore') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('parent.paywall.manage') })).toBeOnTheScreen();
    expect(screen.getByText(t('parent.paywall.terms'))).toBeOnTheScreen();
    expect(screen.getByText(t('parent.paywall.privacy'))).toBeOnTheScreen();
    expectCapped();
  });

  it('child: asks a parent, offers only a re-check, no prices or store buttons', async () => {
    await render(<Paywall role="child" onActive={() => {}} />);
    expect(screen.getByText(t('parent.paywall.titleChild'))).toBeOnTheScreen();
    expect(screen.getByText(t('parent.paywall.textChild'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('parent.paywall.checkChild') })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t('parent.paywall.subscribe') })).toBeNull();
    expect(api.me).not.toHaveBeenCalled();
    expectCapped();
  });
});

describe('Paywall behaviour', () => {
  beforeEach(() => applyEnv({ width: 390, height: 844, lang: 'ru' }));

  it('a store offer that fails to load shows a translated retry instead of a dead button', async () => {
    jest.mocked(loadPlan).mockRejectedValueOnce(new Error('network'));
    await render(<Paywall role="parent" onActive={() => {}} />);
    expect(await screen.findByText(t('parent.paywall.planFail'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('parent.paywall.subscribeNoTrial') })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: t('common.retry') }));
    expect(await screen.findByText(tn('parent.paywall.titleTrial', 7))).toBeOnTheScreen();
  });

  it('the child re-check calls onActive once the server says the family is active again', async () => {
    jest.mocked(api.billingRefresh).mockResolvedValueOnce({ active: true } as never);
    const onActive = jest.fn();
    await render(<Paywall role="child" onActive={onActive} />);
    await fireEvent.press(screen.getByRole('button', { name: t('parent.paywall.checkChild') }));
    await waitFor(() => expect(onActive).toHaveBeenCalledTimes(1));
  });

  it('a renewing family (paid before) sees "subscription ended" and the plain subscribe button without a trial', async () => {
    jest.mocked(api.me).mockResolvedValue(me('2026-01-01') as never);
    jest.mocked(loadPlan).mockResolvedValue({ pkg: {} as never, price: PRICE, trialDays: null, period: 'P1M' });
    await render(<Paywall role="parent" onActive={() => {}} />);
    expect(await screen.findByText(t('parent.paywall.billedLine', { price: PRICE }))).toBeOnTheScreen();
    expect(screen.getByText(t('parent.paywall.titleParent'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('parent.paywall.subscribeNoTrial') })).toBeEnabled();
  });
});
