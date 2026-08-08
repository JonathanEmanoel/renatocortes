import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/server/internal-auth";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const accounts = [
  { key: "renato", name: "Renato", email: "renato3010andrade@gmail.com", expectedRole: "ADMIN" },
  { key: "italo", name: "Italo", email: "claso6806@gmail.com", expectedRole: "BARBER" },
  { key: "renan", name: "Renan", email: "gustavosilvagustavo.mendes@gmail.com", expectedRole: "BARBER" },
  { key: "developer", name: "Jonathan Developer", email: "reservabarbearia605@gmail.com", expectedRole: "DEVELOPER" }
] as const;

function readHiddenLine(prompt: string) {
  return new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const previousRawMode = stdin.isRaw;
    let value = "";

    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          process.stdout.write("\n");
          process.exit(1);
        }

        if (char === "\r" || char === "\n") {
          process.stdout.write("\n");
          stdin.off("data", onData);
          stdin.setRawMode(previousRawMode);
          stdin.pause();
          resolve(value);
          return;
        }

        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        value += char;
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) throw new Error("SUPABASE_PUBLIC_ENV_MISSING");

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  for (const account of accounts) {
    const password = await readHiddenLine(`Senha de ${account.name}: `);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password
    });

    const dbUser = await prisma.user.findUnique({
      where: { email: account.email },
      select: { role: true, active: true }
    });

    console.log(
      JSON.stringify({
        email: account.email,
        authLogin: Boolean(data.user && !error),
        role: dbUser?.role ?? null,
        active: dbUser?.active ?? null,
        roleOk: dbUser?.role === account.expectedRole,
        redirectTo: dbUser?.role ? getDashboardPath(dbUser.role) : null
      })
    );

    await supabase.auth.signOut();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
