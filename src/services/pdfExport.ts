/**
 * Shared section-PDF export used by the Management Report (and reusable
 * elsewhere): captures each top-level block of a container as a lossless PNG
 * (html2canvas), lays the blocks out over multi-page A4 landscape, and draws
 * crisp vector-text headers/footers (title, entity, reference/compare dates,
 * page numbers). Same proven clone-fixes as the KPI report export:
 * animations killed and brand colours re-applied on the CLONED DOM only.
 */
export interface SectionPdfOptions {
  root: HTMLElement;
  title: string;          // e.g. "Capital Adequacy"
  entity: string;
  date: string;           // reference date (as of)
  compare?: string;       // comparison period, when relevant
  fileName: string;       // e.g. Report_Capital_Bank_2025-12-31.pdf
}

export const exportSectionPdf = async ({ root, title, entity, date, compare, fileName }: SectionPdfOptions): Promise<void> => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const scale = Math.min(4, Math.max(3, window.devicePixelRatio || 1));

  const onclone = (clonedDoc: Document) => {
    const reset = clonedDoc.createElement('style');
    reset.textContent =
      '*,*::before,*::after{animation:none!important;' +
      'transition:none!important;opacity:1!important;}';
    clonedDoc.head.appendChild(reset);
    const paint = (selector: string, styles: Partial<CSSStyleDeclaration>) => {
      clonedDoc.querySelectorAll<HTMLElement>(selector).forEach(el => Object.assign(el.style, styles));
    };
    paint('.text-brand-text-primary', { color: '#2B3338' });
    paint('.text-brand-text-secondary', { color: '#6B7780' });
    paint('.text-brand-primary', { color: '#8C3A38' });
    paint('.bg-brand-secondary', { backgroundColor: '#52616A', color: '#FFFFFF' });
    paint('.bg-brand-primary', { backgroundColor: '#8C3A38', color: '#FFFFFF' });
    paint('.bg-brand-bg-body', { backgroundColor: '#F4F5F4' });
    paint('.bg-gray-50', { backgroundColor: '#F9FAFB' });
    paint('.text-white', { color: '#FFFFFF' });
  };

  const captureWidth = root.scrollWidth;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentWidth = pdfWidth - margin * 2;
  const headerSpace = 46;
  const gap = 12;

  // Vector header on page 1.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(140, 58, 56);
  pdf.text('MANAGEMENT REPORT', margin, margin + 2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(15);
  pdf.setTextColor(43, 51, 56);
  pdf.text(title, margin, margin + 19);
  const right = pdfWidth - margin;
  pdf.setFontSize(9);
  pdf.text(`Entity:  ${entity}`, right, margin + 2, { align: 'right' });
  pdf.text(`Reference date:  ${date}`, right, margin + 14, { align: 'right' });
  if (compare) {
    pdf.setTextColor(107, 119, 128);
    pdf.text(`Compared to:  ${compare}`, right, margin + 26, { align: 'right' });
  }
  pdf.setDrawColor(43, 51, 56);
  pdf.setLineWidth(0.6);
  pdf.line(margin, margin + 30, right, margin + 30);

  const blocks = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.offsetHeight > 8
  );

  let cursorY = margin + headerSpace;
  const pageBottom = pdfHeight - margin - 14; // keep room for the footer

  for (const block of blocks) {
    const canvas = await html2canvas(block, {
      scale, useCORS: true, backgroundColor: '#ffffff', windowWidth: captureWidth, onclone,
    });
    const imgH = (canvas.height / canvas.width) * contentWidth;
    const png = canvas.toDataURL('image/png');

    if (imgH <= pageBottom - cursorY) {
      pdf.addImage(png, 'PNG', margin, cursorY, contentWidth, imgH, undefined, 'MEDIUM');
      cursorY += imgH + gap;
    } else if (imgH <= pageBottom - margin) {
      pdf.addPage();
      cursorY = margin;
      pdf.addImage(png, 'PNG', margin, cursorY, contentWidth, imgH, undefined, 'MEDIUM');
      cursorY += imgH + gap;
    } else {
      // Block taller than one page: slice it across pages.
      let offset = 0;
      const pageH = pageBottom - margin;
      const slicePx = (pageH / contentWidth) * canvas.width;
      while (offset < canvas.height) {
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.min(slicePx, canvas.height - offset);
        slice.getContext('2d')!.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        pdf.addPage();
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, (slice.height / slice.width) * contentWidth, undefined, 'MEDIUM');
        offset += slice.height;
      }
      cursorY = pageBottom; // force a new page for the next block
    }
  }

  // Footer on every page.
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(107, 119, 128);
    pdf.text(`${entity}  ·  ${title}  ·  ${date}`, margin, pdfHeight - 10);
    pdf.text(`Page ${p} / ${totalPages}`, pdfWidth - margin, pdfHeight - 10, { align: 'right' });
  }

  pdf.save(fileName);
};
