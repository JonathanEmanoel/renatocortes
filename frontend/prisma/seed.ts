import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const barberSeeds = [
  {
    authId: "seed-barber-renato",
    name: "Renato",
    email: "renato@renatocortes.com",
    phone: "(11) 99999-1001",
    specialty: "Cortes clássicos, degradê e finalização premium"
  },
  {
    authId: "seed-barber-renan",
    name: "Renan",
    email: "renan@renatocortes.com",
    phone: "(11) 99999-1002",
    specialty: "Barba, acabamento e cortes modernos"
  },
  {
    authId: "seed-barber-italo",
    name: "Ítalo",
    email: "italo@renatocortes.com",
    phone: "(11) 99999-1003",
    specialty: "Degradê navalhado, luzes e platinado"
  }
];

const serviceSeeds = [
  { name: "Corte Normal", description: "Corte masculino tradicional.", duration: 35, price: "22.00" },
  { name: "Corte Degradê", description: "Degradê alinhado com acabamento Renato Cortes.", duration: 40, price: "25.00" },
  { name: "Corte Degradê Navalhado", description: "Degradê navalhado com finalização precisa.", duration: 45, price: "30.00" },
  { name: "Corte de Criança (1 a 10 anos)", description: "Corte infantil de 1 a 10 anos.", duration: 35, price: "25.00" },
  { name: "Corte Todo na Tesoura", description: "Corte completo feito na tesoura.", duration: 45, price: "25.00" },
  { name: "Barba", description: "Barba completa com desenho e acabamento.", duration: 25, price: "15.00" },
  { name: "Só os Cantinhos", description: "Acabamento rapido dos cantinhos.", duration: 15, price: "10.00" },
  { name: "Sobrancelha", description: "Design e limpeza de sobrancelha.", duration: 10, price: "5.00" },
  { name: "Alisamento", description: "Alisamento masculino.", duration: 35, price: "20.00" },
  { name: "Luzes", description: "A partir de R$ 70,00.", duration: 90, price: "70.00" },
  { name: "Platinado", description: "A partir de R$ 80,00.", duration: 120, price: "80.00" }
];

const planSeeds = [
  { name: "Plano Cabelo", description: "Cortes ilimitados", value: "75.00" },
  { name: "Plano Barba", description: "Barba ilimitada", value: "65.00" },
  { name: "Plano Cabelo + Barba", description: "Corte + barba ilimitados", value: "130.00" }
];

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

  const barberEmails = barberSeeds.map((barber) => barber.email);

  const barberUsers = await Promise.all(
    barberSeeds.map((barber) =>
      upsertUser({
        authId: barber.authId,
        name: barber.name,
        email: barber.email,
        phone: barber.phone,
        role: UserRole.BARBER
      })
    )
  );

  await prisma.barber.updateMany({
    where: { user: { email: { notIn: barberEmails } } },
    data: { active: false, deletedAt: new Date() }
  });

  await prisma.user.updateMany({
    where: { role: UserRole.BARBER, email: { notIn: barberEmails } },
    data: { active: false, deletedAt: new Date() }
  });

  const barbers = await Promise.all(
    barberUsers.map((user, index) =>
      prisma.barber.upsert({
        where: { userId: user.id },
        update: {
          specialty: barberSeeds[index].specialty,
          active: true,
          deletedAt: null
        },
        create: {
          userId: user.id,
          specialty: barberSeeds[index].specialty,
          serviceCommissionPercent: "50.00",
          productCommissionPercent: "5.00"
        }
      })
    )
  );

  const serviceNames = serviceSeeds.map((service) => service.name);

  await prisma.service.updateMany({
    where: { name: { notIn: serviceNames } },
    data: { active: false, deletedAt: new Date() }
  });

  const services = await Promise.all(
    serviceSeeds.map((service) =>
      prisma.service.upsert({
        where: { name: service.name },
        update: { ...service, active: true, deletedAt: null },
        create: service
      })
    )
  );

  const planNames = planSeeds.map((plan) => plan.name);

  await prisma.subscriptionPlan.updateMany({
    where: { name: { notIn: planNames } },
    data: { active: false, deletedAt: new Date() }
  });

  const plans = await Promise.all(
    planSeeds.map((plan) =>
      prisma.subscriptionPlan.upsert({
        where: { name: plan.name },
        update: { ...plan, active: true, deletedAt: null },
        create: plan
      })
    )
  );

  await prisma.subscriptionPlanService.deleteMany({
    where: { subscriptionPlanId: { in: plans.map((plan) => plan.id) } }
  });

  const serviceByName = new Map(services.map((service) => [service.name, service]));
  const planByName = new Map(plans.map((plan) => [plan.name, plan]));

  const planServices = [
    { planName: "Plano Cabelo", serviceNames: ["Corte Normal", "Corte Degradê", "Corte Degradê Navalhado", "Corte Todo na Tesoura"] },
    { planName: "Plano Barba", serviceNames: ["Barba"] },
    { planName: "Plano Cabelo + Barba", serviceNames: ["Corte Normal", "Corte Degradê", "Corte Degradê Navalhado", "Barba"] }
  ];

  await Promise.all(
    planServices.flatMap((item) =>
      item.serviceNames.map((serviceName) =>
        prisma.subscriptionPlanService.create({
          data: {
            subscriptionPlanId: planByName.get(item.planName)!.id,
            serviceId: serviceByName.get(serviceName)!.id
          }
        })
      )
    )
  );

  const categories = await Promise.all(
    ["Pomadas", "Shampoos", "Acessorios"].map((name) =>
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
        categoryId: categoryIdByName.get("Acessorios")!,
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
