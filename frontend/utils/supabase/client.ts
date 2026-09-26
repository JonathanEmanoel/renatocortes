import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Cria cliente Supabase para componentes client-side.
 * Usa somente a chave publica; operacoes privilegiadas precisam acontecer em
 * rotas server-side com permissao propria.
 */
export const createClient = () => createBrowserClient(supabaseUrl!, supabaseKey!);
