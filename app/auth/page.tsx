import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Acceso · Arcade Vault" };

// AuthForm lee ?modo= con useSearchParams; cacheComponents exige un límite <Suspense>.
export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
