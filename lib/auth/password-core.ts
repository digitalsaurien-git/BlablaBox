import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_VERSION = "scrypt-v1";
export const SCRYPT_PARAMETERS = Object.freeze({
  N: 65_536,
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16,
  maxmem: 128 * 1024 * 1024,
});
export const PASSWORD_MAX_LENGTH = 128;

function deriveKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: SCRYPT_PARAMETERS.maxmem,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new RangeError("Password is too long");
  }
  const salt = randomBytes(SCRYPT_PARAMETERS.saltLength);
  const derivedKey = await deriveKey(
    password,
    salt,
    SCRYPT_PARAMETERS.N,
    SCRYPT_PARAMETERS.r,
    SCRYPT_PARAMETERS.p,
    SCRYPT_PARAMETERS.keyLength,
  );
  return [
    SCRYPT_VERSION,
    SCRYPT_PARAMETERS.N,
    SCRYPT_PARAMETERS.r,
    SCRYPT_PARAMETERS.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  const [version, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] =
    encodedHash.split("$");
  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);

  if (
    version !== SCRYPT_VERSION ||
    cost !== SCRYPT_PARAMETERS.N ||
    blockSize !== SCRYPT_PARAMETERS.r ||
    parallelization !== SCRYPT_PARAMETERS.p ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (
      salt.length !== SCRYPT_PARAMETERS.saltLength ||
      expected.length !== SCRYPT_PARAMETERS.keyLength
    ) return false;
    const actual = await deriveKey(
      password,
      salt,
      cost,
      blockSize,
      parallelization,
      expected.length,
    );
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function spendPasswordVerificationTime(password: string): Promise<void> {
  await hashPassword(password);
}
