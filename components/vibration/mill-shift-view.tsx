"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { vnShift } from "@/lib/vibration/parse";
import { VcPageTitle } from "./export-ui";
import { MillOilTab } from "./mill-oil-tab";
import { MillVibTab } from "./mill-vib-tab";

const TABS = [
  ["vib", "Độ rung/nhiệt độ MILL"],
  ["oil", "Mức tiêu hao dầu VRL trong ngày"],
] as const;

export function MillShiftView() {
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canEdit = rbac.can("vibration-entry", ["personal", "manage", "full"]);
  const [tab, setTab] = React.useState<"vib" | "oil">("vib");
  const [date, setDate] = React.useState(() => vnShift().date);
  const [personEdit, setPerson] = React.useState<string | null>(null);
  const person = personEdit ?? session?.user?.name ?? "";

  return (
    <>
      <VcPageTitle>{TABS.find((t) => t[0] === tab)![1]}</VcPageTitle>
      <div className="rs-subtabs mill-tabs" role="tablist" aria-label="Mill theo ca">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" data-mill-tab={k} aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "vib" ? (
        <MillVibTab date={date} setDate={setDate} person={person} setPerson={setPerson} canEdit={canEdit} />
      ) : (
        <MillOilTab date={date} setDate={setDate} person={person} canEdit={canEdit} />
      )}
    </>
  );
}
