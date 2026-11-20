export interface CountryDialOption {
  code: string;
  iso: string;
  label: string;
  example: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '+91', iso: 'IN', label: 'India (+91)', example: '98765 43210' },
  { code: '+1', iso: 'US', label: 'US / Canada (+1)', example: '415 555 0199' },
  { code: '+44', iso: 'GB', label: 'United Kingdom (+44)', example: '7700 900123' },
  { code: '+971', iso: 'AE', label: 'UAE (+971)', example: '50 123 4567' },
  { code: '+65', iso: 'SG', label: 'Singapore (+65)', example: '8123 4567' },
  { code: '+61', iso: 'AU', label: 'Australia (+61)', example: '412 345 678' },
  { code: '+49', iso: 'DE', label: 'Germany (+49)', example: '151 23456789' },
];

export interface PhoneValidationResult {
  valid: boolean;
  e164: string | null;
  countryCode: string;
  nationalNumber: string;
  masked: string | null;
  error: string | null;
}

export function maskE164Phone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length <= 4) return e164;
  const knownPrefix = [...COUNTRY_DIAL_OPTIONS]
    .map((c) => c.code.slice(1))
    .sort((a, b) => b.length - a.length)
    .find((p) => digits.startsWith(p));
  const cc = knownPrefix ? `+${knownPrefix}` : e164.slice(0, 3);
  const ccDigitLen = cc.length - 1;
  const last4 = digits.slice(-4);
  const maskedCount = Math.max(4, digits.length - ccDigitLen - 4);
  return `${cc} ${'•'.repeat(maskedCount)}${last4}`;
}

export function normalizeAndValidatePhone(
  rawInput: string,
  selectedCountryCode = '+91'
): PhoneValidationResult {
  const cleanCC = selectedCountryCode.startsWith('+')
    ? `+${selectedCountryCode.replace(/[^\d]/g, '')}`
    : `+${selectedCountryCode.replace(/[^\d]/g, '')}`;

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      e164: null,
      countryCode: cleanCC,
      nationalNumber: '',
      masked: null,
      error: 'Please enter your mobile number.',
    };
  }

  // Reject alphabetic characters (only digits, +, spaces, hyphens, parentheses allowed)
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      e164: null,
      countryCode: cleanCC,
      nationalNumber: '',
      masked: null,
      error: 'Phone number cannot contain letters.',
    };
  }

  const hasExplicitPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[^\d]/g, '');

  // Handle explicit international prefix 00 -> treat digits after 00 as E.164
  const hasDoubleZero = !hasExplicitPlus && trimmed.startsWith('00') && digits.length > 9;
  if (hasDoubleZero) {
    digits = digits.slice(2);
  }

  let effectiveCC = cleanCC;
  let national = digits;

  if (hasExplicitPlus || hasDoubleZero) {
    // Match longest known country code prefix first, fallback to cleanCC if matching
    const sortedCCs = [...COUNTRY_DIAL_OPTIONS]
      .map((c) => c.code.slice(1))
      .sort((a, b) => b.length - a.length);
    const matched = sortedCCs.find((prefix) => digits.startsWith(prefix));
    if (matched) {
      effectiveCC = `+${matched}`;
      national = digits.slice(matched.length);
    } else if (/^[1-9]\d{6,14}$/.test(digits)) {
      const e164 = `+${digits}`;
      return {
        valid: true,
        e164,
        countryCode: effectiveCC,
        nationalNumber: digits,
        masked: maskE164Phone(e164),
        error: null,
      };
    } else {
      return {
        valid: false,
        e164: null,
        countryCode: cleanCC,
        nationalNumber: digits,
        masked: null,
        error: 'Enter a valid international phone number in E.164 format (7–15 digits).',
      };
    }
  } else {
    const ccDigits = cleanCC.slice(1);
    // Strip leading trunk 0 (e.g. 09876543210 in India or 07700900123 in UK)
    if (national.startsWith('0') && national.length > 8) {
      national = national.replace(/^0+/, '');
    }
    // Strip leading country code if user pasted e.g. 919876543210 into +91 input
    if (
      ccDigits === '91' &&
      national.length === 12 &&
      national.startsWith('91') &&
      /^[6-9]/.test(national.slice(2))
    ) {
      national = national.slice(2);
    } else if (
      ccDigits !== '91' &&
      national.startsWith(ccDigits) &&
      national.length - ccDigits.length >= 7
    ) {
      national = national.slice(ccDigits.length);
    }
  }

  // Country-specific strict validation
  if (effectiveCC === '+91') {
    if (!/^\d{10}$/.test(national)) {
      return {
        valid: false,
        e164: null,
        countryCode: '+91',
        nationalNumber: national,
        masked: null,
        error: 'Indian mobile numbers must be exactly 10 digits (e.g., 9876543210).',
      };
    }
    if (!/^[6-9]/.test(national)) {
      return {
        valid: false,
        e164: null,
        countryCode: '+91',
        nationalNumber: national,
        masked: null,
        error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
      };
    }
    if (/^(\d)\1{9}$/.test(national)) {
      return {
        valid: false,
        e164: null,
        countryCode: '+91',
        nationalNumber: national,
        masked: null,
        error: 'Please enter a real mobile number (repeating digits are invalid).',
      };
    }
    const e164 = `+91${national}`;
    return {
      valid: true,
      e164,
      countryCode: '+91',
      nationalNumber: national,
      masked: maskE164Phone(e164),
      error: null,
    };
  }

  // General international validation (E.164 requires 7..15 total digits after +)
  const ccDigits = effectiveCC.slice(1);
  if (!/^[1-9]\d{0,3}$/.test(ccDigits)) {
    return {
      valid: false,
      e164: null,
      countryCode: effectiveCC,
      nationalNumber: national,
      masked: null,
      error: 'Invalid country dialing code.',
    };
  }

  const combinedDigits = `${ccDigits}${national}`;
  if (!/^\d{6,13}$/.test(national) || !/^[1-9]\d{6,14}$/.test(combinedDigits)) {
    return {
      valid: false,
      e164: null,
      countryCode: effectiveCC,
      nationalNumber: national,
      masked: null,
      error: 'Enter a valid mobile number (7–15 digits including country code).',
    };
  }

  if (/^(\d)\1+$/.test(national)) {
    return {
      valid: false,
      e164: null,
      countryCode: effectiveCC,
      nationalNumber: national,
      masked: null,
      error: 'Please enter a valid mobile number.',
    };
  }

  const e164 = `+${combinedDigits}`;
  return {
    valid: true,
    e164,
    countryCode: effectiveCC,
    nationalNumber: national,
    masked: maskE164Phone(e164),
    error: null,
  };
}

export function detectOutboundCallIntent(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;

  const patterns = [
    /\bcall\s+me\b/i,
    /\bgive\s+me\s+a\s+call\b/i,
    /\bring\s+my\s+(phone|number|mobile)\b/i,
    /\bring\s+me\b/i,
    /\btalk\s+(to\s+you\s+)?on\s+(the\s+)?phone\b/i,
    /\bspeak\s+(to\s+you\s+)?on\s+(the\s+)?phone\b/i,
    /\bover\s+a\s+(phone\s+)?call\b/i,
    /\bexplain\b.{0,40}\bover\s+(a\s+)?call\b/i,
    /\bphone\s+call\b/i,
    /\bvoice\s+call\b/i,
    /\boutbound\s+call\b/i,
    /\bcall\s+my\s+(number|mobile|phone)\b/i,
    /\bmujhe\s+call\b/i,
    /\bcall\s+kar(o|na|iye)?\b/i,
  ];

  return patterns.some((rx) => rx.test(normalized));
}

export function extractPhoneCandidateFromText(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  // Look for explicit +CC... or standalone 10-13 digit number sequence
  const match = trimmed.match(/(\+?\d[\d\s\-().]{7,18}\d)/);
  if (!match) return null;
  const candidate = match[1].trim();
  const digitsOnly = candidate.replace(/[^\d]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return null;
  return candidate;
}

export function detectCallConfirmationReply(
  message: string
): 'confirm' | 'cancel' | null {
  const norm = message.trim().toLowerCase().replace(/[.!,?]+$/g, '');
  if (!norm) return null;

  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|confirm|proceed|go ahead|yes please|yes call|call now|do it|haan|ha)$/i.test(
      norm
    )
  ) {
    return 'confirm';
  }

  if (
    /^(no|nope|nah|cancel|stop|nevermind|never mind|abort|don't call|do not call|mat karo)$/i.test(
      norm
    )
  ) {
    return 'cancel';
  }

  return null;
}
