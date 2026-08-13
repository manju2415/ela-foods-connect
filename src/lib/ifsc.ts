export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export interface IfscDetails {
  bank: string;
  branch: string;
  address?: string;
  city?: string;
  state?: string;
}

export function isValidIfscFormat(code: string): boolean {
  return IFSC_REGEX.test(code.trim().toUpperCase());
}

/** Looks up an IFSC code using the public Razorpay IFSC directory. */
export async function lookupIfsc(code: string): Promise<IfscDetails | null> {
  const clean = code.trim().toUpperCase();
  if (!isValidIfscFormat(clean)) return null;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.BANK) return null;
    return {
      bank: data.BANK,
      branch: data.BRANCH,
      address: data.ADDRESS,
      city: data.CITY,
      state: data.STATE,
    };
  } catch {
    return null;
  }
}
