import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "./password";

/**
 * NextAuth v4 (next-auth) configuration — Credentials provider, JWT
 * sessions. No OAuth, no self-serve signup: users exist only because
 * Egzon's team provisioned them (scripts/provision-company-account.ts).
 *
 * The JWT carries companyId + role so every server component and API route
 * can enforce tenant isolation without a database lookup per request.
 * Session cookies are signed/encrypted by NextAuth with NEXTAUTH_SECRET —
 * no custom session crypto anywhere in this app.
 *
 * Required env: NEXTAUTH_SECRET (long random value), NEXTAUTH_URL (deploy URL).
 */

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; companyId: string; role: "USER" | "ADMIN" };
  }
  interface User {
    companyId: string;
    role: "USER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    companyId?: string;
    role?: "USER" | "ADMIN";
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        // Same failure path for unknown email and wrong password: never leak
        // which of the two was wrong.
        if (!user) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return { id: user.id, email: user.email, companyId: user.companyId, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.companyId = user.companyId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.sub ?? "",
        email: token.email ?? "",
        companyId: token.companyId ?? "",
        role: token.role ?? "USER",
      };
      return session;
    },
  },
  pages: { signIn: "/login" },
};
