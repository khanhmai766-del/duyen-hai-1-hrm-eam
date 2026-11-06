"use client";
import {useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
const subscribe = () => () => {};
export function MonthlyHeaderTools({active, children}:{active:boolean;children:React.ReactNode}) {
 const target=useSyncExternalStore(subscribe,()=>document.getElementById("monthly-header-tools"),()=>null);
 return active ? (target ? createPortal(children,target) : null) : children;
}
