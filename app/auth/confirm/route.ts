import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

// Enlace del correo de confirmación: /auth/confirm?token_hash=…&type=email
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const fail = NextResponse.redirect(new URL("/auth?error=confirmacion", request.url));

  if (!tokenHash || !isEmailOtpType(type)) return fail;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth:confirm] verifyOtp devolvió error:", error);
      return fail;
    }
  } catch (err) {
    console.error("[auth:confirm] Fallo inesperado:", err);
    return fail;
  }

  return NextResponse.redirect(new URL("/biblioteca", request.url));
}
