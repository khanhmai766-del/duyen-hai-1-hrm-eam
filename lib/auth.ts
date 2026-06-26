import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readLoginToken } from "@/lib/webauthn";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Phiên hết hạn sau 30 phút không hoạt động (cookie tự hết hạn khi tab đóng/mất mạng);
  // updateAge để phiên "trượt" làm mới khi người dùng còn đang thao tác (xem refetchInterval ở SessionProvider).
  session: { strategy: "jwt", maxAge: 30 * 60, updateAge: 5 * 60 },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email hoặc user", type: "text" },
        password: { label: "Password", type: "password" },
        biometricToken: { label: "Biometric Token", type: "text" },
      },
      async authorize(credentials) {
        const login = (credentials?.email as string | undefined)?.trim();
        const password = credentials?.password as string | undefined;
        const biometricToken = credentials?.biometricToken as string | undefined;
        if (!login || (!password && !biometricToken)) return null;

        if (biometricToken) {
          const token = readLoginToken(biometricToken);
          if (!token || token.email !== login) return null;
          const user = await prisma.user.findUnique({ where: { id: token.userId } });
          if (!user || !user.isActive || user.email !== login) return null;
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            position: user.position ?? undefined,
            employeeId: user.employeeId,
          };
        }

        const user = await prisma.user.findFirst({
          where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
        });
        if (!user || !user.isActive) return null;
        if (!password) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // NOTE: avatarUrl is intentionally NOT returned here. Avatars may be
        // large base64 data URLs; putting them in the JWT bloats the session
        // cookie past the browser header limit (ERR_RESPONSE_HEADERS_TOO_BIG)
        // and breaks login. The avatar is fetched from the DB where needed.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          position: user.position ?? undefined,
          employeeId: user.employeeId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.position = (user as any).position;
        token.employeeId = (user as any).employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.position = token.position as string | undefined;
        session.user.employeeId = token.employeeId as string;
      }
      return session;
    },
  },
});

/** Throws-free helper to read the current session role in route handlers. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}
