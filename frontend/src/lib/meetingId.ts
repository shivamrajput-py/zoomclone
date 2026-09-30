/** Zoom-style numeric meeting ID: three groups of three digits (ddd-ddd-ddd). */
const ID_PATTERN = /^\d{3}-\d{3}-\d{3}$/;

/**
 * Accepts a bare meeting ID ("892-573-401", "892573401") or a full invite link
 * ("https://host/meeting/892-573-401?x=1") and returns the normalised ID, or null.
 *
 * Only all-digit IDs are accepted — letters are not valid per the Zoom-style format.
 */
export function parseMeetingId(input: string): string | null {
  let candidate = input.trim();
  if (!candidate) return null;

  // Extract ID segment from a pasted invite link.
  const fromLink = candidate.match(/\/meeting\/([^/?#\s]+)/i);
  if (fromLink) candidate = fromLink[1];

  // Strip spaces, hyphens, and underscores so "892 573 401" or "892573401" both work.
  candidate = candidate.replace(/[\s\-_]/g, "");

  // Insert dashes if the user typed/pasted the 9 bare digits.
  if (/^\d{9}$/.test(candidate)) {
    candidate = `${candidate.slice(0, 3)}-${candidate.slice(3, 6)}-${candidate.slice(6)}`;
  }

  return ID_PATTERN.test(candidate) ? candidate : null;
}
