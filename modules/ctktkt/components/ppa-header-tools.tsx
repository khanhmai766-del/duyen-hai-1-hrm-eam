"use client";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { GoogleMirrorLinks } from "./google-mirror-links";

// Chỗ gắn nằm ở thanh đầu trang của layout KTKT (luôn có sẵn khi trang PPA hiện) — chỉ cần đọc sau khi hydrate.
const noSubscribe = () => () => {};
const findTarget = () => document.getElementById("ktkt-page-extra-tools");
const serverTarget = () => null;

export function PpaHeaderTools() {
  const target = useSyncExternalStore(noSubscribe, findTarget, serverTarget);
  const links = <div className="items-center gap-1.5 [display:flex] [&>a]:inline-flex [&>a]:items-center [&>a]:whitespace-nowrap [&>a]:border [&>a]:border-[#dbe4ef] [&>a]:text-[#354a9f]">
    <GoogleMirrorLinks module="ppa" variant="inline" />
  </div>;
  return target ? createPortal(links, target) : null;
}
