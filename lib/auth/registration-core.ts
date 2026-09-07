export function isRegistrationEnabled(
  environment = process.env.NODE_ENV,
  configuredValue = process.env.REGISTRATION_ENABLED,
): boolean {
  const normalizedValue = configuredValue?.trim().toLowerCase();
  if (normalizedValue === "true") return true;
  if (normalizedValue === "false") return false;
  return environment !== "production";
}
