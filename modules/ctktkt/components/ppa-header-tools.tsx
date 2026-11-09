"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoogleMirrorLinks } from "./google-mirror-links";

export function PpaHeaderTools() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById("ktkt-page-extra-tools")); }, []);
  const links = <div className="items-center gap-1.5 [display:flex] [&>a]:inline-flex [&>a]:items-center [&>a]:whitespace-nowrap [&>a]:border [&>a]:border-[#dbe4ef] [&>a]:text-[#354a9f]">
    <GoogleMirrorLinks module="ppa" variant="inline" />
  </div>;
  return target ? createPortal(links, target) : null;
}
