import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface UserTypeCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  buttonText: string;
  variant: "patient" | "practitioner";
  onSelect: () => void;
}

export default function UserTypeCard({
  title,
  description,
  icon: Icon,
  features,
  buttonText,
  variant,
  onSelect,
}: UserTypeCardProps) {
  return (
    <Card className="min-w-0 h-full shadow-medical hover:shadow-glow transition-all duration-300 transform hover:scale-[1.02] border-border/50">
      <CardHeader className="text-center pb-4">
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
          variant === "patient" ? "gradient-primary" : "bg-secondary"
        }`}>
          <Icon className="h-8 w-8 text-white" />
        </div>
        <CardTitle className="text-xl font-bold text-foreground">{title}</CardTitle>
        <CardDescription className="text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ul className="space-y-3 mb-6">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start space-x-2">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span className="text-sm text-foreground">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          variant={variant} 
          size="xl" 
          className="w-full"
          onClick={onSelect}
        >
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
}
