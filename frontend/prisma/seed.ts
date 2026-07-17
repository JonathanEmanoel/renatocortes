import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertUser(data: {
  authId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
}) {
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      authId: data.authId,
      name: data.name,
      phone: data.phone,
      role: data.role,
      active: true,
      deletedAt: null
    },
    create: {
      authId: data.authId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role
    }
  });
}

async function main() {
  const admin = await upsertUser({
    authId: "seed-admin-renato-cortes",
    name: "Administrador Renato Cortes",
    email: "admin@renatocortes.com",
    phone: "(11) 99999-0000",
    role: UserRole.ADMIN
  });

  const clientUser = await upsertUser({
    authId: "seed-client-jonathan",
    name: "Jonathan",
    email: "cliente@email.com",
    phone: "(11) 99999-0101",
    role: UserRole.CLIENT
  });

  await prisma.client.upsert({
    where: { userId: clientUser.id },
    update: { deletedAt: null },
    create: {
      userId: clientUser.id,
      notes: "Cliente inicial para testes de interface."
    }
  });

  const barberUsers = await Promise.all([
    upsertUser({
      authId: "seed-barber-ricardo",
      name: "Ricardo",
      email: "ricardo@renatocortes.com",
      phone: "(11) 99999-1001",
      role: UserRole.BARBER
    }),
    upsertUser({
      authId: "seed-barber-renan",
      name: "Renan",
      email: "renan@renatocortes.com",
      phone: "(11) 99999-1002",
      role: UserRole.BARBER
    })
  ]);

  const barbers = await Promise.all(
    barberUsers.map((user, index) =>
      prisma.barber.upsert({
        where: { userId: user.id },
        update: {
          specialty: index === 0 ? "Cortes clássicos e barba" : "Degradê, barba e acabamento",
          active: true,
          deletedAt: null
        },
        create: {
          userId: user.id,
          specialty: index === 0 ? "Cortes clássicos e barba" : "Degradê, barba e acabamento",
          serviceCommissionPercent: "50.00",
          productCommissionPercent: "5.00"
        }
      })
    )
  );

  const services = await Promise.all(
    [
      { name: "Corte", description: "Corte de cabelo masculino", duration: 45, price: "45.00" },
      { name: "Barba", description: "Barba completa com acabamento", duration: 35, price: "35.00" },
      { name: "Corte + Barba", description: "Combo completo de corte e barba", duration: 70, price: "80.00" },
      {
        name: "Corte + Barba + Sobrancelha",
        description: "Combo completo com acabamento de sobrancelha",
        duration: 90,
        price: "95.00"
      }
    ].map((service) =>
      prisma.service.upsert({
        where: { name: service.name },
        update: { ...service, active: true, deletedAt: null },
        create: service
      })
    )
  );

  const plans = await Promise.all(
    [
      { name: "Corte de Cabelo", description: "Cortes ilimitados durante o mês.", value: "75.00" },
      { name: "Barba", description: "Barba ilimitada durante o mês.", value: "65.00" },
      { name: "Corte + Barba", description: "Corte e barba ilimitados durante o mês.", value: "130.00" }
    ].map((plan) =>
      prisma.subscriptionPlan.upsert({
        where: { name: plan.name },
        update: { ...plan, active: true, deletedAt: null },
        create: plan
      })
    )
  );

  await Promise.all([
    prisma.subscriptionPlanService.upsert({
      where: {
        subscriptionPlanId_serviceId: {
          subscriptionPlanId: plans[0].id,
          serviceId: services[0].id
        }
      },
      update: {},
      create: { subscriptionPlanId: plans[0].id, serviceId: services[0].id }
    }),
    prisma.subscriptionPlanService.upsert({
      where: {
        subscriptionPlanId_serviceId: {
          subscriptionPlanId: plans[1].id,
          serviceId: services[1].id
        }
      },
      update: {},
      create: { subscriptionPlanId: plans[1].id, serviceId: services[1].id }
    }),
    prisma.subscriptionPlanService.upsert({
      where: {
        subscriptionPlanId_serviceId: {
          subscriptionPlanId: plans[2].id,
          serviceId: services[2].id
        }
      },
      update: {},
      create: { subscriptionPlanId: plans[2].id, serviceId: services[2].id }
    })
  ]);

  const categories = await Promise.all(
    ["Pomadas", "Shampoos", "Acessórios"].map((name) =>
      prisma.category.upsert({
        where: { name },
        update: { active: true, deletedAt: null },
        create: { name }
      })
    )
  );

  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));

  await Promise.all(
    [
      {
        categoryId: categoryIdByName.get("Pomadas")!,
        name: "Pomada Modeladora Premium",
        description: "Fixação forte com acabamento natural.",
        price: "45.00",
        stock: 20
      },
      {
        categoryId: categoryIdByName.get("Shampoos")!,
        name: "Shampoo para Barba",
        description: "Limpeza profunda sem ressecar.",
        price: "35.00",
        stock: 15
      },
      {
        categoryId: categoryIdByName.get("Acessórios")!,
        name: "Pente de Madeira",
        description: "Pente para barba e cabelo.",
        price: "28.00",
        stock: 30
      }
    ].map((product) =>
      prisma.product.upsert({
        where: { name: product.name },
        update: { ...product, active: true, deletedAt: null },
        create: product
      })
    )
  );

  await Promise.all(
    barbers.flatMap((barber) =>
      [1, 2, 3, 4, 5, 6].map((weekDay) =>
        prisma.barberAvailability.upsert({
          where: {
            barberId_weekDay_startTime: {
              barberId: barber.id,
              weekDay,
              startTime: "09:00"
            }
          },
          update: { endTime: "18:00", active: true, deletedAt: null },
          create: {
            barberId: barber.id,
            weekDay,
            startTime: "09:00",
            endTime: "18:00"
          }
        })
      )
    )
  );

  await prisma.settings.upsert({
    where: { key: "company" },
    update: {
      value: {
        name: "Renato Cortes Barbearia",
        phone: "(11) 99999-0000",
        timezone: "America/Sao_Paulo"
      }
    },
    create: {
      key: "company",
      value: {
        name: "Renato Cortes Barbearia",
        phone: "(11) 99999-0000",
        timezone: "America/Sao_Paulo"
      }
    }
  });

  await prisma.notification.upsert({
    where: { id: "seed-admin-welcome-notification" },
    update: {},
    create: {
      id: "seed-admin-welcome-notification",
      userId: admin.id,
      type: "SYSTEM",
      title: "Banco configurado",
      message: "Infraestrutura inicial criada com Prisma e Supabase."
    }
  });
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
