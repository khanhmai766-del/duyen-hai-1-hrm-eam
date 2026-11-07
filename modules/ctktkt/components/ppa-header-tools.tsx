"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { GoogleMirrorLinks } from "./google-mirror-links";
import { useSessionUser } from "./session-context";
import { canManageKtktInputs } from "../lib/auth/delegation-policy";

export function PpaHeaderTools() {
  const user = useSessionUser();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById("ktkt-page-extra-tools")); }, []);
  const links = <div className="ppa-header-links">
    {canManageKtktInputs(user) && <Link href="/tien-ich/chi-tieu-ktkt/phan-quyen">Phân công nhập liệu</Link>}
    <GoogleMirrorLinks module="ppa" variant="inline" />
  </div>;
  return target ? createPortal(links, target) : null;
}
