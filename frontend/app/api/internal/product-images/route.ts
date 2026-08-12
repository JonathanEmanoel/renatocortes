import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function canManageProducts(role: string) {
  return role === "ADMIN" || role === "DEVELOPER" || role === "BARBER";
}

function fileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split("/").pop()?.replace("svg+xml", "svg") || "jpg";
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser();
    if (!session || !canManageProducts(session.user.role)) {
      return NextResponse.json({ message: "Acesso nao autorizado." }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ message: "Storage nao configurado no servidor." }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Envie uma imagem valida." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ message: "O arquivo precisa ser uma imagem." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "A imagem deve ter no maximo 5 MB." }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const bucket = await supabase.storage.getBucket(BUCKET);
    if (bucket.error && bucket.error.message.toLowerCase().includes("not found")) {
      await supabase.storage.createBucket(BUCKET, { public: true });
    }

    const path = `${new Date().getFullYear()}/${randomUUID()}.${fileExtension(file)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: false
    });

    if (upload.error) {
      return NextResponse.json({ message: "Nao foi possivel enviar a imagem." }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch {
    return NextResponse.json({ message: "Nao foi possivel processar a imagem agora." }, { status: 500 });
  }
}
