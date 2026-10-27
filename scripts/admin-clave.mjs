// Genera ADMIN_CLAVE_HASH y SESSION_SECRET para el acceso de coordinación.
// Uso: npm run admin:clave   (pide la contraseña sin dejarla en el historial de la terminal)
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../lib/server/admin-session.mjs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const clave = await rl.question("Contraseña de coordinación (mínimo 12 caracteres): ");
rl.close();

if (clave.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}

console.log("\nAgrega a .env:\n");
console.log(`ADMIN_CLAVE_HASH=${await hashPassword(clave)}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("base64")}`);
