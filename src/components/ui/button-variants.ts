import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-normal text-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // DomiCares custom variants
        medical: "gradient-primary text-white shadow-medical hover:shadow-glow transform hover:scale-105 transition-all duration-300",
        urgent: "bg-urgent text-urgent-foreground hover:bg-urgent/90 shadow-lg",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        patient: "bg-primary text-primary-foreground hover:bg-primary-light shadow-medical",
        practitioner: "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-medical",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-10 rounded-md px-3 py-2",
        lg: "min-h-12 rounded-md px-4 sm:px-8 py-2",
        xl: "min-h-14 rounded-lg px-4 sm:px-10 py-2 text-base sm:text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
