import { readFile } from "node:fs/promises";
import type {
  ContractItemExtractionResult,
  ContractItemPdfProvider,
  ExtractedContractDraft,
  ExtractedContractItem,
} from "./contract-item-import";

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const nullableInteger = { type: ["integer", "null"] };
const nullableBoolean = { type: ["boolean", "null"] };

const extractedContractProperties = {
  contractNumber: nullableString,
  signedDate: nullableString,
  packageName: nullableString,
  contractorName: nullableString,
  contractorAddress: nullableString,
  contractorPhone: nullableString,
  contractorRepresentative: nullableString,
  contractDurationDays: nullableInteger,
  serviceProvisionDurationDays: nullableInteger,
  serviceDurationText: nullableString,
  unitExecutionDurationDays: nullableInteger,
  unitExecutionContinuous: nullableBoolean,
  unitExecutionTriggerText: nullableString,
  effectiveConditionText: nullableString,
  fieldEvidence: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        field: nullableString,
        sourcePage: nullableInteger,
        evidence: nullableString,
        confidence: nullableNumber,
      },
      required: ["field", "sourcePage", "evidence", "confidence"],
    },
  },
} as const;

const extractedContractRequired = Object.keys(extractedContractProperties);

export const contractItemExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemCode: nullableString,
          groupCode: nullableString,
          groupName: nullableString,
          serviceDescription: nullableString,
          workContent: nullableString,
          quantity: nullableNumber,
          unit: nullableString,
          serviceLocation: nullableString,
          completionDurationDays: nullableInteger,
          weightPercent: nullableNumber,
          plannedStartDate: nullableString,
          plannedEndDate: nullableString,
          sourcePage: nullableInteger,
          evidence: nullableString,
          confidence: nullableNumber,
        },
        required: [
          "itemCode", "groupCode", "groupName", "serviceDescription", "workContent", "quantity", "unit",
          "serviceLocation", "completionDurationDays", "weightPercent", "plannedStartDate", "plannedEndDate",
          "sourcePage", "evidence", "confidence",
        ],
      },
    },
  },
  required: ["items"],
} as const;

export const contractCreationExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    contract: {
      type: "object",
      additionalProperties: false,
      properties: extractedContractProperties,
      required: extractedContractRequired,
    },
    items: contractItemExtractionSchema.properties.items,
  },
  required: ["contract", "items"],
} as const;

type OpenAiResponse = {
  status?: string;
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { message?: string };
};

function responseText(response: OpenAiResponse) {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") throw new Error("AI_REFUSED_DOCUMENT");
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("AI_OUTPUT_MISSING");
}

export class OpenAiContractItemProvider implements ContractItemPdfProvider {
  readonly id = "openai";
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.TCMS_PDF_AI_MODEL ?? "gpt-5.6",
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async resolveApiKey() {
    if (this.apiKey) return this.apiKey;
    const secretFile = process.env.OPENAI_API_KEY_FILE;
    if (!secretFile) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    const value = (await readFile(secretFile, "utf8")).trim();
    if (!value) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    return value;
  }

  async extract(input: {
    data: Buffer;
    fileName: string;
    includeContractDraft?: boolean;
  }): Promise<ContractItemExtractionResult> {
    const apiKey = await this.resolveApiKey();
    const includeContractDraft = input.includeContractDraft === true;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: [
          includeContractDraft
            ? "Trích xuất đồng thời thông tin hợp đồng và các hạng mục công việc/dịch vụ từ cùng một PDF."
            : "Trích xuất các hạng mục công việc/dịch vụ có căn cứ trực tiếp trong PDF hợp đồng.",
          "Không suy đoán hoặc tự điền dữ liệu không có trong tài liệu; trường thiếu phải là null.",
          "Giữ nguyên đơn vị và số liệu. Ngày trả về dạng YYYY-MM-DD nếu tài liệu đủ rõ, nếu không để null.",
          "signedDate là ngày ký. Không được dùng ngày ký để điền ngày hiệu lực, ngày bắt đầu thực tế hoặc ngày kết thúc.",
          "contractDurationDays là tổng thời gian hợp đồng; serviceProvisionDurationDays là thời gian cung cấp dịch vụ (nếu có, không có thì null); unitExecutionDurationDays là thời gian thực hiện theo đơn vị/phạm vi (nếu có, không có thì null).",
          "serviceDurationText giữ nguyên đầy đủ nguyên văn điều khoản thời gian; unitExecutionTriggerText giữ nguyên mốc kích hoạt thời gian (như ngày nhận bàn giao mặt bằng, ngày hợp đồng có hiệu lực...); unitExecutionContinuous chỉ true khi tài liệu nêu rõ liên tục.",
          "effectiveConditionText giữ nguyên điều kiện để hợp đồng có hiệu lực (nếu có).",
          "Nếu hợp đồng chỉ có thời hạn tổng thể (ví dụ 60 ngày từ ngày bàn giao mặt bằng hoặc 255 ngày từ ngày có hiệu lực), chỉ điền contractDurationDays và trigger/serviceDurationText tương ứng, không tự suy ra thời gian đơn vị.",
          "Không trích xuất đơn vị chủ trì, văn bản giao hợp đồng, ngày mời/họp triển khai, bàn giao thực tế, tiến độ, gia hạn hoặc nhân sự nội bộ từ PDF hợp đồng.",
          "Với mỗi trường contract khác null, fieldEvidence phải có field đúng tên schema, sourcePage, evidence và confidence tương ứng.",
          "evidence là một đoạn dẫn chứng ngắn, sourcePage là số trang bắt đầu từ 1, confidence từ 0 đến 1.",
          "Chỉ trích xuất các trường có trong JSON schema; không lấy tài khoản, bí mật hoặc dữ liệu ngoài phạm vi tạo hợp đồng.",
        ].join("\n"),
        input: [{
          role: "user",
          content: [
            { type: "input_file", filename: input.fileName, file_data: `data:application/pdf;base64,${input.data.toString("base64")}` },
            {
              type: "input_text",
              text: includeContractDraft
                ? "Phân tích PDF đã được xác nhận là đã loại thông tin nhạy cảm và trả về một contract draft cùng danh sách items trong một kết quả."
                : "Phân tích PDF đã được người dùng xác nhận là đã loại thông tin nhạy cảm và trả về danh sách hạng mục hợp đồng.",
            },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: includeContractDraft ? "tcms_contract_and_items" : "tcms_contract_items",
            strict: true,
            schema: includeContractDraft ? contractCreationExtractionSchema : contractItemExtractionSchema,
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({})) as OpenAiResponse;
    if (!response.ok) throw new Error(`OPENAI_API_ERROR_${response.status}`);
    if (payload.status && payload.status !== "completed") throw new Error("OPENAI_RESPONSE_INCOMPLETE");

    const parsed = JSON.parse(responseText(payload)) as {
      contract?: ExtractedContractDraft;
      items?: ExtractedContractItem[];
    };
    if (!Array.isArray(parsed.items)) throw new Error("AI_OUTPUT_INVALID");
    if (includeContractDraft && (!parsed.contract || typeof parsed.contract !== "object")) {
      throw new Error("AI_CONTRACT_OUTPUT_INVALID");
    }
    return {
      providerId: this.id,
      model: this.model,
      contract: parsed.contract,
      items: parsed.items,
    };
  }
}
