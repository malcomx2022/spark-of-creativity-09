import { useState } from 'react';
import type { TermsType } from '@/components/TermsDialog';

// Hook pour gérer l'état des dialogues de termes
export function useTermsDialogs() {
  const [openDialog, setOpenDialog] = useState<TermsType | null>(null);
  
  return {
    openDialog,
    openCGU: () => setOpenDialog('cgu'),
    openCharte: () => setOpenDialog('charte'),
    openPrivacy: () => setOpenDialog('privacy'),
    closeDialog: () => setOpenDialog(null),
    isOpen: (type: TermsType) => openDialog === type,
  };
}
