import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
      if (isProtected) {
        return isLoggedIn;
      }
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
