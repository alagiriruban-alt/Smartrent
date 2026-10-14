import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { parseLogin } from "@/lib/validators";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = parseLogin({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.ok) {
          return null;
        }
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          return null;
        }
        const matches = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!matches) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
