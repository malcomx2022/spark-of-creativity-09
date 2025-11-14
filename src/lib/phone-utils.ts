export interface PhoneNormalizationOptions {
  /**
   * Country code (with leading +) to prepend when a local number is provided.
   * Defaults to Benin (+229) because most flows target BJ mobile money.
   */
  defaultCountryCode?: string;
  /**
   * Local number lengths that should receive the default country code automatically.
   */
  localNumberLengths?: number[];
  /**
   * Minimum amount of digits (excluding the + sign) accepted for an international number.
   */
  minLength?: number;
  /**
   * Maximum amount of digits (excluding the + sign) accepted for an international number.
   */
  maxLength?: number;
}

const DEFAULT_OPTIONS: Required<Pick<PhoneNormalizationOptions, 'defaultCountryCode' | 'localNumberLengths' | 'minLength' | 'maxLength'>> = {
  defaultCountryCode: '+229',
  localNumberLengths: [8],
  minLength: 8,
  maxLength: 15,
};

function stripToDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function normaliseCountryCode(countryCode: string | undefined): string | null {
  if (!countryCode) return null;
  const digits = stripToDigits(countryCode);
  return digits ? `+${digits}` : null;
}

export function normalizePhoneNumber(
  input: string,
  options: PhoneNormalizationOptions = {},
): string | null {
  if (!input) return null;

  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    localNumberLengths: options.localNumberLengths ?? DEFAULT_OPTIONS.localNumberLengths,
  };

  const trimmed = input.trim();
  if (!trimmed) return null;

  let value = trimmed.replace(/[^0-9+]/g, '');
  if (!value) return null;

  if ((value.match(/\+/g) ?? []).length > 1) {
    return null;
  }

  if (value.startsWith('00')) {
    value = `+${value.slice(2)}`;
  }

  if (!value.startsWith('+')) {
    const digits = stripToDigits(value);
    const defaultCode = normaliseCountryCode(mergedOptions.defaultCountryCode);

    if (
      defaultCode &&
      mergedOptions.localNumberLengths?.includes(digits.length)
    ) {
      value = `${defaultCode}${digits}`;
    } else {
      value = `+${digits}`;
    }
  }

  const digits = stripToDigits(value);
  if (
    digits.length < mergedOptions.minLength ||
    digits.length > mergedOptions.maxLength
  ) {
    return null;
  }

  return `+${digits}`;
}

export interface PhoneValidationOptions extends PhoneNormalizationOptions {
  /**
   * Optional pattern (must include the leading +) to validate the normalised number against.
   */
  pattern?: RegExp;
}

export function isValidPhoneNumber(
  input: string,
  options: PhoneValidationOptions = {},
): boolean {
  const normalised = normalizePhoneNumber(input, options);
  if (!normalised) return false;

  if (options.pattern && !options.pattern.test(normalised)) {
    return false;
  }

  return true;
}
