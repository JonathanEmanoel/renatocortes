# Renato Cortes Barbearia

Base full stack para o site da Renato Cortes Barbearia.

## Estrutura

- `frontend/`: Next.js 15, TypeScript, Tailwind CSS, Zustand, React Hook Form e Zod.
- `backend/`: Node.js, Express, TypeScript, Prisma ORM e arquitetura por camadas.

## Ambiente

Copie os exemplos de ambiente antes de rodar:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

`DATABASE_URL` deve apontar para o PostgreSQL/Supabase quando as credenciais reais estiverem disponíveis.

## Login mockado

- Cliente: `cliente@email.com` / `123456`
- Funcionário: `renan@barbearia.com` / `123456`

## Scripts

```bash
cd frontend
npm run dev
```

```bash
cd backend
npm run dev
```
