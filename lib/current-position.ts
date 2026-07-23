export type PositionCarrier = {
  position?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
  currentPosition?: string | null;
};

function cleanPosition(value?: string | null) {
  return value?.trim() || null;
}

export function availableUserPositions(user?: PositionCarrier | null) {
  const values = [
    cleanPosition(user?.position),
    cleanPosition(user?.secondaryPosition),
    cleanPosition(user?.secondaryPosition2),
  ];
  return values.filter((value, index): value is string => Boolean(value) && values.indexOf(value) === index);
}

export function effectiveUserPosition(user?: PositionCarrier | null) {
  const current = cleanPosition(user?.currentPosition);
  const options = availableUserPositions(user);
  if (current && options.includes(current)) return current;
  return options[0] ?? null;
}

export function isValidCurrentPosition(user: PositionCarrier, value?: string | null) {
  const current = cleanPosition(value);
  if (!current) return true;
  return availableUserPositions(user).includes(current);
}
