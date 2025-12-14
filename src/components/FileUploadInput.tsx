import React, { useRef, useState } from "react";
import { Upload, X, FileText, Image, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploadInputProps {
  id: string;
  label: string;
  accept?: string;
  required?: boolean;
  error?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  maxSizeMB?: number;
  helpText?: string;
}

export function FileUploadInput({
  id,
  label,
  accept = "image/*,.pdf",
  required = false,
  error,
  file,
  onChange,
  maxSizeMB = 5,
  helpText,
}: FileUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    if (selectedFile.size > maxSizeBytes) {
      onChange(null);
      return;
    }
    
    onChange(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="h-8 w-8 text-muted-foreground" />;
    
    if (file.type.startsWith("image/")) {
      return <Image className="h-8 w-8 text-primary" />;
    }
    return <FileText className="h-8 w-8 text-primary" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm sm:text-base font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center w-full min-h-[100px] px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : file
            ? "border-primary/50 bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          error && "border-destructive bg-destructive/5"
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="sr-only"
        />
        
        {file ? (
          <div className="flex items-center gap-3 w-full">
            <div className="flex-shrink-0">
              {getFileIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            {getFileIcon()}
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-primary">Cliquez pour choisir</span>{" "}
              ou glissez-déposez
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, JPG, PNG (max. {maxSizeMB}MB)
            </p>
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      
      {helpText && !error && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
