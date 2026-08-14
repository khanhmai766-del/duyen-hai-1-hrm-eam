import { auth } from "@/lib/auth";
import ShnPpaToolPage from "@/components/tien-ich/ShnPpaToolPage";

export const metadata = { title: "So sánh SHN theo PPA" };

export default async function Page() {
  const session = await auth();
  return <ShnPpaToolPage isAdmin={session?.user?.role === "ADMIN"} />;
}
