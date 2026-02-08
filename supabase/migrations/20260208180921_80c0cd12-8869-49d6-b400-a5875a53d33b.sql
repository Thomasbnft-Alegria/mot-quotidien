-- Add preferred_time column to push_subscriptions table
ALTER TABLE public.push_subscriptions 
ADD COLUMN preferred_time TIME NOT NULL DEFAULT '12:30:00';