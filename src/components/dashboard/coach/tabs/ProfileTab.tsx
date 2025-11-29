import { ProfessionalProfileSection } from "@/components/dashboard/practitioner/ProfessionalProfileSection";
import { ProfileSection } from "@/components/dashboard/ProfileSection";

interface ProfileTabProps {
  practitionerId: string;
  practitionerData: any;
}

export default function ProfileTab({ practitionerId, practitionerData }: ProfileTabProps) {
  return (
    <div className="space-y-6">
      <ProfessionalProfileSection practitionerId={practitionerId} practitionerData={practitionerData} isCoach />
      <ProfileSection />
    </div>
  );
}
