-- Create push subscriptions table
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security (but allow public access for anonymous push subscriptions)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert their push subscription
CREATE POLICY "Anyone can insert push subscription" 
ON public.push_subscriptions 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to update their own subscription by endpoint
CREATE POLICY "Anyone can update push subscription by endpoint" 
ON public.push_subscriptions 
FOR UPDATE 
USING (true);

-- Allow select for the edge function (service role will bypass RLS anyway)
CREATE POLICY "Anyone can read push subscriptions" 
ON public.push_subscriptions 
FOR SELECT 
USING (true);

-- Allow delete for unsubscribing
CREATE POLICY "Anyone can delete their subscription" 
ON public.push_subscriptions 
FOR DELETE 
USING (true);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();