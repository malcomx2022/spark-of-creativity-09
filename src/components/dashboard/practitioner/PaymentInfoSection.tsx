import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone-utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Radio,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

interface PaymentInfoSectionProps {
  practitionerId: string;
  practitionerName?: string | null;
}

type PaymentMethod = "mtn" | "moov" | "bank";

interface PractitionerPaymentInfo {
  id: string;
  practitioner_id: string;
  payment_method: PaymentMethod | string;
  phone_number: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  account_holder_name: string;
  is_verified: boolean | null;
  created_at: string;
  updated_at: string;
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

interface PaymentMethodMetadata {
  label: string;
  description: string;
  icon: LucideIcon;
  helper?: string;
  phoneExample?: string;
  phoneRegex?: RegExp;
}

const paymentMethodMetadata: Record<PaymentMethod, PaymentMethodMetadata> = {
  mtn: {
    label: "MTN Mobile Money",
    description: "Recevez vos reversements sur votre numéro MTN Mobile Money.",
    icon: Smartphone,
    helper: "Utilisez votre numéro Mobile Money actif au format international.",
    phoneExample: "+22960000000",
    phoneRegex: /^\+[1-9][0-9]{7,14}$/,
  },
  moov: {
    label: "Moov Money",
    description: "Recevez vos reversements sur votre numéro Moov Money.",
    icon: Smartphone,
    helper: "Saisissez un numéro Moov Money valide sans espaces.",
    phoneExample: "+22995000000",
    phoneRegex: /^\+[1-9][0-9]{7,14}$/,
  },
  bank: {
    label: "Compte bancaire",
    description: "Recevez vos reversements directement sur votre compte bancaire.",
    icon: Building,
    helper: "Le nom du titulaire doit correspondre à celui enregistré par votre banque.",
  },
};

const methodIcons: Record<PaymentMethod, ReactNode> = {
  mtn: <Smartphone className="h-4 w-4" />,
  moov: <Smartphone className="h-4 w-4" />,
  bank: <Building className="h-4 w-4" />,
};

const sanitizeAccountNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const PHONE_NORMALIZATION_OPTIONS = { defaultCountryCode: "+229", localNumberLengths: [8] };

const isMethodPhoneValid = (value: string, method: PaymentMethod) => {
  const { phoneRegex } = paymentMethodMetadata[method];
  return isValidPhoneNumber(value, {
    ...PHONE_NORMALIZATION_OPTIONS,
    pattern: phoneRegex,
  });
};

const isValidBankAccountNumber = (value: string) => {
  const normalized = sanitizeAccountNumber(value);
  return /^[0-9A-Za-z]{8,34}$/.test(normalized);
};

const isPaymentMethod = (method: string): method is PaymentMethod =>
  method === "mtn" || method === "moov" || method === "bank";

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
      if (preferred && isPaymentMethod(preferred.payment_method)) {
        setSelectedMethod(preferred.payment_method);
      }
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
      const sanitizedPhone =
        selectedMethod === "bank"
          ? null
          : normalizePhoneNumber(formState.phoneNumber, PHONE_NORMALIZATION_OPTIONS);
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
      } else if (!isMethodPhoneValid(formState.phoneNumber, selectedMethod)) {
        const metadata = paymentMethodMetadata[selectedMethod];
        errors.phoneNumber = metadata.phoneExample
          ? `Format invalide. Exemple attendu : ${metadata.phoneExample}`
          : "Numéro de téléphone invalide.";
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

  // All hooks must be called before any early returns
  const showVerifyButton = useMemo(() => {
    if (selectedMethod === "bank") {
      return Boolean(formState.bankAccountNumber && isValidBankAccountNumber(formState.bankAccountNumber));
    }

    return Boolean(formState.phoneNumber && isMethodPhoneValid(formState.phoneNumber, selectedMethod));
  }, [formState.bankAccountNumber, formState.phoneNumber, selectedMethod]);

  const methodMetadata = paymentMethodMetadata[selectedMethod];

  const existingMethods = useMemo(() => {
    if (!paymentInfos?.length) return [];

    return paymentInfos
      .filter((info) => isPaymentMethod(info.payment_method))
      .map((info) => ({
        method: info.payment_method as PaymentMethod,
        metadata: paymentMethodMetadata[info.payment_method as PaymentMethod],
        info,
      }));
  }, [paymentInfos]);

  // Conditional returns after all hooks
  if (!practitionerId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration des reversements</CardTitle>
          <CardDescription>Informations de paiement non disponibles</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Profil incomplet</AlertTitle>
            <AlertDescription>
              Votre profil praticien doit être complété avant de configurer vos coordonnées de reversement.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
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
          <Badge
            variant={isVerified ? "default" : "secondary"}
            className={isVerified ? "bg-emerald-500 hover:bg-emerald-500" : undefined}
          >
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
        {existingMethods.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {existingMethods.map(({ method, metadata, info }) => {
              const Icon = metadata.icon;
              return (
                <div key={method} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4" />
                      {metadata.label}
                    </span>
                    <Badge variant={info.is_verified ? "default" : "secondary"}>
                      {info.is_verified ? "Vérifié" : "Non vérifié"}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {info.phone_number && <p>Téléphone : {info.phone_number}</p>}
                    {info.bank_name && <p>Banque : {info.bank_name}</p>}
                    {info.bank_account_number && <p>Compte : {info.bank_account_number}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Wallet className="h-5 w-5" />
            <span>Aucune coordonnée de reversement enregistrée pour le moment.</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Méthode de reversement</Label>
            <Select value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une méthode" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(paymentMethodMetadata) as [PaymentMethod, PaymentMethodMetadata][]).map(
                  ([key, metadata]) => {
                    const Icon = metadata.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {metadata.label}
                        </span>
                      </SelectItem>
                    );
                  }
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{methodMetadata.description}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              {selectedMethod === "bank" ? <Building className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              {methodMetadata.label}
            </div>
            <p>
              Assurez-vous que les informations saisies correspondent exactement à celles détenues par votre opérateur ou votre
              banque.
            </p>
            {methodMetadata.helper && <p>{methodMetadata.helper}</p>}
            {methodMetadata.phoneExample && selectedMethod !== "bank" && (
              <p className="text-xs">Exemple : {methodMetadata.phoneExample}</p>
            )}
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
              {formErrors.bankName && <p className="text-sm text-destructive">{formErrors.bankName}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Numéro Mobile Money</Label>
              <PhoneInput
                id="phoneNumber"
                value={formState.phoneNumber}
                onChange={(value) => handleFieldChange("phoneNumber", value)}
                countryCode="+229"
                localNumberLength={8}
                error={formErrors.phoneNumber}
              />
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
              <span>
                Utilisez un numéro actif au format international. Les espaces et préfixes "00" seront automatiquement adaptés au
                format +. Exemple : {methodMetadata.phoneExample || "+22960000000"}
              </span>
            </div>
          </div>
        )}

        {paymentInfos && paymentInfos.length === 0 && (
          <Alert className="border-dashed">
            <Clock className="h-4 w-4" />
            <AlertTitle>Aucune méthode enregistrée</AlertTitle>
            <AlertDescription>
              Renseignez vos informations Mobile Money ou bancaires puis enregistrez-les pour activer vos reversements.
            </AlertDescription>
          </Alert>
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
