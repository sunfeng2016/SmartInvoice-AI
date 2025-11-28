import React from 'react';
import { ProcessedFile } from '../types';
import { FileText, CheckCircle, AlertCircle, Loader2, Download, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface InvoiceListProps {
  files: ProcessedFile[];
  onRemove: (id: string) => void;
  onExport: () => void;
}

const InvoiceList: React.FC<InvoiceListProps> = ({ files, onRemove, onExport }) => {
  if (files.length === 0) return null;

  // Calculate total amount only for reimbursable items
  const totalAmount = files.reduce((sum, file) => {
    if (file.status === 'success' && file.data && file.data.isReimbursable) {
      return sum + file.data.amount;
    }
    return sum;
  }, 0);
  
  const currency = files.find(f => f.data?.currency)?.data?.currency || 'CNY'; // Fallback logic

  const getTypeStyle = (type: string | undefined) => {
    switch (type) {
      case '火车票或飞机票':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case '打车票':
        return 'bg-sky-100 text-sky-800 border border-sky-200';
      case '住宿费':
        return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
      case '退票费':
        return 'bg-red-100 text-red-800 border border-red-200';
      case '其他':
        return 'bg-gray-100 text-gray-700 border border-gray-200';
      // Non-reimbursable types generally get warmer/cautionary colors
      case '行程单':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case '结账单':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case '出差审批单':
        return 'bg-purple-100 text-purple-800 border border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800 flex items-center">
          <FileText className="w-4 h-4 mr-2 text-blue-600" />
          已处理文档 ({files.length})
        </h3>
        <button
          onClick={onExport}
          className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4 mr-1.5" />
          导出 Excel
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">文件名</th>
              <th className="px-4 py-3">日期</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">城市</th>
              <th className="px-4 py-3">发票/票据号</th>
              <th className="px-4 py-3 text-right">金额</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const isNotReimbursable = file.status === 'success' && file.data && !file.data.isReimbursable;
              
              return (
                <tr key={file.id} className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${isNotReimbursable ? 'bg-orange-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    {file.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                    {file.status === 'success' && !isNotReimbursable && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {file.status === 'success' && isNotReimbursable && (
                      <div className="relative group cursor-help">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-32 p-2 bg-gray-800 text-white text-xs rounded z-10 z-50">
                          此文件非标准发票，不计入报销
                        </div>
                      </div>
                    )}
                    {file.status === 'error' && (
                       <div className="relative group cursor-help">
                         <AlertCircle className="w-4 h-4 text-red-500" />
                         <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-red-100 text-red-800 border border-red-200 text-xs rounded z-50 whitespace-normal">
                           {file.errorMessage || '解析失败，请重试'}
                         </div>
                       </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={file.name}>
                    {file.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{file.data?.date || '-'}</td>
                  <td className="px-4 py-3">
                     {file.data?.type ? (
                       <div className="flex items-center gap-1">
                         <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getTypeStyle(file.data.type)}`}>
                           {file.data.type}
                         </span>
                         {isNotReimbursable && (
                           <span className="text-xs text-orange-600 font-bold">(非发票)</span>
                         )}
                       </div>
                     ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{file.data?.city || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{file.data?.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {file.data ? (
                      <div className="flex flex-col items-end">
                        <span className={isNotReimbursable ? 'text-gray-400 line-through decoration-gray-400' : ''}>
                          {file.data.currency} {file.data.amount.toFixed(2)}
                        </span>
                        {isNotReimbursable && (
                          <span className="text-[10px] text-orange-600 font-normal">不计入总额</span>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => onRemove(file.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {files.some(f => f.status === 'success') && (
            <tfoot className="bg-gray-50 font-semibold text-gray-900">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-right text-gray-600">可报销总额 (预估):</td>
                <td className="px-4 py-3 text-right text-blue-700">{currency} {totalAmount.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default InvoiceList;