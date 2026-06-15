import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Save, ShieldCheck, X, Settings, Globe, Cpu, ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string, baseUrl?: string, modelName?: string) => void;
  savedKey: string;
  savedBaseUrl?: string;
  savedModelName?: string;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  savedKey, 
  savedBaseUrl = '', 
  savedModelName = '' 
}) => {
  const [key, setKey] = useState(savedKey);
  const [baseUrl, setBaseUrl] = useState(savedBaseUrl);
  const [modelName, setModelName] = useState(savedModelName);
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setKey(savedKey);
    setBaseUrl(savedBaseUrl);
    setModelName(savedModelName);
    if (savedBaseUrl || savedModelName) {
      setShowAdvanced(true);
    }
  }, [savedKey, savedBaseUrl, savedModelName, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Sanitize input
    const cleanKey = key.trim().replace(/[^\x00-\x7F]/g, "");
    const cleanBaseUrl = baseUrl.trim();
    const cleanModel = modelName.trim();
    
    onSave(cleanKey, cleanBaseUrl, cleanModel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-blue-600">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Key className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">API 配置</h2>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
              <ShieldCheck className="w-5 h-5 flex-shrink-0" />
              <p>
                您的 Key 仅保存在浏览器本地，直接发送至接口。
              </p>
            </div>

            {/* API Key Input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  API Key
                </label>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center transition-colors"
                  title="点击前往 Google AI Studio 获取"
                >
                  获取 Google API Key
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="AIzaSy... 或 sk-..."
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Advanced Toggle */}
            <div>
              <button 
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center text-sm text-gray-500 hover:text-blue-600 transition-colors"
              >
                <Settings className="w-4 h-4 mr-1" />
                {showAdvanced ? '隐藏高级设置' : '显示高级设置 (自定义地址/模型)'}
              </button>
            </div>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-4 pt-2 border-t border-gray-100 animate-in slide-in-from-top-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Globe className="w-3 h-3 mr-1" /> Base URL (选填)
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://your-api-host.com 或 https://your-api-host.com/v1"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    用于 OpenAI-compatible 中转服务。可填写根域名或 /v1 地址；系统会自动补齐 /v1。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Cpu className="w-3 h-3 mr-1" /> 模型名称 (必填)
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="gemini-2.5-flash"
                    list="model-suggestions"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
                  />
                  <datalist id="model-suggestions">
                    <option value="gemini-2.5-flash" />
                    <option value="gemini-3-pro-preview-aistudio-8" />
                    <option value="gemini-3-pro-preview-5" />
                    <option value="gemini-3-pro-preview-gcp-6" />
                    <option value="gemini-3-pro-preview-7" />
                  </datalist>
                  <p className="text-xs text-gray-400 mt-1">
                    若使用代理，请务必填写支持的模型ID (如: gemini-3-pro-preview-aistudio-8)。<br/>
                    <span className="text-red-500">注意: 不填或填错会导致 404 错误。</span>
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;