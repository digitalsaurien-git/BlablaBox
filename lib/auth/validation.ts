export type CredentialsInput = {
  email: string;
  password: string;
};

export type RegistrationInput = CredentialsInput & {
  passwordConfirmation: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCredentials(input: CredentialsInput): CredentialsInput | null {
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return null;
  if (input.password.length < 12 || input.password.length > 128) return null;
  return { email, password: input.password };
}

export function validateRegistration(input: RegistrationInput): CredentialsInput | null {
  const credentials = validateCredentials(input);
  if (!credentials || input.password !== input.passwordConfirmation) return null;
  return credentials;
}
