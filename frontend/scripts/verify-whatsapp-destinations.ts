import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const emails = [
  "renato3010andrade@gmail.com",
  "claso6806@gmail.com",
  "gustavosilvagustavo.mendes@gmail.com"
];

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: { in: emails }
    },
    select: {
      email: true,
      phone: true
    }
  });

  for (const email of emails) {
    const user = users.find((item) => item.email === email);
    const url = buildWhatsAppUrl("teste", user?.phone);
    console.log(`${email} -> ${url.split("?")[0]}`);
  }
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
