-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 004: AUTH HOOKS, AUTOMATIC PROFILE CREATION & PRIVILEGE ESCALATION GUARDS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AUTOMATIC PROFILE CREATION ON AUTH.USERS INSERTION
-- SECURITY ENFORCEMENT: Client-controlled metadata (raw_user_meta_data) can NEVER
-- assign an elevated role. Privileged roles (super_admin, college_admin, faculty)
-- must be explicitly set via server-controlled raw_app_meta_data.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role public.user_role;
    trusted_role TEXT;
BEGIN
    -- Only read role from raw_app_meta_data (strictly server/admin controlled)
    -- Client-supplied raw_user_meta_data is ignored for role assignment
    trusted_role := NEW.raw_app_meta_data->>'role';

    IF trusted_role = 'super_admin' THEN
        assigned_role := 'super_admin'::public.user_role;
    ELSIF trusted_role = 'college_admin' THEN
        assigned_role := 'college_admin'::public.user_role;
    ELSIF trusted_role = 'faculty' THEN
        assigned_role := 'faculty'::public.user_role;
    ELSE
        -- Safe default role for all self-registered or standard accounts: student
        assigned_role := 'student'::public.user_role;
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        role,
        first_name,
        last_name,
        phone,
        avatar_url,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        assigned_role,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'User'),
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url',
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing on every new user in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS FOR ROLE AUTHORIZATION CHECKS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(check_role public.user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = check_role
    AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_any_role(VARIADIC check_roles public.user_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = ANY(check_roles)
    AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. PREVENT PRIVILEGE ESCALATION ON PROFILES
-- Ensure standard authenticated users cannot modify their own role or active status!
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile details" ON public.profiles;

CREATE POLICY "Users can update their own profile details"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    -- Prohibit non-admins from changing their role or active status
    AND (
        (role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
        OR public.is_admin()
    )
    AND (
        (is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid()))
        OR public.is_admin()
    )
);
