// Corre antes de `npm run cf:deploy`. OpenNext copia TODOS los .env* del
// proyecto adentro del bundle del Worker (.open-next/cloudflare/next-env.mjs),
// así que si la service_role key está en .env.local termina subida como
// código. En Cloudflare tiene que ir como secret (`wrangler secret put`).
import fs from "node:fs";

const SECRETS = ["SUPABASE_SERVICE_ROLE_KEY"];

const offenders = fs
  .readdirSync(".")
  .filter((f) => f.startsWith(".env") && !f.endsWith(".example"))
  .filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return SECRETS.some((name) => new RegExp(`^\\s*${name}\\s*=\\s*\\S`, "m").test(src));
  });

if (offenders.length > 0) {
  console.error(
    `\n✗ ${offenders.join(", ")} define ${SECRETS.join(", ")}: se subiría dentro del Worker.\n` +
      "  Deployá desde Workers Builds (recomendado, ver CLOUDFLARE.md) o mové ese\n" +
      "  archivo fuera del proyecto mientras corre el deploy.\n"
  );
  process.exit(1);
}
