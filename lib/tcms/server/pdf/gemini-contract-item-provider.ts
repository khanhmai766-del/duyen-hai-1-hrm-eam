import { readFile } from "node:fs/promises";

import type {
  ContractItemExtractionResult,
  ContractItemPdfProvider,
  ExtractedContractDraft,
  ExtractedContractItem,
} from "./contract-item-import";

const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

const DEFAULT_TIMEOUT_MS = 90_000;

const nullable = (type: "string" | "number" | "integer" | "boolean") => ({
  type: [type, "null"],
});

const geminiExtractedContractProperties = {
  contractNumber: nullable("string"),
  signedDate: nullable("string"),
  packageName: nullable("string"),
  contractorName: nullable("string"),
  contractorAddress: nullable("string"),
  contractorPhone: nullable("string"),
  contractorRepresentative: nullable("string"),
  contractDurationDays: nullable("integer"),
  serviceProvisionDurationDays: nullable("integer"),
  serviceDurationText: nullable("string"),
  unitExecutionDurationDays: nullable("integer"),
  unitExecutionContinuous: nullable("boolean"),
  unitExecutionTriggerText: nullable("string"),
  effectiveConditionText: nullable("string"),
  fieldEvidence: {
    type: "array",
    items: {
      type: "object",
      properties: {
        field: nullable("string"),
        sourcePage: nullable("integer"),
        evidence: nullable("string"),
        confidence: nullable("number"),
      },
      required: ["field", "sourcePage", "evidence", "confidence"],
    },
  },
};

// Keep the Gemini schema deliberately simple. Gemini supports only a subset of
// JSON Schema and rejects the more constrained OpenAI schema as too complex.
const geminiContractItemExtractionSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemCode: nullable("string"),
          groupCode: nullable("string"),
          groupName: nullable("string"),
          serviceDescription: nullable("string"),
          workContent: nullable("string"),
          quantity: nullable("number"),
          unit: nullable("string"),
          serviceLocation: nullable("string"),
          completionDurationDays: nullable("integer"),
          weightPercent: nullable("number"),
          plannedStartDate: nullable("string"),
          plannedEndDate: nullable("string"),
          sourcePage: nullable("integer"),
          evidence: nullable("string"),
          confidence: nullable("number"),
        },
        required: [
          "itemCode",
          "groupCode",
          "groupName",
          "serviceDescription",
          "workContent",
          "quantity",
          "unit",
          "serviceLocation",
          "completionDurationDays",
          "weightPercent",
          "plannedStartDate",
          "plannedEndDate",
          "sourcePage",
          "evidence",
          "confidence",
        ],
      },
    },
  },
  required: ["items"],
};

const geminiContractCreationExtractionSchema = {
  type: "object",
  properties: {
    contract: {
      type: "object",
      properties: geminiExtractedContractProperties,
      required: Object.keys(geminiExtractedContractProperties),
    },
    items: geminiContractItemExtractionSchema.properties.items,
  },
  required: ["contract", "items"],
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GeminiApiError extends Error {
  readonly httpStatus?: number;
  readonly errorStatus?: string;
  readonly errorCode?: number;
  readonly isTransient: boolean;
  readonly model: string;

  constructor(options: {
    message: string;
    httpStatus?: number;
    errorStatus?: string;
    errorCode?: number;
    isTransient: boolean;
    model: string;
  }) {
    super(options.message);
    this.name = "GeminiApiError";
    this.httpStatus = options.httpStatus;
    this.errorStatus = options.errorStatus;
    this.errorCode = options.errorCode;
    this.isTransient = options.isTransient;
    this.model = options.model;
  }
}

function isTransientHttpStatus(
  httpStatus: number,
  payload?: GeminiResponse,
): boolean {
  if (
    httpStatus === 429 ||
    httpStatus === 503 ||
    httpStatus === 502 ||
    httpStatus === 504
  ) {
    return true;
  }

  const errStatus = payload?.error?.status?.toUpperCase();
  if (
    errStatus === "UNAVAILABLE" ||
    errStatus === "RESOURCE_EXHAUSTED"
  ) {
    return true;
  }

  if (
    payload?.error?.code === 429 ||
    payload?.error?.code === 503
  ) {
    return true;
  }

  const errMsg = (payload?.error?.message ?? "").toLowerCase();
  if (
    errMsg.includes("high demand") ||
    errMsg.includes("unavailable") ||
    errMsg.includes("resource exhausted") ||
    errMsg.includes("rate limit") ||
    errMsg.includes("overloaded")
  ) {
    return true;
  }

  return false;
}

function isTransientGeminiError(error: unknown): boolean {
  if (error instanceof GeminiApiError) {
    return error.isTransient;
  }

  if (error instanceof Error) {
    if (
      error.name === "AbortError" ||
      error.name === "TimeoutError"
    ) {
      return true;
    }
    const msg = error.message.toLowerCase();
    return (
      msg.includes("503") ||
      msg.includes("429") ||
      msg.includes("unavailable") ||
      msg.includes("resource_exhausted") ||
      msg.includes("high demand") ||
      msg.includes("timeout")
    );
  }

  return false;
}

function responseText(payload: GeminiResponse) {
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) {
        return part.text;
      }
    }
  }

  throw new Error("GEMINI_OUTPUT_MISSING");
}

function parseTimeout(val: string | undefined, defaultMs: number): number {
  if (!val) return defaultMs;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

function thinkingConfigForModel(model: string) {
  if (model.startsWith("gemini-2.5-flash")) {
    return { thinkingBudget: 0 };
  }
  if (model === "gemini-flash-latest" || model.startsWith("gemini-3.7")) {
    return { thinkingLevel: "low" };
  }
  return { thinkingLevel: "minimal" };
}

export class GeminiContractItemProvider
  implements ContractItemPdfProvider
{
  readonly id = "gemini";

  private readonly apiKey: string | undefined;
  private readonly models: string[];
  private readonly timeoutMs: number;

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    model =
      process.env.TCMS_PDF_AI_MODEL ??
      "gemini-flash-latest",
    timeoutMs = parseTimeout(
      process.env.TCMS_PDF_GEMINI_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
  ) {
    this.apiKey = apiKey;
    const primary = model.replace(/^models\//, "");
    this.models = [
      primary,
      ...DEFAULT_GEMINI_FALLBACK_MODELS.filter((m) => m !== primary),
    ];
    this.timeoutMs = timeoutMs;
  }

  private async resolveApiKey() {
    if (this.apiKey) {
      return this.apiKey;
    }

    const secretFile =
      process.env.GEMINI_API_KEY_FILE;

    if (!secretFile) {
      throw new Error(
        "GEMINI_API_KEY_NOT_CONFIGURED",
      );
    }

    const value = (
      await readFile(secretFile, "utf8")
    ).trim();

    if (!value) {
      throw new Error(
        "GEMINI_API_KEY_NOT_CONFIGURED",
      );
    }

    return value;
  }

  private async attemptExtraction(params: {
    apiKey: string;
    model: string;
    data: Buffer;
    includeContractDraft: boolean;
  }): Promise<ContractItemExtractionResult> {
    const { apiKey, model, data, includeContractDraft } = params;
    const startedAt = Date.now();
    const endpoint =
      "https://generativelanguage.googleapis.com/" +
      "v1beta/models/" +
      `${encodeURIComponent(model)}:generateContent`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Phân tích PDF hợp đồng đã được người dùng xác nhận là đã loại thông tin nhạy cảm.",
                    includeContractDraft
                      ? "Trong đúng một kết quả, trả về contract draft và danh sách items từ cùng PDF này."
                      : "Chỉ trả về danh sách items theo schema.",
                    includeContractDraft
                      ? "Contract draft chỉ gồm các trường trong schema đang có căn cứ trực tiếp; không có căn cứ phải trả null."
                      : "Chỉ trích xuất các hạng mục công việc hoặc dịch vụ có căn cứ trực tiếp trong tài liệu.",
                    "Không suy đoán hoặc tự điền dữ liệu không có trong PDF.",
                    "Trường nào tài liệu không cung cấp thì trả về null.",
                    "Giữ nguyên số liệu và đơn vị trong tài liệu.",
                    "Ngày chỉ trả về dạng YYYY-MM-DD nếu tài liệu đủ rõ; nếu không thì null.",
                    "signedDate là ngày ký. Không dùng ngày ký làm ngày hiệu lực, ngày bắt đầu thực tế hoặc ngày kết thúc.",
                    "contractDurationDays là tổng thời gian thực hiện hợp đồng; serviceProvisionDurationDays là thời gian cung cấp dịch vụ (nếu có, không có thì null); unitExecutionDurationDays là thời gian thực hiện theo đơn vị/tổ máy/phạm vi (nếu có, không có thì null).",
                    "serviceDurationText phải giữ đủ nguyên văn điều khoản/điều kiện thời gian trong hợp đồng.",
                    "unitExecutionTriggerText giữ nguyên mốc kích hoạt bắt đầu tính thời gian (như ngày nhận bàn giao mặt bằng, ngày hợp đồng có hiệu lực...); unitExecutionContinuous chỉ true khi tài liệu ghi rõ liên tục.",
                    "effectiveConditionText giữ nguyên điều kiện để hợp đồng có hiệu lực (nếu có).",
                    "Nếu hợp đồng chỉ có thời hạn tổng thể (ví dụ 60 ngày kể từ ngày bàn giao mặt bằng hoặc 255 ngày kể từ ngày có hiệu lực), chỉ điền contractDurationDays và trigger/serviceDurationText tương ứng, không tự suy ra thời gian đơn vị.",
                    "Không trích xuất đơn vị chủ trì, văn bản giao hợp đồng, ngày mời/họp triển khai, bàn giao thực tế, tiến độ, gia hạn hoặc nhân sự nội bộ từ PDF hợp đồng.",
                    "Mỗi trường contract khác null phải có một phần tử fieldEvidence với đúng tên field, trang, dẫn chứng và độ tin cậy.",
                    "sourcePage là số trang của PDF, bắt đầu từ 1.",
                    "evidence là một dẫn chứng ngắn trực tiếp từ tài liệu.",
                    "confidence là số từ 0 đến 1 thể hiện độ tin cậy của việc trích xuất.",
                    "Chỉ trích xuất các trường có trong JSON schema; không lấy tài khoản, bí mật hoặc dữ liệu ngoài phạm vi tạo hợp đồng.",
                  ].join("\n"),
                },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: data.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 16_384,
            thinkingConfig: thinkingConfigForModel(model),
            responseMimeType: "application/json",
            responseJsonSchema:
              includeContractDraft
                ? geminiContractCreationExtractionSchema
                : geminiContractItemExtractionSchema,
          },
        }),
      });
    } catch (fetchError) {
      const isTimeout =
        fetchError instanceof Error &&
        (fetchError.name === "TimeoutError" ||
          fetchError.name === "AbortError" ||
          fetchError.message.toLowerCase().includes("timeout"));

      console.error("Gemini network/timeout error", {
        model,
        name:
          fetchError instanceof Error
            ? fetchError.name
            : "UnknownError",
        message:
          fetchError instanceof Error
            ? fetchError.message
            : "Unknown",
      });

      throw new GeminiApiError({
        message: isTimeout
          ? `GEMINI_API_TIMEOUT_${this.timeoutMs}MS`
          : `GEMINI_NETWORK_ERROR: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        httpStatus: isTimeout ? 504 : undefined,
        isTransient: true,
        model,
      });
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      console.error("Gemini API error", {
        httpStatus: response.status,
        errorStatus: payload.error?.status,
        errorCode: payload.error?.code,
        errorMessage: payload.error?.message,
        model,
        elapsedMs: Date.now() - startedAt,
      });

      const code =
        payload.error?.status ??
        payload.error?.code ??
        response.status;

      const isTransient = isTransientHttpStatus(
        response.status,
        payload,
      );

      throw new GeminiApiError({
        message: `GEMINI_API_ERROR_${code}`,
        httpStatus: response.status,
        errorStatus: payload.error?.status,
        errorCode: payload.error?.code,
        isTransient,
        model,
      });
    }

    const rawText = responseText(payload);

    let parsed: {
      contract?: ExtractedContractDraft;
      items?: ExtractedContractItem[];
    };

    try {
      parsed = JSON.parse(rawText) as {
        contract?: ExtractedContractDraft;
        items?: ExtractedContractItem[];
      };
    } catch {
      throw new Error("GEMINI_OUTPUT_INVALID_JSON");
    }

    if (!Array.isArray(parsed.items)) {
      throw new Error("GEMINI_OUTPUT_INVALID");
    }
    if (includeContractDraft && (!parsed.contract || typeof parsed.contract !== "object")) {
      throw new Error("GEMINI_CONTRACT_OUTPUT_INVALID");
    }

    console.info("Gemini PDF extraction completed", {
      model,
      elapsedMs: Date.now() - startedAt,
      itemCount: parsed.items.length,
      contractDraftIncluded: Boolean(parsed.contract),
    });

    return {
      providerId: this.id,
      model,
      contract: parsed.contract,
      items: parsed.items,
    };
  }

  async extract(input: {
    data: Buffer;
    fileName: string;
    includeContractDraft?: boolean;
  }): Promise<ContractItemExtractionResult> {
    const apiKey = await this.resolveApiKey();

    let lastError: unknown = null;

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const hasNextModel = i < this.models.length - 1;

      try {
        return await this.attemptExtraction({
          apiKey,
          model,
          data: input.data,
          includeContractDraft: input.includeContractDraft === true,
        });
      } catch (error) {
        lastError = error;
        const isTransient = isTransientGeminiError(error);

        if (isTransient && hasNextModel) {
          const nextModel = this.models[i + 1];
          console.warn(
            `[Gemini] Model "${model}" failed with transient error (${
              error instanceof Error ? error.message : "TRANSIENT_ERROR"
            }). Falling back to "${nextModel}"...`,
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error("GEMINI_EXTRACTION_FAILED");
  }
}
