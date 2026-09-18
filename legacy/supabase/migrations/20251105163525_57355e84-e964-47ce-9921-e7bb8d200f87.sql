-- Enable realtime for notifications table
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Add the notifications table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;