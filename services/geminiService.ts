import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { InvoiceData } from "../types";

// --- Configuration Helper ---

const getCleanConfig = (apiKey: string, baseUrl?: string) => {
  let key = apiKey || '';
  
  // Also check process.env.API_KEY for legacy support if defined
  if (!key && typeof process !== 'undefined' && process.env?.API_KEY) {
    key = process.env.API_KEY;
  }
  
  if (!key) {
    throw new Error("API Key is missing. Please configure it in settings.");
  }
  // Sanitize key
  key = key.trim().replace(/[^\x00-\x7F]/g, "");

  let url = baseUrl ? baseUrl.trim() : '';
  
  return { key, url };
};

// --- PROMPT DEFINITION ---
const INVOICE_PROMPT = `
分析这张单据图片或PDF，提取报销数据。请使用中文进行分析和提取。
请严格输出纯 JSON 格式，不要包含 Markdown 代码块标记。

**任务关键指令**:
你是一个专业的财务审核机器人。你的核心任务是准确区分发票类型并提取城市。

**字段提取规则**:

1. **type** (单据类型): 严格从以下列表中选择一项。
   - **['打车票']**: 
     - 包含: 出租车发票、过路费发票。
     - ***强制规则***: 所有网约车平台（如 **阳光出行、滴滴出行、T3出行、曹操出行、高德打车**）开具的**电子发票** (通常标题有"发票"二字，有红色税务章)，必须归类为 '打车票'。
     - *注意*: 不要因为看到是 PDF 或电子票就归类为 '火车票或飞机票'。网约车发票是 '打车票'。
   - **['火车票或飞机票']**: 
     - 包含: 飞机行程单 (蓝色/绿色长条票)、火车票 (红色/蓝色票)、航空运输电子客票行程单。
     - *注意*: 只有真正的航空/铁路票据才属此类。
   - **['住宿费']**: 酒店住宿专用发票、代订房费发票。
   - **['行程单']**: 
     - 包含: 网约车 APP 内截图的行程详情、无国税局监制章的"行程单"、无金额的订单确认页。
     - *注意*: 只要没有红色发票专用章，通常就是 '行程单' (不可报销)。
   - **['出差审批单']**: 公司内部审批流程单据。
   - **['结账单']**: 酒店/餐厅的"结账单"、"预结单" (无发票章)。
   - **['退票费']**: 退票手续费收据。
   - **['其他']**: 地铁票、公交票、定额发票、餐饮、办公用品。

2. **city** (城市): 格式为 "省份+城市" (如 "北京市北京城区", "江苏省南京市")。
   - **网约车/出租车规则 (最高优先级)**: 
     - 必须优先检查 **【销售方名称】** 或 **【发票章】** 中的地名。
     - 示例: 销售方是 "北京阳光出行科技..." -> 提取 "北京市北京城区"。
     - 示例: 销售方是 "南京滴滴..." -> 提取 "江苏省南京市"。
     - 示例: 销售方是 "江苏东台..." -> 提取 "江苏省东台市"。
     - 只有在销售方不包含地名时，才尝试查找上下车地点。
   - **火车/飞机**: 提取【出发地】城市。
   - **住宿/其他**: 提取服务发生地或商户所在地。

3. **invoiceNumber**: 发票号码/票号。无则返回 'N/A'。
4. **amount**: 总金额 (Number)。
5. **currency**: 币种 (CNY/USD)。
6. **date**: YYYY-MM-DD。
7. **remarks**: 中文摘要 (如 "商务出行", "酒店住宿")。
8. **isReimbursable** (Boolean):
   - TRUE: 正式发票 (含网约车电子发票)、航空行程单、火车票。
   - FALSE: 行程单、结账单、审批单、无章收据。

请仔细检查图片内容，特别是针对 "阳光出行" 发票，请务必将其识别为 "打车票" 并从销售方提取城市。
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
  const retryOperation = async <T>(operation: () => Promise<T>, maxRetries = 7, initialDelay = 10000): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        const msg = error?.message || '';
        // Check for rate limits
        const isRateLimit = 
          msg.includes('429') || 
          msg.includes('quota') || 
          msg.includes('Too Many Requests') ||
          error?.status === 429;
        
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