const COMMON_WEAK = new Set([
  "password", "passw0rd", "qwerty", "qwerty123", "12345678", "123456789",
  "1234567890", "11111111", "00000000", "abcdefgh", "iloveyou", "letmein",
  "admin123", "welcome1", "Password1", "Qwerty123",
]);

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Strong client-side password rules (sign-in/sign-up).
 * Does not modify Supabase auth — only blocks weak input before calling it.
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (!password || password.length < 8) {
    return { valid: false, message: "Пароль должен содержать минимум 8 символов." };
  }
  if (!/[A-ZА-ЯЁ]/.test(password)) {
    return { valid: false, message: "Добавьте хотя бы одну заглавную букву." };
  }
  if (!/[a-zа-яё]/.test(password)) {
    return { valid: false, message: "Добавьте хотя бы одну строчную букву." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Добавьте хотя бы одну цифру." };
  }
  if (COMMON_WEAK.has(password.toLowerCase())) {
    return { valid: false, message: "Этот пароль слишком простой. Придумайте уникальный." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { valid: false, message: "Пароль не должен состоять из одного повторяющегося символа." };
  }
  return { valid: true };
}
