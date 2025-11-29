import AvailabilitySection from "@/components/dashboard/practitioner/AvailabilitySection";
import { PaymentInfoSection } from "@/components/dashboard/practitioner/PaymentInfoSection";
import { PractitionerRatesSection } from "@/components/dashboard/practitioner/PractitionerRatesSection";
import { DocumentsSection } from "@/components/dashboard/practitioner/DocumentsSection";

interface AvailabilityTabProps {
  practitionerId: string;
  practitionerData: any;
}

export default function AvailabilityTab({ practitionerId, practitionerData }: AvailabilityTabProps) {
  return (
    <div className="space-y-6">
      <AvailabilitySection practitionerId={practitionerId} practitionerData={practitionerData} />
      <PractitionerRatesSection practitionerId={practitionerId} />
      <PaymentInfoSection practitionerId={practitionerId} />
      <DocumentsSection practitionerData={practitionerData} />
    </div>
  );
}
