import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { InvoiceData } from "../types";

// --- Configuration Helper ---

const getCleanConfig = (apiKey: string, baseUrl?: string) => {
  let key = apiKey || process.env.API_KEY || '';
  if (!key) {
    throw new Error("API Key is missing. Please configure it in settings.");
  }
  // Sanitize key
  key = key.trim().replace(/[^\x00-\x7F]/g, "");

  let url = baseUrl ? baseUrl.trim() : '';
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  return { key, url };
};

// --- PROMPT DEFINITION ---
const INVOICE_PROMPT = `
分析这张单据图片或PDF，提取报销数据。请使用中文进行分析和提取。
请严格输出纯 JSON 格式，不要包含 Markdown 代码块标记（如 \`\`\`json）。

提取以下字段:
1. invoiceNumber: 发票号码。如果是机票/火车票，使用票号。如果没有，返回 'N/A'。
2. amount: 总金额（数字）。
3. currency: 币种，例如 CNY, USD。
4. date: YYYY-MM-DD 格式。
5. type: 严格从以下选项中选择 ['行程单', '出差审批单', '结账单', '火车票或飞机票', '打车票', '住宿费', '退票费', '其他']。
   - 滴滴/高德/Uber等网约车的行程详情单、电子行程单 -> '行程单'
   - 公司内部的出差申请单、审批单 -> '出差审批单'
   - 酒店/餐厅的预结单、结账单（通常无税务章，仅作为明细） -> '结账单'
   - 飞机行程单（作为发票报销）、火车票、高铁票 -> '火车票或飞机票'
   - 出租车发票、网约车电子发票、过路费发票 -> '打车票'
   - 酒店住宿专用发票 -> '住宿费'
   - 退票手续费收据 -> '退票费'
   - 地铁票、定额发票、办公用品、餐饮发票等 -> '其他'
6. city: 城市或地点信息。
   - 格式要求：省份+城市（如：江苏省南京市, 辽宁省大连市, 北京市北京城区）。
   - 如果是火车票/机票/行程单，提取【出发地】城市。
   - 如果是酒店/餐饮发票，提取商家所在城市。
   - 如果无法确定，返回 '未知'。
7. remarks: 内容摘要 (例如 "酒店住宿", "商务打车")，请使用中文。
8. isReimbursable (boolean): 
   - 设为 TRUE: 仅当文件是正式的税务发票 (Fapiao)、航空运输电子客票行程单、或正式的出租车/网约车发票。
   - 设为 FALSE: 如果 type 是 '行程单'、'出差审批单' 或 '结账单'。如果文件是 "支付截图"、"订单确认单" 或其他非税务发票的收据。
   - 关键: 酒店的 "结账单" 通常有红章，但它不是发票，必须返回 FALSE。网约车 "行程单" 也必须返回 FALSE。
`;

// --- STRATEGY 1: OpenAI SDK (For 'sk-' keys / Proxies) ---

const extractWithOpenAI = async (
  base64: string,
  mimeType: string,
  apiKey: string,
  baseUrl: string,
  modelName: string
): Promise<InvoiceData> => {
  // Default to a model that supports vision if user didn't specify properly
  // But usually proxies map 'gpt-4-vision' or 'gemini-pro' to the right backend
  const targetModel = modelName || "gpt-4-turbo"; 
  
  // For OpenAI SDK, we typically keep the /v1 if the proxy requires it.
  // If user entered 'https://api.laozhang.ai/v1', we use it as is.
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl || undefined,
    dangerouslyAllowBrowser: true // Required for client-side usage
  });

  const response = await client.chat.completions.create({
    model: targetModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: INVOICE_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
        ],
      },
    ],
    // Force JSON object if model supports it, otherwise prompt relies on text
    response_format: { type: "json_object" }, 
    temperature: 0.1, // Low temperature for deterministic extraction
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("OpenAI 返回内容为空");

  try {
    return JSON.parse(content) as InvoiceData;
  } catch (e) {
    console.error("JSON Parse Error", content);
    // Try to clean markdown
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanContent) as InvoiceData;
  }
};

const chatWithOpenAIStream = async (
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  currentMessage: string,
  contextFiles: { base64: string; mimeType: string }[],
  apiKey: string,
  baseUrl: string,
  modelName: string
) => {
  const targetModel = modelName || "gpt-4-turbo";
  
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl || undefined,
    dangerouslyAllowBrowser: true
  });

  // Convert history to OpenAI format
  const messages: any[] = [
    { role: "system", content: "你是一个专业的财务助手。请根据提供的发票和收据回答用户问题。请务必区分“正式发票（可报销）”和“行程单/结账单（仅作参考）”。请始终使用中文回答。" }
  ];

  // Add context files to the *current* user message, as most models don't support history images well or it consumes too many tokens.
  // We construct the last user message with images.
  
  // 1. Add text history
  history.forEach(h => {
    messages.push({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts[0].text
    });
  });

  // 2. Construct current message with images
  const currentContent: any[] = [{ type: "text", text: currentMessage }];
  contextFiles.forEach(file => {
    currentContent.push({
      type: "image_url",
      image_url: {
        url: `data:${file.mimeType};base64,${file.base64}`
      }
    });
  });

  messages.push({ role: "user", content: currentContent });

  const stream = await client.chat.completions.create({
    model: targetModel,
    messages: messages,
    stream: true,
  });

  // Adapt OpenAI stream to a generic async iterable that yields { text: string }
  async function* iterator() {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        yield { text: delta };
      }
    }
  }

  return iterator();
};


// --- STRATEGY 2: Google GenAI SDK (For Native Keys) ---

const extractWithGoogle = async (
  base64: string,
  mimeType: string,
  apiKey: string,
  baseUrl: string,
  modelName: string
): Promise<InvoiceData> => {
  // NOTE: @google/genai SDK does not support baseUrl in constructor options for custom endpoints.
  // Custom baseUrl is ignored here. Use OpenAI strategy (sk- key) for proxies.
  const ai = new GoogleGenAI({ 
    apiKey, 
  });
  
  const targetModel = modelName || "gemini-2.5-flash";

  const response = await ai.models.generateContent({
    model: targetModel,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64,
          },
        },
        { text: INVOICE_PROMPT },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          invoiceNumber: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          date: { type: Type.STRING },
          type: { type: Type.STRING },
          city: { type: Type.STRING },
          remarks: { type: Type.STRING },
          isReimbursable: { type: Type.BOOLEAN },
        },
        required: ["invoiceNumber", "amount", "date", "type", "city", "isReimbursable"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("AI 未返回数据");
  return JSON.parse(text) as InvoiceData;
};

const chatWithGoogleStream = async (
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  currentMessage: string,
  contextFiles: { base64: string; mimeType: string }[],
  apiKey: string,
  baseUrl: string,
  modelName: string
) => {
  // NOTE: @google/genai SDK does not support baseUrl in constructor options for custom endpoints.
  // Custom baseUrl is ignored here. Use OpenAI strategy (sk- key) for proxies.
  const ai = new GoogleGenAI({ 
    apiKey, 
  });
  
  const targetModel = modelName || "gemini-2.5-flash";

  const parts: any[] = [{ text: currentMessage }];
  contextFiles.forEach(file => {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.base64,
      }
    });
  });
  
  const contents = [
    ...history.map(h => ({ role: h.role, parts: h.parts })),
    { role: 'user', parts }
  ];

  const result = await ai.models.generateContentStream({
    model: targetModel,
    contents: contents,
    config: {
      systemInstruction: "你是一个专业的财务助手。请根据提供的发票和收据回答用户问题。请务必区分“正式发票（可报销）”和“行程单/结账单（仅作参考）”。请始终使用中文回答。",
    }
  });

  // Normalize stream to yield { text: string }
  async function* iterator() {
    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        yield { text };
      }
    }
  }

  return iterator();
};


// --- EXPORTED FUNCTIONS WITH ROUTING LOGIC ---

export const extractInvoiceData = async (
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  baseUrl?: string,
  modelName: string = "gemini-2.5-flash"
): Promise<InvoiceData> => {
  const { key, url } = getCleanConfig(apiKey, baseUrl);

  // Retry Wrapper
  const retryOperation = async <T>(operation: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        const msg = error?.message || '';
        // Check for rate limits
        const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests');
        
        // Check for 404 (Model not found / Path error)
        if (msg.includes('404') || msg.includes('Not Found')) {
           throw new Error(`404 错误: 请检查「模型名称」(${modelName}) 是否被您的代理服务支持，以及 Base URL 是否正确。`);
        }

        if (isRateLimit && i < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, i);
          console.warn(`Retry attempt ${i + 1} due to error: ${msg}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
  };

  return retryOperation(() => {
    // ROUTING LOGIC: 'sk-' means OpenAI-compatible Proxy
    if (key.startsWith('sk-')) {
      return extractWithOpenAI(fileBase64, mimeType, key, url, modelName);
    } else {
      return extractWithGoogle(fileBase64, mimeType, key, url, modelName);
    }
  });
};


export const createChatStream = async (
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  currentMessage: string,
  contextFiles: { base64: string; mimeType: string }[],
  apiKey: string,
  baseUrl?: string,
  modelName: string = "gemini-2.5-flash"
) => {
  const { key, url } = getCleanConfig(apiKey, baseUrl);

  if (key.startsWith('sk-')) {
    return chatWithOpenAIStream(history, currentMessage, contextFiles, key, url, modelName);
  } else {
    return chatWithGoogleStream(history, currentMessage, contextFiles, key, url, modelName);
  }
};