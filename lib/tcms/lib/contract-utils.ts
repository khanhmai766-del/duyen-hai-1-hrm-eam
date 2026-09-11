import type {
  Contract,
  ContractWarning,
} from "../types/contract";

export function getEffectiveEndDate(
  contract: Contract
): Date | null {
  const dateString =
    contract.isExtended && contract.extendedUntil
      ? contract.extendedUntil
      : contract.contractEndDate;

  if (!dateString) {
    return null;
  }

  return new Date(`${dateString}T00:00:00`);
}

export function getRemainingDays(
  contract: Contract
): number | null {
  const endDate = getEffectiveEndDate(contract);

  if (!endDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const difference =
    endDate.getTime() - today.getTime();

  return Math.ceil(
    difference / (1000 * 60 * 60 * 24)
  );
}

export function getContractWarning(
  contract: Contract
): ContractWarning {
  if (
    contract.status === "COMPLETED" ||
    contract.status === "CLOSED"
  ) {
    return "Đã hoàn thành";
  }

  const remainingDays =
    getRemainingDays(contract);

  if (remainingDays === null) {
    return "Theo dõi";
  }

  if (remainingDays < 0) {
    return "Đã hết hạn";
  }

  if (remainingDays <= 7) {
    return "Khẩn";
  }

  if (remainingDays <= 30) {
    return "Sắp hết hạn";
  }

  if (remainingDays <= 60) {
    return "Theo dõi";
  }

  return "Bình thường";
}

export function formatRemainingDays(
  contract: Contract
): string {
  const days = getRemainingDays(contract);

  if (days === null) {
    return "Chưa xác định";
  }

  if (days < 0) {
    return `Quá ${Math.abs(days)} ngày`;
  }

  if (days === 0) {
    return "Hết hạn hôm nay";
  }

  return `${days} ngày`;
}

export { formatDate } from "./date-utils";