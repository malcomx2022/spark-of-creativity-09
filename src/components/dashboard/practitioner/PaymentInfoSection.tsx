import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  Loader2,
  Phone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

interface PaymentInfoSectionProps {
  practitionerId: string;
  practitionerName?: string | null;
}

type PaymentMethod = "mtn" | "orange" | "moov" | "bank";

interface PractitionerPaymentInfo {
  id: string;
  practitioner_id: string;
  payment_method: PaymentMethod;
  phone_number: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  account_holder_name: string;
  is_verified: boolean | null;
}

interface FormState {
  accountHolderName: string;
  phoneNumber: string;
  bankName: string;
  bankAccountNumber: string;
}

interface FormErrors {
  accountHolderName?: string;
  phoneNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
}

const methodLabels: Record<PaymentMethod, string> = {
  mtn: "MTN Mobile Money",
  orange: "Orange Money",
  moov: "Moov Money",
  bank: "Compte bancaire",
};

const methodDescriptions: Record<PaymentMethod, string> = {
  mtn: "Recevez vos versements sur votre numéro MTN Mobile Money.",
  orange: "Recevez vos versements sur votre numéro Orange Money.",
  moov: "Recevez vos versements sur votre numéro Moov Money.",
  bank: "Recevez vos versements directement sur votre compte bancaire.",
};

const sanitizePhoneNumber = (value: string) => value.replace(/\s+/g, "");
const sanitizeAccountNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();

const isValidPhoneNumber = (value: string) => {
  const normalized = sanitizePhoneNumber(value);
  return /^\+?[0-9]{8,15}$/.test(normalized);
};

const isValidBankAccountNumber = (value: string) => {
  const normalized = sanitizeAccountNumber(value);
  return /^[0-9A-Za-z]{8,34}$/.test(normalized);
};

export function PaymentInfoSection({ practitionerId, practitionerName }: PaymentInfoSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("mtn");
  const [formState, setFormState] = useState<FormState>({
    accountHolderName: practitionerName || "",
    phoneNumber: "",
    bankName: "",
    bankAccountNumber: "",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isVerified, setIsVerified] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingAction, setPendingAction] = useState<"verify" | "save" | null>(null);

  const { data: paymentInfos, isLoading } = useQuery({
    queryKey: ["practitioner-payment-info", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_payment_info")
        .select("*")
        .eq("practitioner_id", practitionerId);

      if (error) {
        console.error("Erreur récupération payment info", error);
        throw error;
      }

      return (data || []) as PractitionerPaymentInfo[];
    },
    enabled: !!practitionerId,
  });

  useEffect(() => {
    if (!paymentInfos || paymentInfos.length === 0) return;

    const methodExists = paymentInfos.some((info) => info.payment_method === selectedMethod);
    if (!methodExists) {
      const preferred = paymentInfos.find((info) => info.is_verified) || paymentInfos[0];
      setSelectedMethod(preferred.payment_method);
    }
  }, [paymentInfos, selectedMethod]);

  useEffect(() => {
    if (!paymentInfos) return;

    const info = paymentInfos.find((item) => item.payment_method === selectedMethod);

    setFormState({
      accountHolderName: info?.account_holder_name || practitionerName || "",
      phoneNumber: info?.phone_number || "",
      bankName: info?.bank_name || "",
      bankAccountNumber: info?.bank_account_number || "",
    });
    setIsVerified(!!info?.is_verified);
    setFormErrors({});
    setHasChanges(false);
  }, [paymentInfos, selectedMethod, practitionerName]);

  const mutation = useMutation({
    mutationFn: async (payload: { verify: boolean }) => {
      const sanitizedPhone = selectedMethod === "bank" ? null : sanitizePhoneNumber(formState.phoneNumber);
      const sanitizedAccount = selectedMethod === "bank" ? sanitizeAccountNumber(formState.bankAccountNumber) : null;

      const updatePayload = {
        practitioner_id: practitionerId,
        payment_method: selectedMethod,
        account_holder_name: formState.accountHolderName.trim(),
        phone_number: selectedMethod === "bank" ? null : sanitizedPhone,
        bank_name: selectedMethod === "bank" ? formState.bankName.trim() || null : null,
        bank_account_number: selectedMethod === "bank" ? sanitizedAccount : null,
        is_verified: payload.verify,
      };

      if (payload.verify) {
        const { error: resetError } = await supabase
          .from("practitioner_payment_info")
          .update({ is_verified: false })
          .eq("practitioner_id", practitionerId)
          .neq("payment_method", selectedMethod);

        if (resetError) {
          console.error("Erreur lors de la réinitialisation des vérifications", resetError);
          throw resetError;
        }
      }

      const { data, error } = await supabase
        .from("practitioner_payment_info")
        .upsert(updatePayload, { onConflict: "practitioner_id,payment_method" })
        .select()
        .single();

      if (error) {
        console.error("Erreur mise à jour payment info", error);
        throw error;
      }

      return data as PractitionerPaymentInfo;
    },
    onSuccess: (data, variables) => {
      setIsVerified(!!data.is_verified);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["practitioner-payment-info", practitionerId] });

      toast({
        title: variables.verify ? "Informations vérifiées" : "Informations enregistrées",
        description: variables.verify
          ? "Vos informations de reversement ont été vérifiées."
          : "Vos informations de reversement ont été sauvegardées.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Impossible d'enregistrer",
        description: error?.message || "Une erreur est survenue lors de la sauvegarde.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setPendingAction(null);
    },
  });

  const handleFieldChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    setHasChanges(true);
    if (isVerified) {
      setIsVerified(false);
    }
  };

  const validateForm = () => {
    const errors: FormErrors = {};

    if (!formState.accountHolderName.trim()) {
      errors.accountHolderName = "Le nom du titulaire est obligatoire.";
    }

    if (selectedMethod === "bank") {
      if (!formState.bankName.trim()) {
        errors.bankName = "Le nom de la banque est obligatoire.";
      }

      if (!formState.bankAccountNumber.trim()) {
        errors.bankAccountNumber = "Le numéro de compte est obligatoire.";
      } else if (!isValidBankAccountNumber(formState.bankAccountNumber)) {
        errors.bankAccountNumber = "Numéro de compte invalide (8 à 34 caractères alphanumériques).";
      }
    } else {
      if (!formState.phoneNumber.trim()) {
        errors.phoneNumber = "Le numéro Mobile Money est obligatoire.";
      } else if (!isValidPhoneNumber(formState.phoneNumber)) {
        errors.phoneNumber = "Numéro de téléphone invalide (8 à 15 chiffres, + optionnel).";
      }
    }

    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast({
        title: "Champs invalides",
        description: "Veuillez corriger les erreurs avant de continuer.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSave = (verify: boolean) => {
    if (!validateForm()) return;

    setPendingAction(verify ? "verify" : "save");
    mutation.mutate({ verify });
  };

  if (!practitionerId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration des reversements</CardTitle>
          <CardDescription>Chargement des informations de paiement...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Chargement...</span>
        </CardContent>
      </Card>
    );
  }

  const showVerifyButton = selectedMethod === "bank" ? !!formState.bankAccountNumber : !!formState.phoneNumber;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Configuration des reversements</CardTitle>
            <CardDescription>
              Configurez la méthode de paiement utilisée pour recevoir vos reversements.
            </CardDescription>
          </div>
          <Badge variant={isVerified ? "default" : "secondary"} className={isVerified ? "bg-emerald-500 hover:bg-emerald-500" : undefined}>
            {isVerified ? (
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Vérifié
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Non vérifié
              </span>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Méthode de reversement</Label>
            <Select value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une méthode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                <SelectItem value="orange">Orange Money</SelectItem>
                <SelectItem value="moov">Moov Money</SelectItem>
                <SelectItem value="bank">Compte bancaire</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {methodDescriptions[selectedMethod]}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              {selectedMethod === "bank" ? (
                <Building className="h-4 w-4" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              {methodLabels[selectedMethod]}
            </div>
            <p>
              Assurez-vous que les informations saisies correspondent exactement à celles détenues par votre opérateur ou votre banque.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="accountHolder">Nom du titulaire</Label>
            <Input
              id="accountHolder"
              value={formState.accountHolderName}
              onChange={(event) => handleFieldChange("accountHolderName", event.target.value)}
              placeholder="Nom complet du titulaire"
            />
            {formErrors.accountHolderName && (
              <p className="text-sm text-destructive">{formErrors.accountHolderName}</p>
            )}
          </div>

          {selectedMethod === "bank" ? (
            <div className="space-y-2">
              <Label htmlFor="bankName">Banque</Label>
              <Input
                id="bankName"
                value={formState.bankName}
                onChange={(event) => handleFieldChange("bankName", event.target.value)}
                placeholder="Nom de la banque"
              />
              {formErrors.bankName && (
                <p className="text-sm text-destructive">{formErrors.bankName}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Numéro Mobile Money</Label>
              <Input
                id="phoneNumber"
                value={formState.phoneNumber}
                onChange={(event) => handleFieldChange("phoneNumber", event.target.value)}
                placeholder="Ex: +22960000000"
                inputMode="tel"
              />
              {formErrors.phoneNumber && (
                <p className="text-sm text-destructive">{formErrors.phoneNumber}</p>
              )}
            </div>
          )}
        </div>

        {selectedMethod === "bank" && (
          <div className="space-y-2">
            <Label htmlFor="bankAccount">Numéro de compte / IBAN</Label>
            <Input
              id="bankAccount"
              value={formState.bankAccountNumber}
              onChange={(event) => handleFieldChange("bankAccountNumber", event.target.value)}
              placeholder="Numéro de compte bancaire"
            />
            {formErrors.bankAccountNumber && (
              <p className="text-sm text-destructive">{formErrors.bankAccountNumber}</p>
            )}
          </div>
        )}

        {selectedMethod !== "bank" && (
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              Utilisez un numéro actif au format international (+229, +225, ...). Les espaces ne sont pas nécessaires.
            </div>
          </div>
        )}

        <Alert variant={isVerified ? "default" : "destructive"}>
          {isVerified ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Informations vérifiées</AlertTitle>
              <AlertDescription>
                Vos informations sont prêtes pour les prochains reversements. Modifiez-les uniquement en cas de changement.
              </AlertDescription>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vérification requise</AlertTitle>
              <AlertDescription>
                Enregistrez vos informations puis demandez leur vérification pour permettre le déclenchement des reversements.
              </AlertDescription>
            </>
          )}
        </Alert>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={mutation.isPending || !hasChanges}
          >
            {mutation.isPending && pendingAction === "save" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Enregistrer
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={mutation.isPending || !showVerifyButton}
          >
            {mutation.isPending && pendingAction === "verify" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Vérifier les informations
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PaymentInfoSection;
