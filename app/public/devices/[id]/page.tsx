import { redirect } from "next/navigation";

export default function LegacyPublicDevicePage({ params }: { params: { id: string } }) {
  redirect(`/public/equipment/${encodeURIComponent(params.id)}`);
}
