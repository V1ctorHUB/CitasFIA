import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Formato del valor cifrado: [versión de clave (1 byte)][IV (12)][tag GCM (16)][texto cifrado].
// La versión permite rotar la clave en el futuro sin perder la lectura de registros antiguos.
const KEY_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const DUI_PATTERN = /^\d{8}-\d$/;

/** @param {string} name @returns {Buffer} */
function readKey(name, env) {
  const encoded = env[name];
  if (!encoded) throw new Error(`Falta la variable de entorno ${name}.`);

  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`${name} debe ser una clave base64 de ${KEY_LENGTH} bytes (openssl rand -base64 32).`);
  }
  return key;
}

function assertDui(dui) {
  if (typeof dui !== "string" || !DUI_PATTERN.test(dui)) {
    throw new TypeError("El DUI debe tener el formato 00000000-0.");
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ hash: (dui: string) => Buffer, encrypt: (dui: string) => Buffer, decrypt: (value: Buffer) => string }}
 */
export function createDuiCipher(env = process.env) {
  const encryptionKey = readKey("DUI_ENCRYPTION_KEY", env);
  const hashKey = readKey("DUI_HASH_KEY", env);

  return {
    hash(dui) {
      assertDui(dui);
      return createHmac("sha256", hashKey).update(dui, "utf8").digest();
    },

    encrypt(dui) {
      assertDui(dui);
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      const ciphertext = Buffer.concat([cipher.update(dui, "utf8"), cipher.final()]);
      return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
    },

    decrypt(value) {
      if (!Buffer.isBuffer(value) || value.length <= 1 + IV_LENGTH + TAG_LENGTH) {
        throw new TypeError("Valor cifrado de DUI inválido.");
      }
      if (value[0] !== KEY_VERSION) throw new Error(`Versión de clave de DUI desconocida: ${value[0]}`);

      const iv = value.subarray(1, 1 + IV_LENGTH);
      const tag = value.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(value.subarray(1 + IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString("utf8");
    },
  };
}
