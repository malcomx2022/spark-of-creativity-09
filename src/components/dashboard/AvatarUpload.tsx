import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadUserDocument, getSignedFileUrl } from "@/lib/file-upload";
import { useEffect } from "react";

interface AvatarUploadProps {
  currentImageUrl?: string | null;
  onImageUploaded: (path: string) => Promise<void>;
  userId: string;
  userName?: string;
  editable?: boolean;
}

export function AvatarUpload({ 
  currentImageUrl, 
  onImageUploaded, 
  userId, 
  userName,
  editable = true 
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function loadUrl() {
      if (currentImageUrl) {
        try {
          const url = await getSignedFileUrl(currentImageUrl);
          setDisplayUrl(url);
        } catch (error) {
          console.error("Error loading avatar URL:", error);
        }
      } else {
        setDisplayUrl(null);
      }
    }
    loadUrl();
  }, [currentImageUrl]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner une image (PNG, JPG, WebP).",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const result = await uploadUserDocument({
        file,
        folder: "avatars",
        userId,
      });

      await onImageUploaded(result.path);
      
      const newUrl = await getSignedFileUrl(result.path);
      setDisplayUrl(newUrl);

      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été enregistrée.",
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer la photo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative group">
        <Avatar className="h-24 w-24 border-2 border-primary/20">
          <AvatarImage src={displayUrl || ""} alt={userName || "Utilisateur"} />
          <AvatarFallback className="bg-primary/5">
            <User className="h-12 w-12 text-primary/40" />
          </AvatarFallback>
        </Avatar>
        
        {editable && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-0 right-0 rounded-full shadow-md hover:scale-105 transition-transform"
            onClick={triggerFileInput}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />
      
      {userName && (
        <div className="text-center">
          <h3 className="font-semibold text-lg">{userName}</h3>
          <p className="text-sm text-muted-foreground">Photo de profil</p>
        </div>
      )}
    </div>
  );
}
