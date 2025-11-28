import React, { useCallback } from 'react';
import { Upload, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isProcessing }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      // Reset input
      e.target.value = ''; 
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [isProcessing, onFilesSelected]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 
        ${isProcessing 
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-70' 
          : 'border-blue-300 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer'
        }`}
    >
      <input
        type="file"
        multiple
        accept="image/*,.pdf"
        onChange={handleFileChange}
        disabled={isProcessing}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
        {isProcessing ? (
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        ) : (
          <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
        )}
        
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          {isProcessing ? '正在智能分析...' : '上传发票 / 票据'}
        </h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto mb-4">
          点击选择或拖拽文件到此处。支持 PDF, JPG, PNG 格式。
        </p>
        
        {!isProcessing && (
          <div className="flex gap-2 text-xs text-gray-400">
             <span className="flex items-center"><FileText className="w-3 h-3 mr-1" /> PDF</span>
             <span className="flex items-center"><ImageIcon className="w-3 h-3 mr-1" /> 图片</span>
          </div>
        )}
      </label>
    </div>
  );
};

export default FileUpload;