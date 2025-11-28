import { utils, writeFile } from 'xlsx';
import { InvoiceData } from "../types";

export const exportToExcel = (data: InvoiceData[], filename: string) => {
  // 1. Filter: Only keep reimbursable invoices
  const validData = data.filter(d => d.isReimbursable);

  if (validData.length === 0) {
    alert("没有有效的发票数据可导出 (已过滤掉行程单、结账单等非报销凭证)");
    return;
  }

  // 2. Prepare Data Structure
  const headers = [
    '发票号码', 
    '发票号码(后8位)', 
    '日期', 
    '类型', 
    '城市', 
    '金额', 
    '币种', 
    '备注'
  ];

  const rows = validData.map(item => {
    const invoiceNo = item.invoiceNumber && item.invoiceNumber !== 'N/A' ? item.invoiceNumber : '';
    // Get last 8 digits if possible
    const suffix = invoiceNo.length > 8 ? invoiceNo.slice(-8) : invoiceNo;

    return [
      invoiceNo,    // A
      suffix,       // B
      item.date,    // C
      item.type,    // D
      item.city,    // E
      item.amount,  // F
      item.currency,// G
      item.remarks  // H
    ];
  });

  const worksheetData = [headers, ...rows];

  // 3. Create Worksheet
  const ws = utils.aoa_to_sheet(worksheetData);

  // 4. Force "Text" format for Invoice Number columns (A and B) to preserve leading zeros
  const range = utils.decode_range(ws['!ref'] || 'A1:H1');
  
  for (let R = 1; R <= range.e.r; ++R) { // Skip header row (0)
    // Column A (Invoice No) and Column B (Suffix)
    [0, 1].forEach(C => {
      const cellAddress = utils.encode_cell({ r: R, c: C });
      if (ws[cellAddress]) {
        ws[cellAddress].t = 's'; // Set type to String
        ws[cellAddress].z = '@'; // Set format to Text
      }
    });
  }

  // Auto-adjust column widths (approximation)
  const wscols = [
    { wch: 20 }, // A: Invoice No
    { wch: 15 }, // B: Suffix
    { wch: 12 }, // C: Date
    { wch: 12 }, // D: Type
    { wch: 20 }, // E: City
    { wch: 10 }, // F: Amount
    { wch: 8 },  // G: Currency
    { wch: 30 }, // H: Remarks
  ];
  ws['!cols'] = wscols;

  // 5. Create Workbook and Write
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "发票汇总");

  // Ensure filename ends in .xlsx
  const finalFilename = filename.endsWith('.xlsx') ? filename : filename.replace(/\.[^/.]+$/, "") + ".xlsx";
  
  writeFile(wb, finalFilename);
};