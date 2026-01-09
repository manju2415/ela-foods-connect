/**
 * Masks a phone number for privacy
 * Example: +91 9876543210 -> +91 98****3210
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return 'N/A';
  
  // Remove all spaces and special characters for processing
  const cleaned = phone.replace(/\s+/g, '');
  
  // If phone number is too short, just mask middle characters
  if (cleaned.length <= 6) {
    return phone.substring(0, 2) + '****';
  }
  
  // Keep first 4 and last 4 characters visible
  const prefix = cleaned.substring(0, 4);
  const suffix = cleaned.substring(cleaned.length - 4);
  const masked = '*'.repeat(Math.max(0, cleaned.length - 8));
  
  return `${prefix}${masked}${suffix}`;
}

/**
 * Formats phone for display with country code
 */
export function formatPhoneDisplay(phone: string | null | undefined, mask: boolean = false): string {
  if (!phone) return 'N/A';
  
  if (mask) {
    return maskPhoneNumber(phone);
  }
  
  return phone;
}

