"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoogleMirrorLinks } from "./google-mirror-links";

export function PpaHeaderTools() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById("ktkt-page-extra-tools")); }, []);
  const links = <div className="ppa-header-links">
    <GoogleMirrorLinks module="ppa" variant="inline" />
  </div>;
  return target ? createPortal(links, target) : null;
}
