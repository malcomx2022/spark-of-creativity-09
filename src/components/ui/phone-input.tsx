import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/phone-utils";

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
  localNumberLength?: number;
  /** Longueurs locales acceptées (ex. [8, 10]) ; remplace `localNumberLength` quand elle est fournie. */
  localNumberLengths?: number[];
  /** Motif du numéro complet (avec +) pour l'indicateur de validité. */
  validationPattern?: RegExp;
  error?: string;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ 
    className, 
    value, 
    onChange, 
    countryCode = "+229",
    localNumberLength = 8,
    localNumberLengths,
    validationPattern,
    error,
    ...props 
  }, ref) => {
    const lengths = localNumberLengths?.length ? [...localNumberLengths].sort((a, b) => a - b) : [localNumberLength];
    const maxLength = lengths[lengths.length - 1];

    // Extract local number from full value
    const localNumber = value.startsWith(countryCode) 
      ? value.slice(countryCode.length) 
      : value.replace(/^\+?/, '');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Remove all non-digit characters and spaces
      let inputValue = e.target.value.replace(/[^\d]/g, '');
      
      // Limit to local number length
      if (inputValue.length > maxLength) {
        inputValue = inputValue.slice(0, maxLength);
      }

      // Always return the full number with country code
      const fullNumber = inputValue ? `${countryCode}${inputValue}` : '';
      onChange(fullNumber);
    };

    const isComplete = lengths.includes(localNumber.length);
    // Longueur attendue pour le compteur : la plus petite longueur encore atteignable.
    const expectedLength = lengths.find((length) => length >= localNumber.length) ?? maxLength;
    const isValid = isComplete && isValidPhoneNumber(value, {
      defaultCountryCode: countryCode,
      localNumberLengths: lengths,
      pattern: validationPattern,
    });

    return (
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
            {countryCode}
          </div>
          <Input
            ref={ref}
            type="tel"
            inputMode="numeric"
            value={localNumber}
            onChange={handleChange}
            className={cn(
              "pl-16",
              error && "border-destructive focus-visible:ring-destructive",
              isComplete && isValid && "border-green-500 focus-visible:ring-green-500",
              className
            )}
            placeholder={`${"0".repeat(lengths[0])}`}
            {...props}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={cn(
            "text-muted-foreground",
            error && "text-destructive"
          )}>
            {error || `Saisissez ${lengths.join(' ou ')} chiffres sans espaces`}
          </span>
          <span className={cn(
            "font-medium",
            localNumber.length === 0 && "text-muted-foreground",
            localNumber.length > 0 && !isComplete && "text-orange-500",
            isComplete && isValid && "text-green-500",
            isComplete && !isValid && "text-destructive"
          )}>
            {localNumber.length}/{expectedLength}
          </span>
        </div>
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
