export function isValidSetupKey(key: string): boolean {
  return key.length >= 16 && key.length <= 8192 && /^[\x20-\x7e]+$/.test(key) && key.trim() === key;
}
