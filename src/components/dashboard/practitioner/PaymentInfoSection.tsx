import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone-utils";
import { mtnSchema, moovSchema, bankSchema } from "@/schemas/paymentInfoSchema";
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
  RefreshCw,
  Copy,
  Check,
  CreditCard,
  HelpCircle,
  TrendingUp,
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

interface FormContext {
  data: {
    accountHolderName: string;
    phoneNumber: string;
    bankName: string;
    bankAccountNumber: string;
  };
  errors: {
    accountHolderName?: string;
    phoneNumber?: string;
    bankName?: string;
    bankAccountNumber?: string;
  };
  isVerified: boolean;
  hasChanges: boolean;
  pendingAction: "verify" | "save" | null;
}

type FormAction =
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "SET_ERRORS"; errors: FormContext["errors"] }
  | { type: "SET_VERIFIED"; isVerified: boolean }
  | { type: "SET_HAS_CHANGES"; hasChanges: boolean }
  | { type: "SET_PENDING_ACTION"; action: "verify" | "save" | null }
  | { type: "RESET_FORM"; data: FormContext["data"]; isVerified: boolean };

const formReducer = (state: FormContext, action: FormAction): FormContext => {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        data: { ...state.data, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
        hasChanges: true,
        isVerified: false,
      };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SET_VERIFIED":
      return { ...state, isVerified: action.isVerified };
    case "SET_HAS_CHANGES":
      return { ...state, hasChanges: action.hasChanges };
    case "SET_PENDING_ACTION":
      return { ...state, pendingAction: action.action };
    case "RESET_FORM":
      return {
        ...state,
        data: action.data,
        isVerified: action.isVerified,
        errors: {},
        hasChanges: false,
      };
    default:
      return state;
  }
};

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [formContext, dispatch] = useReducer(formReducer, {
    data: {
      accountHolderName: practitionerName || "",
      phoneNumber: "",
      bankName: "",
      bankAccountNumber: "",
    },
    errors: {},
    isVerified: false,
    hasChanges: false,
    pendingAction: null,
  });

  const { data: paymentInfos, isLoading, refetch } = useQuery({
    queryKey: ["practitioner-payment-info", practitionerId],
    queryFn: async () => {
      return api.get<PractitionerPaymentInfo[]>('/finance/me/payment-info');
    },
    enabled: !!practitionerId,
  });

  // Statistiques
  const stats = useMemo(() => {
    if (!paymentInfos) return { total: 0, verified: 0, lastUpdate: null };

    const total = paymentInfos.length;
    const verified = paymentInfos.filter(p => p.is_verified).length;
    const lastUpdate = paymentInfos.reduce((latest, p) => {
      const date = new Date(p.updated_at);
      return !latest || date > latest ? date : latest;
    }, null as Date | null);

    return { total, verified, lastUpdate };
  }, [paymentInfos]);

  // Fonction de rafraîchissement
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Actualisé",
        description: "Les informations ont été rafraîchies.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les données.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fonction de copie
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: "Copié",
        description: "Le contenu a été copié dans le presse-papiers.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier le contenu.",
        variant: "destructive",
      });
    }
  };

  // Format date relative
  const formatUpdateDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  };

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

  // ✅ CORRECTION P1-3: Protection contre le race condition au chargement
  // Ne réinitialiser le formulaire que quand les données sont vraiment chargées
  // ET que l'utilisateur n'a pas de modifications en cours
  useEffect(() => {
    // Attendre que le chargement soit terminé et que les données soient disponibles
    if (isLoading || !paymentInfos) return;

    // ✅ AMÉLIORATION P1-3: Ne pas écraser les modifications en cours de l'utilisateur
    // Seulement réinitialiser si pas de changements non sauvegardés
    if (formContext.hasChanges) {
      console.log('Form has unsaved changes, skipping reset');
      return;
    }

    const info = paymentInfos.find((item) => item.payment_method === selectedMethod);

    dispatch({
      type: "RESET_FORM",
      data: {
        accountHolderName: info?.account_holder_name || practitionerName || "",
        phoneNumber: info?.phone_number || "",
        bankName: info?.bank_name || "",
        bankAccountNumber: info?.bank_account_number || "",
      },
      isVerified: !!info?.is_verified,
    });
  }, [paymentInfos, selectedMethod, practitionerName, isLoading, formContext.hasChanges]);

  const mutation = useMutation({
    mutationFn: async (payload: { verify: boolean }) => {
      // Normalisation, validation et upsert (practitioner_id, payment_method) faits par l'API
      const data = await api.put<PractitionerPaymentInfo>('/finance/me/payment-info', {
        paymentMethod: selectedMethod,
        accountHolderName: formContext.data.accountHolderName.trim(),
        phoneNumber: selectedMethod === "bank" ? undefined : formContext.data.phoneNumber,
        bankName: selectedMethod === "bank" ? formContext.data.bankName.trim() || undefined : undefined,
        bankAccountNumber: selectedMethod === "bank" ? formContext.data.bankAccountNumber : undefined,
        verify: payload.verify,
      });

      return data as PractitionerPaymentInfo;
    },
    onSuccess: (data, variables) => {
      dispatch({ type: "SET_VERIFIED", isVerified: !!data.is_verified });
      dispatch({ type: "SET_HAS_CHANGES", hasChanges: false });
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
      dispatch({ type: "SET_PENDING_ACTION", action: null });
    },
  });

  const handleFieldChange = (field: string, value: string) => {
    dispatch({ type: "SET_FIELD", field, value });
  };

  const validateForm = () => {
    try {
      if (selectedMethod === "mtn") {
        mtnSchema.parse({
          accountHolderName: formContext.data.accountHolderName,
          phoneNumber: formContext.data.phoneNumber,
        });
      } else if (selectedMethod === "moov") {
        moovSchema.parse({
          accountHolderName: formContext.data.accountHolderName,
          phoneNumber: formContext.data.phoneNumber,
        });
      } else if (selectedMethod === "bank") {
        bankSchema.parse({
          accountHolderName: formContext.data.accountHolderName,
          bankName: formContext.data.bankName,
          bankAccountNumber: formContext.data.bankAccountNumber,
        });
      }
      
      dispatch({ type: "SET_ERRORS", errors: {} });
      return true;
    } catch (error: any) {
      const fieldErrors: FormContext["errors"] = {};
      
      if (error.errors) {
        error.errors.forEach((err: any) => {
          const field = err.path[0];
          fieldErrors[field as keyof FormContext["errors"]] = err.message;
        });
      }
      
      dispatch({ type: "SET_ERRORS", errors: fieldErrors });
      
      toast({
        title: "Champs invalides",
        description: "Veuillez corriger les erreurs avant de continuer.",
        variant: "destructive",
      });
      
      return false;
    }
  };

  const handleSave = (verify: boolean) => {
    if (!validateForm()) return;

    dispatch({ type: "SET_PENDING_ACTION", action: verify ? "verify" : "save" });
    mutation.mutate({ verify });
  };

  const showVerifyButton = useMemo(() => {
    if (selectedMethod === "bank") {
      return Boolean(formContext.data.bankAccountNumber && isValidBankAccountNumber(formContext.data.bankAccountNumber));
    }

    return Boolean(formContext.data.phoneNumber && isMethodPhoneValid(formContext.data.phoneNumber, selectedMethod));
  }, [formContext.data.bankAccountNumber, formContext.data.phoneNumber, selectedMethod]);

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
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton formulaire */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête global */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Coordonnées bancaires
            {stats.total > 0 && (
              <Badge variant="secondary">{stats.total} méthode{stats.total > 1 ? 's' : ''}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Configurez vos méthodes de reversement
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Méthodes configurées
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShieldCheck className="h-4 w-4" />
              Vérifiées
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.verified}/{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Dernière mise à jour
            </div>
            {stats.lastUpdate ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-lg font-medium cursor-help">
                      {formatUpdateDate(stats.lastUpdate.toISOString())}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formatFullDate(stats.lastUpdate.toISOString())}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <p className="text-lg font-medium text-muted-foreground">-</p>
            )}
          </CardContent>
        </Card>
      </div>

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
              variant={formContext.isVerified ? "default" : "secondary"}
              className={formContext.isVerified ? "bg-emerald-500 hover:bg-emerald-500" : undefined}
            >
              {formContext.isVerified ? (
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
                  <div
                    key={method}
                    className={`rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-muted/30 cursor-pointer ${
                      selectedMethod === method ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedMethod(method)}
                  >
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
                      {info.phone_number && (
                        <div className="flex items-center justify-between">
                          <span>Téléphone : {info.phone_number}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(info.phone_number!, `phone-${method}`);
                            }}
                          >
                            {copiedField === `phone-${method}` ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      )}
                      {info.bank_name && <p>Banque : {info.bank_name}</p>}
                      {info.bank_account_number && (
                        <div className="flex items-center justify-between">
                          <span>Compte : {info.bank_account_number}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(info.bank_account_number!, `account-${method}`);
                            }}
                          >
                            {copiedField === `account-${method}` ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground mt-2 cursor-help">
                            Mis à jour {formatUpdateDate(info.updated_at)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{formatFullDate(info.updated_at)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Aucune coordonnée de reversement enregistrée</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configurez votre première méthode de paiement ci-dessous
              </p>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="accountHolder">Nom du titulaire</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Doit correspondre exactement au nom enregistré</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="accountHolder"
              value={formContext.data.accountHolderName}
              onChange={(event) => handleFieldChange("accountHolderName", event.target.value)}
              placeholder="Nom complet du titulaire"
            />
            {formContext.errors.accountHolderName && (
              <p className="text-sm text-destructive">{formContext.errors.accountHolderName}</p>
            )}
          </div>

          {selectedMethod === "bank" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="bankName">Banque</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Nom officiel de votre établissement bancaire</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="bankName"
                value={formContext.data.bankName}
                onChange={(event) => handleFieldChange("bankName", event.target.value)}
                placeholder="Nom de la banque"
              />
              {formContext.errors.bankName && <p className="text-sm text-destructive">{formContext.errors.bankName}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="phoneNumber">Numéro Mobile Money</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Format international requis (ex: +229...)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <PhoneInput
                id="phoneNumber"
                value={formContext.data.phoneNumber}
                onChange={(value) => handleFieldChange("phoneNumber", value)}
                countryCode="+229"
                localNumberLength={8}
                error={formContext.errors.phoneNumber}
              />
            </div>
          )}
        </div>

        {selectedMethod === "bank" && (
          <div className="space-y-2">
            <Label htmlFor="bankAccount">Numéro de compte / IBAN</Label>
            <Input
              id="bankAccount"
              value={formContext.data.bankAccountNumber}
              onChange={(event) => handleFieldChange("bankAccountNumber", event.target.value)}
              placeholder="Numéro de compte bancaire"
            />
            {formContext.errors.bankAccountNumber && (
              <p className="text-sm text-destructive">{formContext.errors.bankAccountNumber}</p>
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

        <Alert variant={formContext.isVerified ? "default" : "destructive"}>
          {formContext.isVerified ? (
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
            disabled={mutation.isPending || !formContext.hasChanges}
          >
            {mutation.isPending && formContext.pendingAction === "save" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Enregistrer
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={mutation.isPending || !showVerifyButton}
          >
            {mutation.isPending && formContext.pendingAction === "verify" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Vérifier les informations
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

export default PaymentInfoSection;
