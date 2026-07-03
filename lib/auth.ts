import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readLoginToken } from "@/lib/webauthn";
import { isDefaultPassword, isPasswordExpired } from "@/lib/password-policy";
import { effectiveUserPosition } from "@/lib/current-position";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "@/lib/login-security";

let loginLockColumnsReady = false;

async function ensureLoginLockColumns() {
  if (loginLockColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
  `);
  loginLockColumnsReady = true;
}

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
        await ensureLoginLockColumns();

        if (biometricToken) {
          const token = readLoginToken(biometricToken);
          if (!token || token.email !== login) return null;
          const user = await prisma.user.findUnique({ where: { id: token.userId } });
          if (!user || !user.isActive || user.lockedAt || user.email !== login) return null;
          const mustChangePassword = user.mustChangePassword || isPasswordExpired(user.passwordChangedAt);
          if (mustChangePassword && !user.mustChangePassword) {
            await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
          }
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            position: user.position ?? undefined,
            secondaryPosition: user.secondaryPosition ?? undefined,
            currentPosition: effectiveUserPosition(user) ?? undefined,
            employeeId: user.employeeId,
            mustChangePassword,
          };
        }

        const user = await prisma.user.findFirst({
          where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
        });
        if (!user || !user.isActive || user.lockedAt) return null;
        if (!password) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const failedLoginAttempts = user.failedLoginAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts,
              lockedAt: failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date() : null,
            },
          });
          return null;
        }
        if (user.failedLoginAttempts > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedAt: null },
          });
        }
        const mustChangePassword = user.mustChangePassword || isDefaultPassword(password) || isPasswordExpired(user.passwordChangedAt);
        if (mustChangePassword && !user.mustChangePassword) {
          await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
        }

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
          secondaryPosition: user.secondaryPosition ?? undefined,
          currentPosition: effectiveUserPosition(user) ?? undefined,
          employeeId: user.employeeId,
          mustChangePassword,
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
        token.secondaryPosition = (user as any).secondaryPosition;
        token.currentPosition = (user as any).currentPosition;
        token.employeeId = (user as any).employeeId;
        token.mustChangePassword = (user as any).mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const tokenId = token.id as string | undefined;
        const dbUser = tokenId
          ? await prisma.user
              .findUnique({
                where: { id: tokenId },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  position: true,
                  secondaryPosition: true,
                  currentPosition: true,
                  employeeId: true,
                  isActive: true,
                  lockedAt: true,
                  mustChangePassword: true,
                },
              })
              .catch(() => null)
          : null;

        if (dbUser?.isActive && !dbUser.lockedAt) {
          session.user.id = dbUser.id;
          session.user.name = dbUser.name;
          session.user.email = dbUser.email;
          session.user.role = dbUser.role;
          session.user.position = dbUser.position ?? undefined;
          session.user.secondaryPosition = dbUser.secondaryPosition ?? undefined;
          session.user.currentPosition = effectiveUserPosition(dbUser) ?? undefined;
          session.user.employeeId = dbUser.employeeId;
          session.user.mustChangePassword = Boolean(dbUser.mustChangePassword);
        } else {
          session.user.id = token.id as string;
          session.user.role = token.role as string;
          session.user.position = token.position as string | undefined;
          session.user.secondaryPosition = token.secondaryPosition as string | undefined;
          session.user.currentPosition = token.currentPosition as string | undefined;
          session.user.employeeId = token.employeeId as string;
          session.user.mustChangePassword = Boolean(token.mustChangePassword);
        }
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
