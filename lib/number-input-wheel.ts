/** Leave native scrolling enabled, while preventing a focused number input from stepping. */
export function installNumberInputWheelGuard(view: Window) {
  const onWheel = () => {
    const active = view.document.activeElement;
    if (active?.tagName !== "INPUT") return;
    const input = active as HTMLInputElement;
    if (input.type === "number" && !input.disabled && !input.readOnly) input.blur();
  };

  // The wheel can target a different element while the number input still has focus.
  // Capture at the window before widgets handle the same event.
  view.addEventListener("wheel", onWheel, { capture: true, passive: true });
  return () => view.removeEventListener("wheel", onWheel, true);
}
