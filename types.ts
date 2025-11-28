
export interface ProcessedFile {
  id: string;
  name: string;
  type: string;
  base64: string; // Base64 data without prefix for API, or with prefix for preview if needed
  mimeType: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  data?: InvoiceData;
  errorMessage?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: '行程单' | '出差审批单' | '结账单' | '火车票或飞机票' | '打车票' | '住宿费' | '退票费' | '其他';
  currency: string;
  city: string;
  remarks: string;
  isReimbursable: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}