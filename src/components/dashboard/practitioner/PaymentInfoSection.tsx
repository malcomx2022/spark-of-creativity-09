import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Clock, Smartphone, Building } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

const MOBILE_PROVIDERS = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "orange", label: "Orange Money" },
  { value: "moov", label: "Moov Money" },
] as const;

type MobileProvider = (typeof MOBILE_PROVIDERS)[number]["value"];

type PractitionerPaymentInfo = Database["public"]["Tables"]["practitioner_payment_info"]["Row"];

type PaymentInfoSectionProps = {
  practitionerId: string;
};

export function PaymentInfoSection({ practitionerId }: PaymentInfoSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedMobileProvider, setSelectedMobileProvider] = useState<MobileProvider>("mtn");
  const [mobileForm, setMobileForm] = useState({
    accountHolderName: "",
    phoneNumber: "",
  });
  const [bankForm, setBankForm] = useState({
    accountHolderName: "",
    bankName: "",
    bankAccountNumber: "",
  });

  const {
    data: paymentInfos = [],
    isLoading,
    error,
    isFetching,
  } = useQuery<PractitionerPaymentInfo[]>({
    queryKey: ["practitioner-payment-info", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_payment_info")
        .select("*")
        .eq("practitioner_id", practitionerId);

      if (error) throw error;
      return data;
    },
    enabled: !!practitionerId,
  });

  const firstConfiguredProvider = useMemo(() => {
    return paymentInfos.find((info) =>
      MOBILE_PROVIDERS.some((provider) => provider.value === info.payment_method)
    );
  }, [paymentInfos]);

  useEffect(() => {
    if (firstConfiguredProvider) {
      setSelectedMobileProvider(firstConfiguredProvider.payment_method as MobileProvider);
    }
  }, [firstConfiguredProvider]);

  useEffect(() => {
    const infoForProvider = paymentInfos.find((info) => info.payment_method === selectedMobileProvider);

    setMobileForm({
      accountHolderName: infoForProvider?.account_holder_name ?? "",
      phoneNumber: infoForProvider?.phone_number ?? "",
    });
  }, [paymentInfos, selectedMobileProvider]);

  useEffect(() => {
    const bankInfo = paymentInfos.find((info) => info.payment_method === "bank");

    setBankForm({
      accountHolderName: bankInfo?.account_holder_name ?? "",
      bankName: bankInfo?.bank_name ?? "",
      bankAccountNumber: bankInfo?.bank_account_number ?? "",
    });
  }, [paymentInfos]);

  const mobileMutation = useMutation({
    mutationFn: async () => {
      if (!practitionerId) {
        throw new Error("Identifiant praticien manquant");
      }

      if (!mobileForm.accountHolderName.trim() || !mobileForm.phoneNumber.trim()) {
        throw new Error("Veuillez renseigner le titulaire et le numéro de téléphone");
      }

      const { error } = await supabase
        .from("practitioner_payment_info")
        .upsert(
          {
            practitioner_id: practitionerId,
            payment_method: selectedMobileProvider,
            account_holder_name: mobileForm.accountHolderName.trim(),
            phone_number: mobileForm.phoneNumber.trim(),
            bank_name: null,
            bank_account_number: null,
          },
          { onConflict: "practitioner_id,payment_method" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-payment-info", practitionerId] });
      toast({
        title: "Coordonnées Mobile Money sauvegardées",
        description: "Vos informations de paiement ont été mises à jour.",
      });
    },
    onError: (error: any) => {
      console.error("Failed to update mobile payment info", error);
      toast({
        title: "Erreur lors de l'enregistrement",
        description: error?.message || "Impossible de sauvegarder les informations Mobile Money.",
        variant: "destructive",
      });
    },
  });

  const bankMutation = useMutation({
    mutationFn: async () => {
      if (!practitionerId) {
        throw new Error("Identifiant praticien manquant");
      }

      if (!bankForm.accountHolderName.trim() || !bankForm.bankName.trim() || !bankForm.bankAccountNumber.trim()) {
        throw new Error("Veuillez renseigner le titulaire, la banque et le numéro de compte");
      }

      const { error } = await supabase
        .from("practitioner_payment_info")
        .upsert(
          {
            practitioner_id: practitionerId,
            payment_method: "bank",
            account_holder_name: bankForm.accountHolderName.trim(),
            bank_name: bankForm.bankName.trim(),
            bank_account_number: bankForm.bankAccountNumber.trim(),
            phone_number: null,
          },
          { onConflict: "practitioner_id,payment_method" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-payment-info", practitionerId] });
      toast({
        title: "Coordonnées bancaires sauvegardées",
        description: "Vos informations bancaires ont été mises à jour.",
      });
    },
    onError: (error: any) => {
      console.error("Failed to update bank payment info", error);
      toast({
        title: "Erreur lors de l'enregistrement",
        description: error?.message || "Impossible de sauvegarder les informations bancaires.",
        variant: "destructive",
      });
    },
  });

  const currentMobileInfo = paymentInfos.find((info) => info.payment_method === selectedMobileProvider);
  const bankInfo = paymentInfos.find((info) => info.payment_method === "bank");

  const renderStatusBadge = (info?: PractitionerPaymentInfo) => {
    if (info?.is_verified) {
      return (
        <Badge className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Vérifié
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> En attente de validation
      </Badge>
    );
  };

  const isSaving = mobileMutation.isPending || bankMutation.isPending;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les informations de paiement</AlertTitle>
          <AlertDescription>
            Veuillez réessayer plus tard ou contacter le support si le problème persiste.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Smartphone className="h-5 w-5 text-primary" /> Mobile Money
                </CardTitle>
                <CardDescription>
                  Configurez le compte Mobile Money sur lequel vous souhaitez recevoir vos versements.
                </CardDescription>
              </div>
              {renderStatusBadge(currentMobileInfo)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des informations…
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="mobile-account-holder">Titulaire du compte</Label>
              <Input
                id="mobile-account-holder"
                placeholder="Nom complet"
                value={mobileForm.accountHolderName}
                onChange={(event) =>
                  setMobileForm((previous) => ({ ...previous, accountHolderName: event.target.value }))
                }
                disabled={mobileMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Opérateur Mobile Money</Label>
              <Select
                value={selectedMobileProvider}
                onValueChange={(value) => setSelectedMobileProvider(value as MobileProvider)}
                disabled={mobileMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un opérateur" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {MOBILE_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value} className="capitalize">
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile-phone">Numéro Mobile Money</Label>
              <Input
                id="mobile-phone"
                placeholder="Ex: 0700000000"
                value={mobileForm.phoneNumber}
                onChange={(event) =>
                  setMobileForm((previous) => ({ ...previous, phoneNumber: event.target.value }))
                }
                disabled={mobileMutation.isPending}
              />
            </div>

            <Button
              className="w-full md:w-auto"
              onClick={() => mobileMutation.mutate()}
              disabled={mobileMutation.isPending || isSaving}
            >
              {mobileMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sauvegarde…
                </>
              ) : (
                "Sauvegarder"
              )}
            </Button>

            {currentMobileInfo?.updated_at && (
              <p className="text-xs text-muted-foreground">
                Dernière mise à jour : {new Date(currentMobileInfo.updated_at).toLocaleString("fr-FR")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building className="h-5 w-5 text-primary" /> Compte bancaire
                </CardTitle>
                <CardDescription>
                  Configurez vos informations bancaires si vous préférez recevoir des virements.
                </CardDescription>
              </div>
              {renderStatusBadge(bankInfo)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des informations…
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="bank-account-holder">Titulaire du compte</Label>
              <Input
                id="bank-account-holder"
                placeholder="Nom complet"
                value={bankForm.accountHolderName}
                onChange={(event) =>
                  setBankForm((previous) => ({ ...previous, accountHolderName: event.target.value }))
                }
                disabled={bankMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-name">Banque</Label>
              <Input
                id="bank-name"
                placeholder="Ex: Banque Atlantique"
                value={bankForm.bankName}
                onChange={(event) =>
                  setBankForm((previous) => ({ ...previous, bankName: event.target.value }))
                }
                disabled={bankMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-account-number">Numéro de compte</Label>
              <Input
                id="bank-account-number"
                placeholder="Ex: CI1234567890"
                value={bankForm.bankAccountNumber}
                onChange={(event) =>
                  setBankForm((previous) => ({ ...previous, bankAccountNumber: event.target.value }))
                }
                disabled={bankMutation.isPending}
              />
            </div>

            <Button
              className="w-full md:w-auto"
              onClick={() => bankMutation.mutate()}
              disabled={bankMutation.isPending || isSaving}
            >
              {bankMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sauvegarde…
                </>
              ) : (
                "Sauvegarder"
              )}
            </Button>

            {bankInfo?.updated_at && (
              <p className="text-xs text-muted-foreground">
                Dernière mise à jour : {new Date(bankInfo.updated_at).toLocaleString("fr-FR")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
