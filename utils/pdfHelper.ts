import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface RenderedPdfPage {
  base64: string;
  mimeType: 'image/png';
}

const dataUrlToBase64 = (dataUrl: string) => dataUrl.split(',')[1] || '';

export const renderPdfToPngPages = async (
  file: File,
  maxPages = 6,
  scale = 2
): Promise<RenderedPdfPage[]> => {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: RenderedPdfPage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('浏览器不支持 Canvas，无法渲染 PDF');
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    pages.push({
      base64: dataUrlToBase64(canvas.toDataURL('image/png')),
      mimeType: 'image/png',
    });
  }

  if (pdf.numPages > maxPages) {
    console.warn(
      'PDF ' + file.name + ' has ' + pdf.numPages + ' pages; only the first ' + maxPages + ' pages were sent for analysis.'
    );
  }

  return pages;
};
