import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      position?: string;
      secondaryPosition?: string;
      secondaryPosition2?: string;
      currentPosition?: string;
      employeeId: string;
      avatarUrl?: string;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    position?: string;
    secondaryPosition?: string;
    secondaryPosition2?: string;
    currentPosition?: string;
    employeeId: string;
    avatarUrl?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    position?: string;
    secondaryPosition?: string;
    secondaryPosition2?: string;
    currentPosition?: string;
    employeeId: string;
    avatarUrl?: string;
    mustChangePassword?: boolean;
  }
}
