import { auth } from "@/lib/auth";
import ShnPpaToolPage from "@/components/tien-ich/ShnPpaToolPage";

export default async function Page() {
  const session = await auth();
  return <ShnPpaToolPage isAdmin={session?.user?.role === "ADMIN"} />;
}
