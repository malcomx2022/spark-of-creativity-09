-- Create files table for Wasabi uploads tracking
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL UNIQUE,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100),
  storage_provider VARCHAR(20) DEFAULT 'wasabi',
  folder VARCHAR(100),
  metadata JSONB,
  shared_with UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder ON public.files(folder);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at);
CREATE INDEX IF NOT EXISTS idx_files_storage_provider ON public.files(storage_provider);

-- Enable RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for files
CREATE POLICY "Users can view their own files"
  ON public.files FOR SELECT
  USING (
    auth.uid() = user_id 
    OR auth.uid() = ANY(shared_with)
    OR is_admin(auth.uid())
  );

CREATE POLICY "Users can insert their own files"
  ON public.files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files"
  ON public.files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files"
  ON public.files FOR DELETE
  USING (auth.uid() = user_id);

-- Create file_access_logs table
CREATE TABLE IF NOT EXISTS public.file_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('view', 'download', 'share')),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for file_access_logs
CREATE INDEX IF NOT EXISTS idx_file_access_logs_file_id ON public.file_access_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_user_id ON public.file_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_created_at ON public.file_access_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_access_type ON public.file_access_logs(access_type);

-- Enable RLS on file_access_logs
ALTER TABLE public.file_access_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for file_access_logs
CREATE POLICY "Users can view their own access logs"
  ON public.file_access_logs FOR SELECT
  USING (
    auth.uid() = user_id 
    OR is_admin(auth.uid())
  );

CREATE POLICY "Service role can insert access logs"
  ON public.file_access_logs FOR INSERT
  WITH CHECK (true);

-- Function to cleanup old access logs (90 days retention)
CREATE OR REPLACE FUNCTION public.cleanup_old_file_access_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.file_access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Create trigger for updated_at on files
CREATE OR REPLACE FUNCTION public.update_files_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_files_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.files IS 'Tracks files uploaded to external storage (Wasabi S3)';
COMMENT ON TABLE public.file_access_logs IS 'Logs all file access for audit and analytics';
COMMENT ON COLUMN public.files.shared_with IS 'Array of user IDs who have access to this file';
COMMENT ON COLUMN public.files.metadata IS 'Additional file metadata (dimensions, duration, etc.)';
COMMENT ON FUNCTION public.cleanup_old_file_access_logs() IS 'Removes access logs older than 90 days';