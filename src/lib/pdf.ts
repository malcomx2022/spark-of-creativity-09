/**
 * jsPDF et jspdf-autotable chargés à la génération d'un PDF seulement. Importés statiquement, ils
 * entraient dans les tableaux de bord (patient, praticien, coach) : environ 420 ko téléchargés à
 * l'ouverture, avant tout export. Un échec de chargement (hors ligne) rejette la promesse : chaque
 * appelant l'affiche comme une erreur de génération.
 */
export async function loadPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
}
