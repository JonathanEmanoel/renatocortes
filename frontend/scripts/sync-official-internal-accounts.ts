import { config } from "dotenv";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { PrismaClient, UserRole } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

type OfficialAccount = {
  key: "renato" | "italo" | "renan" | "developer";
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  barberAliases?: string[];
  specialty?: string;
};

const officialAccounts: OfficialAccount[] = [
  {
    key: "renato",
    name: "Renato",
    email: "renato3010andrade@gmail.com",
    phone: "81 9 9590-1793",
    role: UserRole.ADMIN,
    barberAliases: ["renato@renatocortes.com"],
    specialty: "Administrador e barbeiro Renato Cortes"
  },
  {
    key: "italo",
    name: "Italo",
    email: "claso6806@gmail.com",
    phone: "81 9 9329-0688",
    role: UserRole.BARBER,
    barberAliases: ["italo@renatocortes.com"],
    specialty: "Degrade navalhado, luzes e platinado"
  },
  {
    key: "renan",
    name: "Renan",
    email: "gustavosilvagustavo.mendes@gmail.com",
    phone: "81 9 9388-7519",
    role: UserRole.BARBER,
    barberAliases: ["renan@renatocortes.com"],
    specialty: "Barba, acabamento e cortes modernos"
  },
  {
    key: "developer",
    name: "Jonathan Emanoel",
    email: "reservabarbearia605@gmail.com",
    phone: "81 9 84667532",
    role: UserRole.DEVELOPER
  }
];

const protectedClientEmail = "jonathan.emanoel23@gmail.com";

async function readPasswordsFromStdin() {
  if (process.stdin.isTTY) {
    const passwords = {} as Record<OfficialAccount["key"], string>;

    for (const account of officialAccounts) {
      passwords[account.key] = await readHiddenLine(`Senha de ${account.name}: `);
    }

    return passwords;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("PASSWORDS_STDIN_REQUIRED");

  return JSON.parse(raw) as Record<OfficialAccount["key"], string>;
}

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

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function listAuthUsers(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const users: SupabaseUser[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  return users;
}

async function ensureAuthUser(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  authUsers: SupabaseUser[],
  account: OfficialAccount,
  password: string
) {
  const existing = authUsers.find((user) => user.email?.toLowerCase() === account.email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password,
      user_metadata: {
        name: account.name,
        phone: account.phone,
        role: account.role
      }
    });

    if (error || !data.user) throw error ?? new Error(`AUTH_UPDATE_FAILED:${account.email}`);
    return { user: data.user, source: "updated" as const };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: {
      name: account.name,
      phone: account.phone,
      role: account.role
    }
  });

  if (error || !data.user) throw error ?? new Error(`AUTH_CREATE_FAILED:${account.email}`);
  return { user: data.user, source: "created" as const };
}

async function choosePublicUser(account: OfficialAccount) {
  const candidates = await prisma.user.findMany({
    where: {
      email: {
        in: [account.email, ...(account.barberAliases ?? [])]
      }
    },
    include: {
      barber: {
        include: {
          _count: {
            select: {
              appointments: true,
              commissions: true,
              reviews: true,
              availability: true
            }
          }
        }
      }
    }
  });

  const official = candidates.find((user) => user.email.toLowerCase() === account.email);
  if (official) return official;

  const aliasWithBarberHistory = candidates
    .filter((user) => user.barber)
    .sort((a, b) => (b.barber?._count.appointments ?? 0) - (a.barber?._count.appointments ?? 0))[0];

  return aliasWithBarberHistory ?? null;
}

async function main() {
  const passwords = await readPasswordsFromStdin();
  const supabase = createSupabaseAdmin();
  let authUsers = await listAuthUsers(supabase);
  const changes: unknown[] = [];

  const protectedClient = await prisma.user.findUnique({
    where: { email: protectedClientEmail }
  });

  if (protectedClient && protectedClient.role !== UserRole.CLIENT) {
    throw new Error("PROTECTED_CLIENT_ROLE_CONFLICT");
  }

  for (const account of officialAccounts) {
    const password = passwords[account.key];
    if (!password) throw new Error(`PASSWORD_MISSING:${account.key}`);

    const { user: authUser, source } = await ensureAuthUser(supabase, authUsers, account, password);
    authUsers = await listAuthUsers(supabase);

    const publicUser = await choosePublicUser(account);
    const savedUser = publicUser
      ? await prisma.user.update({
          where: { id: publicUser.id },
          data: {
            authId: authUser.id,
            name: account.name,
            email: account.email,
            phone: account.phone,
            role: account.role,
            active: true,
            deletedAt: null
          }
        })
      : await prisma.user.create({
          data: {
            authId: authUser.id,
            name: account.name,
            email: account.email,
            phone: account.phone,
            role: account.role,
            active: true
          }
        });

    if (account.role === UserRole.BARBER || account.key === "renato") {
      await prisma.barber.upsert({
        where: { userId: savedUser.id },
        update: {
          specialty: account.specialty,
          active: true,
          deletedAt: null,
          serviceCommissionPercent: "50.00",
          productCommissionPercent: "20.00"
        },
        create: {
          userId: savedUser.id,
          specialty: account.specialty,
          active: true,
          serviceCommissionPercent: "50.00",
          productCommissionPercent: "20.00"
        }
      });
    }

    changes.push({ email: account.email, role: account.role, auth: source, publicUserId: savedUser.id });
  }

  const seedEmailsToDeactivate = [
    "admin@renatocortes.com",
    "ricardo@renatocortes.com",
    "cliente@email.com",
    "teste.auth.1784263638340@renatocortes.com"
  ];

  const deactivated = await prisma.user.updateMany({
    where: {
      email: { in: seedEmailsToDeactivate },
      NOT: { email: protectedClientEmail }
    },
    data: {
      active: false,
      deletedAt: new Date()
    }
  });

  await prisma.barber.updateMany({
    where: {
      user: {
        email: { in: seedEmailsToDeactivate }
      }
    },
    data: {
      active: false,
      deletedAt: new Date()
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        changes,
        deactivatedSeedUsers: deactivated.count,
        protectedClient: protectedClient
          ? {
              email: protectedClient.email,
              role: protectedClient.role,
              active: protectedClient.active,
              unchanged: protectedClient.role === UserRole.CLIENT
            }
          : null
      },
      null,
      2
    )
  );
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
