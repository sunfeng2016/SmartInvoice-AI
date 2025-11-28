import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, FileCheck, Settings } from 'lucide-react';
import { ChatMessage, ProcessedFile } from '../types';
import { createChatStream } from '../services/geminiService';

interface ChatAssistantProps {
  files: ProcessedFile[];
  apiKey: string;
  baseUrl?: string;
  modelName?: string;
  onOpenSettings: () => void;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ files, apiKey, baseUrl, modelName, onOpenSettings }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'model',
      text: '你好！我是你的智能财务助手。我已经准备好分析你上传的单据。你可以问我关于费用汇总、行程细节或任何发票相关的问题。',
      timestamp: Date.now()
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    if (!apiKey) {
      onOpenSettings();
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Filter only successfully processed files or raw files pending process
      // We pass the base64 data to the chat context
      const validFiles = files.filter(f => f.status === 'success' || f.base64).map(f => ({
        base64: f.base64,
        mimeType: f.mimeType
      }));

      // Convert UI messages to API history format
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const stream = await createChatStream(
        history, 
        userMsg.text, 
        validFiles, 
        apiKey,
        baseUrl,
        modelName
      );
      
      let fullResponse = "";
      const botMsgId = (Date.now() + 1).toString();
      
      // Add placeholder bot message
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now()
      }]);

      for await (const chunk of stream) {
        const text = chunk.text; 
        if (text) {
          fullResponse += text;
          setMessages(prev => prev.map(msg => 
            msg.id === botMsgId ? { ...msg, text: fullResponse } : msg
          ));
        }
      }

    } catch (error) {
      console.error("Chat error", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "抱歉，分析文档时出现了错误，请稍后重试。如果配置了自定义 Key 或 Model，请检查配置是否正确。",
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-white rounded-xl shadow-sm border border-gray-200 sticky top-24">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800 flex items-center">
          <Bot className="w-5 h-5 mr-2 text-blue-600" />
          AI 财务助手
        </h3>
        <span className="text-xs text-gray-500 flex items-center bg-white px-2 py-1 rounded-full border border-gray-200">
          <FileCheck className="w-3 h-3 mr-1 text-green-500" />
          {successCount} 份文档已就绪
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' && msg.text === '' ? (
                <span className="flex items-center">
                   <Loader2 className="w-4 h-4 animate-spin mr-2" /> 思考中...
                </span>
              ) : (
                msg.text.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i !== msg.text.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
        ))}
        {!apiKey && messages.length === 1 && (
          <div className="flex justify-center">
             <button 
               onClick={onOpenSettings}
               className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 hover:bg-blue-100 flex items-center"
             >
               <Settings className="w-3 h-3 mr-1" />
               配置 API Key 以开始对话
             </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-100">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={files.length > 0 ? "您可以问：这几张票一共多少钱？或者 有没有非报销单据？" : "请先上传文件..."}
            disabled={files.length === 0 || isTyping}
            className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none text-sm disabled:opacity-50"
            rows={1}
            style={{ minHeight: '46px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || files.length === 0 || isTyping}
            className="absolute right-2 top-1.5 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatAssistant;