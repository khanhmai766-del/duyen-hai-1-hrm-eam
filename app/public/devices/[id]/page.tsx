import { redirect } from "next/navigation";

export default async function LegacyPublicDevicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/public/equipment/${encodeURIComponent(params.id)}`);
}
