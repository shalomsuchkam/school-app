import { allowPdfNavigation, selectedPdf } from '@/lib/pdfReader';

const pdf = { id: 'abc123', title: 'My document', file: 'abc123.pdf', size: 100 };
it('opens only a PDF previously imported onto this device', () => {
  expect(selectedPdf([pdf], 'abc123')).toEqual(pdf);
  for (const id of ['missing', 'https://books.example/a.pdf', 'file:///private/secret.pdf', '../abc123', ['abc123'], undefined]) {
    expect(selectedPdf([pdf], id)).toBeNull();
  }
  expect(selectedPdf([{ ...pdf, file: '../secret.pdf' }], pdf.id)).toBeNull();
});
it('refuses websites and other files from a local PDF', () => {
  const source = 'file:///app/textbooks/abc123.pdf';
  expect(allowPdfNavigation(source, source)).toBe(true);
  expect(allowPdfNavigation(source, 'about:blank')).toBe(true);
  for (const next of ['https://books.example/a.pdf', 'file:///private/secret.pdf', 'javascript:alert(1)']) {
    expect(allowPdfNavigation(source, next)).toBe(false);
  }
  expect(allowPdfNavigation('https://books.example/a.pdf', 'https://books.example/a.pdf')).toBe(false);
});
