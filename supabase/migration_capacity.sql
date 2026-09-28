-- TriRide: Driver Capacity Rule Migration
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- This adds a function to count a driver's current active passengers.

-- Helper function: count total passengers across a driver's active trips
CREATE OR REPLACE FUNCTION get_driver_active_passenger_count(driver_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(
    SUM(passengers),
    0
  )::INTEGER
  FROM trips
  WHERE driver_id = driver_uuid
    AND status IN ('accepted', 'in_progress');
$$ LANGUAGE sql STABLE SECURITY DEFINER;
