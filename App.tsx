import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import InvoiceList from './components/InvoiceList';
import ChatAssistant from './components/ChatAssistant';
import ApiKeyModal from './components/ApiKeyModal';
import { ProcessedFile } from './types';
import { extractInvoiceData } from './services/geminiService';
import { exportToExcel } from './utils/csvHelper';
import { FileSpreadsheet, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    const storedBaseUrl = localStorage.getItem('gemini_base_url');
    const storedModel = localStorage.getItem('gemini_model_name');
    
    if (storedKey) setApiKey(storedKey);
    if (storedBaseUrl) setBaseUrl(storedBaseUrl);
    if (storedModel) setCustomModel(storedModel);

    if (!storedKey) {
      setIsKeyModalOpen(true);
    }
  }, []);

  const handleSaveKey = (key: string, url?: string, model?: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    
    if (url) {
      setBaseUrl(url);
      localStorage.setItem('gemini_base_url', url);
    } else {
      setBaseUrl('');
      localStorage.removeItem('gemini_base_url');
    }

    if (model) {
      setCustomModel(model);
      localStorage.setItem('gemini_model_name', model);
    } else {
      setCustomModel('');
      localStorage.removeItem('gemini_model_name');
    }
  };

  // Helper to convert file to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix for API usage (e.g., "data:image/jpeg;base64,")
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Helper delay function
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (!apiKey) {
      setIsKeyModalOpen(true);
      return;
    }

    setIsGlobalProcessing(true);

    const newProcessedFiles: ProcessedFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type,
      status: 'processing',
      base64: '', // Placeholder
      mimeType: file.type
    }));

    // Add to state immediately to show loaders
    setFiles(prev => [...prev, ...newProcessedFiles]);

    // Adaptive delay based on model
    // Proxies/Pro models often have stricter rate limits than Flash
    const isCustomModel = customModel && customModel.trim() !== '';
    const processingDelay = isCustomModel ? 35000 : 15000;

    // Process each file
    for (let i = 0; i < selectedFiles.length; i++) {
      if (i > 0) {
        await delay(processingDelay); 
      }

      const file = selectedFiles[i];
      const tempId = newProcessedFiles[i].id;

      try {
        const base64 = await fileToBase64(file);
        
        // Update base64 in state for Chat usage later
        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, base64 } : f));

        // Call Gemini for extraction with custom config
        const data = await extractInvoiceData(base64, file.type, apiKey, baseUrl, customModel);

        setFiles(prev => {
           // Check for duplicates based on invoice number
           const isDuplicate = prev.some(existing => 
             existing.id !== tempId && 
             existing.status === 'success' && 
             existing.data?.invoiceNumber === data.invoiceNumber && 
             data.invoiceNumber !== 'N/A'
           );
           
           if (isDuplicate) {
             return prev.map(f => f.id === tempId ? { 
               ...f, 
               status: 'error', 
               errorMessage: '检测到重复发票' 
             } : f);
           }

           return prev.map(f => f.id === tempId ? { ...f, status: 'success', data } : f);
        });

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        
        // Detect 429 Error (Robust Check)
        const errorMsg = error?.message || error?.toString() || '';
        const errorStr = JSON.stringify(error);
        const isRateLimit = 
          error?.status === 429 || 
          error?.code === 429 || 
          error?.response?.status === 429 ||
          error?.error?.code === 429 ||
          error?.error?.status === 'RESOURCE_EXHAUSTED' ||
          errorMsg.includes('429') ||
          errorMsg.includes('RESOURCE_EXHAUSTED') ||
          errorMsg.includes('quota') ||
          errorStr.includes('RESOURCE_EXHAUSTED') ||
          errorStr.includes('"code":429');

        // Use the actual error message if it's not a standard rate limit error (e.g. 404, 401)
        const errorMessage = isRateLimit 
          ? 'API 配额已满或请求过快，请稍候再试' 
          : (error.message || '解析失败，请检查文件及API配置');

        setFiles(prev => prev.map(f => f.id === tempId ? { 
          ...f, 
          status: 'error', 
          errorMessage 
        } : f));
      }
    }

    setIsGlobalProcessing(false);
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleExport = () => {
    const successFiles = files
      .filter(f => f.status === 'success' && f.data)
      .map(f => f.data!);
    
    if (successFiles.length > 0) {
      // Export to Excel (.xlsx)
      exportToExcel(successFiles, `发票汇总_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else {
      alert("没有可导出的数据。");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <ApiKeyModal 
        isOpen={isKeyModalOpen} 
        onClose={() => setIsKeyModalOpen(false)} 
        onSave={handleSaveKey} 
        savedKey={apiKey}
        savedBaseUrl={baseUrl}
        savedModelName={customModel}
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              智能发票助手
            </h1>
          </div>
          <button 
            onClick={() => setIsKeyModalOpen(true)}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
            title="API 设置"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-medium">配置 API Key</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Documents (7/12) */}
          <div className="lg:col-span-7 space-y-6">
             <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 text-slate-800">上传发票文件</h2>
              <FileUpload onFilesSelected={handleFilesSelected} isProcessing={isGlobalProcessing} />
            </div>

            <InvoiceList 
              files={files} 
              onRemove={handleRemoveFile} 
              onExport={handleExport} 
            />
          </div>

          {/* Right Column: Chat (5/12) */}
          <div className="lg:col-span-5">
             <ChatAssistant 
               files={files} 
               apiKey={apiKey}
               baseUrl={baseUrl}
               modelName={customModel}
               onOpenSettings={() => setIsKeyModalOpen(true)}
             />
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;