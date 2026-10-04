export function isValidSetupKey(key: string): boolean {
  return key.length >= 16 && key.length <= 8192 && /^[\x21-\x7e]+$/.test(key);
}
