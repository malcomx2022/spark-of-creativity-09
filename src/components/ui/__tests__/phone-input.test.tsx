import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PhoneInput } from '../phone-input';
import { BENIN_LOCAL_NUMBER_LENGTHS, BENIN_MOBILE_MONEY_PATTERN } from '@/lib/fedapay-phone';

afterEach(cleanup);

function Harness(props: { lengths?: number[]; onValue: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <PhoneInput
      aria-label="Téléphone"
      value={value}
      onChange={(next) => { setValue(next); props.onValue(next); }}
      countryCode="+229"
      localNumberLength={8}
      localNumberLengths={props.lengths}
      validationPattern={props.lengths ? BENIN_MOBILE_MONEY_PATTERN : undefined}
    />
  );
}

it('sans longueurs multiples, la saisie reste limitée à 8 chiffres (comportement inchangé)', async () => {
  const onValue = vi.fn();
  render(<Harness onValue={onValue} />);
  await userEvent.type(screen.getByLabelText('Téléphone'), '0166000001');
  expect(onValue).toHaveBeenLastCalledWith('+22901660000');
  expect(screen.getByText('8/8')).toBeInTheDocument();
  expect(screen.getByText('Saisissez 8 chiffres sans espaces')).toBeInTheDocument();
});

it('avec 8 ou 10 chiffres, accepte le format à 10 chiffres et coupe au-delà', async () => {
  const onValue = vi.fn();
  render(<Harness lengths={BENIN_LOCAL_NUMBER_LENGTHS} onValue={onValue} />);
  const input = screen.getByLabelText('Téléphone');
  expect(screen.getByText('Saisissez 8 ou 10 chiffres sans espaces')).toBeInTheDocument();

  await userEvent.type(input, '016600000');
  expect(screen.getByText('9/10')).toBeInTheDocument();
  await userEvent.type(input, '1234');
  expect(onValue).toHaveBeenLastCalledWith('+2290166000001');
  expect(screen.getByText('10/10')).toHaveClass('text-green-500');
});

it('un numéro à 10 chiffres sans préfixe 01 est signalé invalide', async () => {
  render(<Harness lengths={BENIN_LOCAL_NUMBER_LENGTHS} onValue={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Téléphone'), '9966000001');
  expect(screen.getByText('10/10')).toHaveClass('text-destructive');
});
