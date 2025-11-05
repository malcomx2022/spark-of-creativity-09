-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
);

-- Add attachment columns to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_type TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT,
ADD COLUMN IF NOT EXISTS attachment_size INTEGER;

-- RLS policies for message attachments bucket
CREATE POLICY "Users can upload attachments for their conversations"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT a.id
    FROM appointments a
    WHERE a.patient_id = (auth.uid())::text OR a.practitioner_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can view attachments from their conversations"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT a.id
    FROM appointments a
    WHERE a.patient_id = (auth.uid())::text OR a.practitioner_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT a.id
    FROM appointments a
    WHERE a.patient_id = (auth.uid())::text OR a.practitioner_id = (auth.uid())::text
  )
);