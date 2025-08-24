BEGIN;

-- Create expiring_items_queue table for staging items that need notifications
CREATE TABLE IF NOT EXISTS public.expiring_items_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    food_item_id UUID NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    chat_id BIGINT NOT NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    expiration_date DATE NOT NULL,
    category TEXT NOT NULL,
    days_until_expiry INTEGER NOT NULL,
    notification_priority TEXT CHECK (notification_priority IN ('low', 'medium', 'high', 'urgent')),
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_expiring_queue_status ON public.expiring_items_queue(status);
CREATE INDEX idx_expiring_queue_scheduled_at ON public.expiring_items_queue(scheduled_at);
CREATE INDEX idx_expiring_queue_user_id ON public.expiring_items_queue(user_id);
CREATE INDEX idx_expiring_queue_expiration_date ON public.expiring_items_queue(expiration_date);
CREATE INDEX idx_expiring_queue_food_item_id ON public.expiring_items_queue(food_item_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_expiring_items_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_expiring_items_queue_updated_at
    BEFORE UPDATE ON public.expiring_items_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_expiring_items_queue_updated_at();

-- Enable RLS
ALTER TABLE public.expiring_items_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own queue items" ON public.expiring_items_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all queue items" ON public.expiring_items_queue
    FOR ALL USING (auth.role() = 'service_role');

-- Create RPC function for getting queue statistics
CREATE OR REPLACE FUNCTION public.get_queue_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        eiq.status,
        COUNT(*)::bigint
    FROM public.expiring_items_queue eiq
    GROUP BY eiq.status
    ORDER BY eiq.status;
END;
$$;

-- Grant permissions
GRANT ALL ON TABLE public.expiring_items_queue TO anon;
GRANT ALL ON TABLE public.expiring_items_queue TO authenticated;
GRANT ALL ON TABLE public.expiring_items_queue TO service_role;
GRANT EXECUTE ON FUNCTION public.get_queue_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_stats() TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.expiring_items_queue IS 'Queue for staging expiring food items that need notifications';
COMMENT ON COLUMN public.expiring_items_queue.notification_priority IS 'Priority level: low (7+ days), medium (3-6 days), high (1-2 days), urgent (today)';
COMMENT ON COLUMN public.expiring_items_queue.status IS 'Processing status: pending, processing, sent, failed';

COMMIT;