import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { compressImages } from "@/utils/imageCompression";

interface PackagePhotoCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  kind: "pickup" | "delivery";
  title: string;
  description: string;
  onUploaded: (publicUrl: string) => Promise<void> | void;
}

export function PackagePhotoCapture({
  open,
  onOpenChange,
  orderId,
  kind,
  title,
  description,
  onUploaded,
}: PackagePhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!uploading) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const [compressed] = await compressImages([file]);
      const ext = (compressed.name.split(".").pop() || "jpg").toLowerCase();
      const path = `order-proofs/${orderId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      await onUploaded(data.publicUrl);
      toast.success("Photo uploaded");
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to upload photo");
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="Package proof preview"
                className="w-full rounded-lg border object-cover max-h-72"
              />
              {!uploading && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={reset}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/40"
            >
              <Camera className="h-10 w-10" />
              <span className="text-sm">Tap to capture package photo</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload & Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
