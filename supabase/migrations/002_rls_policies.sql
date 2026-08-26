-- SQL Migration: 002_rls_policies.sql
-- Enable Row Level Security on all tables
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_submissions ENABLE ROW LEVEL SECURITY;

-- Helper functions for getting current user context
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_region(user_id UUID)
RETURNS UUID AS $$
    SELECT region_id FROM profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_campus(user_id UUID)
RETURNS UUID AS $$
    SELECT campus_id FROM profiles WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Security Policies
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id OR get_user_role(auth.uid()) = 'regional_director');

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Regions Security Policies
CREATE POLICY "Anyone authenticated can view regions"
    ON regions FOR SELECT
    USING (auth.role() = 'authenticated');

-- Campuses Security Policies
CREATE POLICY "Anyone authenticated can view campuses"
    ON campuses FOR SELECT
    USING (auth.role() = 'authenticated');

-- Assembly Submissions Policies

-- 1. Principals can view and insert submissions for their assigned campus
CREATE POLICY "Principals can view campus submissions"
    ON assembly_submissions FOR SELECT
    USING (
        get_user_role(auth.uid()) = 'principal' AND campus_id = get_user_campus(auth.uid())
    );

CREATE POLICY "Principals can insert campus submissions"
    ON assembly_submissions FOR INSERT
    WITH CHECK (
        get_user_role(auth.uid()) = 'principal' 
        AND campus_id = get_user_campus(auth.uid())
        AND principal_id = auth.uid()
    );

-- 2. Finance Officers can view and update submissions in their region
CREATE POLICY "Finance officers can view region submissions"
    ON assembly_submissions FOR SELECT
    USING (
        get_user_role(auth.uid()) = 'finance_officer'
        AND campus_id IN (SELECT id FROM campuses WHERE region_id = get_user_region(auth.uid()))
    );

CREATE POLICY "Finance officers can update verification status"
    ON assembly_submissions FOR UPDATE
    USING (
        get_user_role(auth.uid()) = 'finance_officer'
        AND campus_id IN (SELECT id FROM campuses WHERE region_id = get_user_region(auth.uid()))
    );

-- 3. Regional Directors have full view across all submissions
CREATE POLICY "Regional directors can view all submissions"
    ON assembly_submissions FOR SELECT
    USING (
        get_user_role(auth.uid()) = 'regional_director'
    );

-- Storage Bucket configuration and policies
INSERT INTO storage.buckets (id, name, public) 
VALUES ('assembly-photos', 'assembly-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read assembly photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'assembly-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Principals can upload assembly photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'assembly-photos' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
