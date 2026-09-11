import type { ContractItemPdfProvider } from "./contract-item-import";
import { GeminiContractItemProvider } from "./gemini-contract-item-provider";
import { OpenAiContractItemProvider } from "./openai-contract-item-provider";

export function getContractItemPdfProvider(): ContractItemPdfProvider {
  const provider = (
    process.env.TCMS_PDF_AI_PROVIDER ??
    "gemini"
  ).toLowerCase();

  if (provider === "gemini") {
    return new GeminiContractItemProvider();
  }

  if (provider === "openai") {
    return new OpenAiContractItemProvider();
  }

  throw new Error(
    "PDF_AI_PROVIDER_NOT_SUPPORTED",
  );
}