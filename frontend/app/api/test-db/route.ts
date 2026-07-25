import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function maskDatabaseUrl(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    if (url.username) {
      const [prefix, suffix] = url.username.split(".");
      url.username = suffix ? `${prefix}.***` : "***";
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:]+):([^@]+)@/, "://***:***@");
  }
}

export async function GET() {
  return NextResponse.json({
    DATABASE_URL: maskDatabaseUrl(process.env.DATABASE_URL),
    DIRECT_URL: maskDatabaseUrl(process.env.DIRECT_URL),
    NODE_ENV: process.env.NODE_ENV
  });
}
