import { expect, it } from 'vitest';
import { loadPdf } from '../pdf';

it('charge jsPDF et jspdf-autotable à la demande et produit un tableau', async () => {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF();
  autoTable(doc, { head: [['Libellé', 'Montant']], body: [['Consultation', '15 000 XOF']] });
  const lastAutoTable = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  expect(lastAutoTable?.finalY).toBeGreaterThan(0);
  expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0);
});
