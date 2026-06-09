"use client";

import dynamic from "next/dynamic";
import mail from "@/components/lottie-icons/mail.json";
import phone from "@/components/lottie-icons/phone.json";
import idcard from "@/components/lottie-icons/idcard.json";
import briefcase from "@/components/lottie-icons/briefcase.json";
import building from "@/components/lottie-icons/building.json";
import shield from "@/components/lottie-icons/shield.json";

// lottie-react touches the DOM, so load it client-only to avoid SSR/interop issues.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const REGISTRY = { mail, phone, idcard, briefcase, building, shield } as const;

export type LottieIconName = keyof typeof REGISTRY;

export function LottieIcon({ name, className }: { name: LottieIconName; className?: string }) {
  return <Lottie animationData={REGISTRY[name] as object} loop autoplay className={className} />;
}
