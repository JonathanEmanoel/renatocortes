import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

const officialEmails = [
  "renato3010andrade@gmail.com",
  "claso6806@gmail.com",
  "gustavosilvagustavo.mendes@gmail.com",
  "reservabarbearia605@gmail.com",
  "jonathan.emanoel23@gmail.com"
];

const seedLikeEmails = [
  "admin@renatocortes.com",
  "italo@renatocortes.com",
  "renan@renatocortes.com",
  "ricardo@renatocortes.com",
  "renato@renatocortes.com",
  "cliente@email.com"
];

async function listAuthUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return [];
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const users = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  return users;
}

async function main() {
  const [authUsers, dbUsers, barbers] = await Promise.all([
    listAuthUsers(),
    prisma.user.findMany({
      include: {
        barber: true,
        client: true,
        _count: {
          select: {
            auditLogs: true,
            notifications: true,
            addresses: true
          }
        }
      },
      orderBy: [{ role: "asc" }, { email: "asc" }]
    }),
    prisma.barber.findMany({
      include: {
        user: true,
        _count: {
          select: {
            appointments: true,
            commissions: true,
            reviews: true,
            availability: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const authByEmail = new Map(authUsers.map((user) => [user.email?.toLowerCase(), user]));
  const dbByEmail = new Map(dbUsers.map((user) => [user.email.toLowerCase(), user]));
  const barberByUserId = new Map(barbers.map((barber) => [barber.userId, barber]));

  const userIds = dbUsers.map((user) => user.id);
  const barberIds = barbers.map((barber) => barber.id);

  const [appointmentsByUser, appointmentsByBarber, subscriptionsByUser, salesByUser, paymentsByUser, commissionsByBarber] =
    await Promise.all([
      prisma.appointment.groupBy({
        by: ["clientId"],
        where: { client: { userId: { in: userIds } } },
        _count: { _all: true }
      }),
      prisma.appointment.groupBy({
        by: ["barberId"],
        where: { barberId: { in: barberIds } },
        _count: { _all: true }
      }),
      prisma.subscription.groupBy({
        by: ["clientId"],
        where: { client: { userId: { in: userIds } } },
        _count: { _all: true }
      }),
      prisma.sale.groupBy({
        by: ["clientId"],
        where: { client: { userId: { in: userIds } } },
        _count: { _all: true }
      }),
      prisma.payment.groupBy({
        by: ["clientId"],
        where: { client: { userId: { in: userIds } } },
        _count: { _all: true }
      }),
      prisma.employeeCommission.groupBy({
        by: ["barberId"],
        where: { barberId: { in: barberIds } },
        _count: { _all: true }
      })
    ]);

  const countBy = <T extends string>(items: (Record<T, string | null> & { _count: { _all: number } })[], key: T) =>
    new Map(items.map((item) => [item[key], item._count._all]));

  const clientAppointmentCount = countBy(appointmentsByUser, "clientId");
  const barberAppointmentCount = countBy(appointmentsByBarber, "barberId");
  const subscriptionCount = countBy(subscriptionsByUser, "clientId");
  const saleCount = countBy(salesByUser, "clientId");
  const paymentCount = countBy(paymentsByUser, "clientId");
  const commissionCount = countBy(commissionsByBarber, "barberId");

  const publicUsers = dbUsers.map((user) => {
    const barber = barberByUserId.get(user.id);
    const clientId = user.client?.id ?? null;
    return {
      id: user.id,
      authId: user.authId,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      deletedAt: user.deletedAt,
      existsInAuth: authById.has(user.authId),
      isBarber: user.role === "BARBER",
      barberId: barber?.id ?? null,
      barberActive: barber?.active ?? null,
      historicalData: {
        clientAppointments: clientId ? clientAppointmentCount.get(clientId) ?? 0 : 0,
        subscriptions: clientId ? subscriptionCount.get(clientId) ?? 0 : 0,
        sales: clientId ? saleCount.get(clientId) ?? 0 : 0,
        payments: clientId ? paymentCount.get(clientId) ?? 0 : 0,
        barberAppointments: barber ? barberAppointmentCount.get(barber.id) ?? 0 : 0,
        commissions: barber ? commissionCount.get(barber.id) ?? 0 : 0,
        reviews: barber?._count.reviews ?? 0,
        notifications: user._count.notifications,
        auditLogs: user._count.auditLogs,
        addresses: user._count.addresses
      },
      seedLike:
        user.authId.startsWith("seed-") ||
        seedLikeEmails.includes(user.email.toLowerCase()) ||
        user.email.endsWith("@renatocortes.com")
    };
  });

  const officialStatus = officialEmails.map((email) => {
    const lower = email.toLowerCase();
    const dbUser = dbByEmail.get(lower);
    const authUser = authByEmail.get(lower);
    return {
      email,
      existsInAuth: Boolean(authUser),
      authId: authUser?.id ?? null,
      emailConfirmedAt: authUser?.email_confirmed_at ?? null,
      existsInPublicUsers: Boolean(dbUser),
      publicUserId: dbUser?.id ?? null,
      publicAuthId: dbUser?.authId ?? null,
      role: dbUser?.role ?? null,
      active: dbUser?.active ?? null,
      phone: dbUser?.phone ?? null,
      hasBarber: Boolean(dbUser?.barber),
      authMatchesPublic: Boolean(dbUser && authUser && dbUser.authId === authUser.id)
    };
  });

  const authOnlyUsers = authUsers
    .filter((user) => user.email && !dbByEmail.has(user.email.toLowerCase()))
    .map((user) => ({
      authId: user.id,
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      createdAt: user.created_at
    }));

  console.log(
    JSON.stringify(
      {
        totals: {
          authUsers: authUsers.length,
          publicUsers: dbUsers.length,
          barbers: barbers.length,
          authOnlyUsers: authOnlyUsers.length
        },
        officialStatus,
        authOnlyUsers,
        publicUsers,
        barbers: barbers.map((barber) => ({
          id: barber.id,
          userId: barber.userId,
          userEmail: barber.user.email,
          userName: barber.user.name,
          active: barber.active,
          deletedAt: barber.deletedAt,
          appointments: barberAppointmentCount.get(barber.id) ?? 0,
          commissions: commissionCount.get(barber.id) ?? 0,
          reviews: barber._count.reviews,
          availability: barber._count.availability
        }))
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
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
