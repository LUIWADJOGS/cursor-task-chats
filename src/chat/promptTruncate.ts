/**
 * Cursor prompt deeplinks use URL-encoded text; keep payload under a safe limit.
 * @param maxEncodedLength — max length of encodeURIComponent(result)
 */
export function truncateForCursorDeeplink(promptText: string, maxEncodedLength: number): string {
  if (maxEncodedLength <= 20) {
    return '';
  }
  if (encodeURIComponent(promptText).length <= maxEncodedLength) {
    return promptText;
  }
  const suffix = '\n\n[…truncated for Cursor deeplink size limit]';
  const suffixEncodedLen = encodeURIComponent(suffix).length;
  const budget = maxEncodedLength - suffixEncodedLen;
  if (budget <= 0) {
    return promptText.slice(0, 1);
  }
  let low = 0;
  let high = promptText.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const slice = promptText.slice(0, mid);
    if (encodeURIComponent(slice).length <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return promptText.slice(0, low) + suffix;
}
