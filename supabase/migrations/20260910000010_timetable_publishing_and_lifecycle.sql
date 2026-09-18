-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 010: PHASE 6.5 TIMETABLE PERSISTENCE, PUBLISHING & LIFECYCLE
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD LIFECYCLE COLUMNS (IDEMPOTENT)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.timetable_generations 
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.timetable_configurations
    ADD COLUMN IF NOT EXISTS published_generation_id UUID REFERENCES public.timetable_generations(id) ON DELETE SET NULL;

-- Backfill is_published from metadata for existing records if present
UPDATE public.timetable_generations
SET is_published = COALESCE((metadata->>'is_published')::boolean, false)
WHERE is_published IS FALSE AND metadata ? 'is_published';

-- Performance Index for querying published generation
CREATE INDEX IF NOT EXISTS idx_timetable_generations_published 
ON public.timetable_generations(timetable_configuration_id, is_published);

-- ------------------------------------------------------------------------------
-- 2. ATOMIC RPC FOR PUBLISHING TIMETABLE GENERATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_timetable_generation_atomic(
    p_generation_id UUID,
    p_notify BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
    v_gen RECORD;
    v_config RECORD;
    v_section RECORD;
    v_previous_pub_count INTEGER := 0;
    v_notif_count INTEGER := 0;
    v_student_rec RECORD;
    v_faculty_rec RECORD;
BEGIN
    -- 1. Authorization Guard
    IF NOT (public.is_admin() OR public.is_timetable_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks administrative privileges to publish timetables'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();

    -- Resolve publisher display name
    SELECT COALESCE(TRIM(first_name || ' ' || last_name), email, 'Administrator')
    INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id;

    -- 2. Lock generation row FOR UPDATE
    SELECT * INTO v_gen
    FROM public.timetable_generations
    WHERE id = p_generation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timetable generation not found: %', p_generation_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_gen.status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot publish incomplete or failed timetable generation (status: %)', v_gen.status
            USING ERRCODE = '22000';
    END IF;

    -- 3. Lock configuration row FOR UPDATE
    SELECT * INTO v_config
    FROM public.timetable_configurations
    WHERE id = v_gen.timetable_configuration_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Associated timetable configuration not found: %', v_gen.timetable_configuration_id
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_config.is_active THEN
        RAISE EXCEPTION 'Cannot publish timetable for an inactive configuration'
            USING ERRCODE = '22000';
    END IF;

    -- Resolve section name
    SELECT * INTO v_section
    FROM public.class_sections
    WHERE id = v_config.section_id;

    -- 4. Archive any previously published generation for this configuration
    UPDATE public.timetable_generations
    SET is_published = false,
        archived_at = NOW(),
        metadata = jsonb_set(
            jsonb_set(metadata, '{is_published}', 'false'::jsonb, true),
            '{archived_at}', to_jsonb(NOW()::text), true
        )
    WHERE timetable_configuration_id = v_config.id
      AND id <> p_generation_id
      AND (is_published = true OR (metadata->>'is_published')::boolean = true);

    GET DIAGNOSTICS v_previous_pub_count = ROW_COUNT;

    -- 5. Mark target generation as published
    UPDATE public.timetable_generations
    SET is_published = true,
        published_at = NOW(),
        published_by = v_user_id,
        archived_at = NULL,
        metadata = jsonb_set(
            jsonb_set(
                jsonb_set(metadata, '{is_published}', 'true'::jsonb, true),
                '{published_at}', to_jsonb(NOW()::text), true
            ),
            '{published_by}', to_jsonb(v_user_id::text), true
        )
    WHERE id = p_generation_id;

    -- 6. Update configuration generation_status to PUBLISHED
    UPDATE public.timetable_configurations
    SET generation_status = 'PUBLISHED',
        published_generation_id = p_generation_id,
        updated_at = NOW()
    WHERE id = v_config.id;

    -- 7. Dispatch Notifications if requested
    IF p_notify THEN
        -- Notify enrolled students
        FOR v_student_rec IN 
            SELECT DISTINCT s.id AS student_profile_id
            FROM public.students s
            WHERE s.current_section_id = v_config.section_id AND s.is_active = true
            UNION
            SELECT DISTINCT se.student_id AS student_profile_id
            FROM public.student_enrollments se
            WHERE se.section_id = v_config.section_id AND se.status = 'ENROLLED'
        LOOP
            INSERT INTO public.notifications (
                user_id,
                title,
                message,
                type,
                is_read,
                action_url,
                created_at
            ) VALUES (
                v_student_rec.student_profile_id,
                'Official Timetable Published',
                'The official timetable schedule for section ' || COALESCE(v_section.name, 'your section') || ' has been published.',
                'TIMETABLE_UPDATE'::public.notification_type,
                false,
                '/timetable',
                NOW()
            );
            v_notif_count := v_notif_count + 1;
        END LOOP;

        -- Notify assigned faculty
        FOR v_faculty_rec IN
            SELECT DISTINCT f.id AS faculty_profile_id
            FROM public.faculty f
            JOIN public.faculty_subjects fs ON fs.faculty_id = f.id
            WHERE fs.section_id = v_config.section_id
        LOOP
            INSERT INTO public.notifications (
                user_id,
                title,
                message,
                type,
                is_read,
                action_url,
                created_at
            ) VALUES (
                v_faculty_rec.faculty_profile_id,
                'Class Timetable Published',
                'The official timetable schedule for section ' || COALESCE(v_section.name, 'assigned section') || ' has been published.',
                'TIMETABLE_UPDATE'::public.notification_type,
                false,
                '/timetable',
                NOW()
            );
            v_notif_count := v_notif_count + 1;
        END LOOP;
    END IF;

    -- 8. Return structured outcome
    RETURN jsonb_build_object(
        'generation_id', p_generation_id,
        'configuration_id', v_config.id,
        'section_id', v_config.section_id,
        'section_name', v_section.name,
        'published_at', NOW(),
        'published_by', v_user_id,
        'publisher_name', v_user_name,
        'superseded_previous_count', v_previous_pub_count,
        'notifications_sent', v_notif_count
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.publish_timetable_generation_atomic(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_timetable_generation_atomic(UUID, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC RPC FOR UNPUBLISHING / ARCHIVING TIMETABLE GENERATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_timetable_generation_atomic(
    p_generation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_gen RECORD;
    v_config RECORD;
BEGIN
    -- 1. Authorization Guard
    IF NOT (public.is_admin() OR public.is_timetable_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks administrative privileges to unpublish timetables'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Lock generation row
    SELECT * INTO v_gen
    FROM public.timetable_generations
    WHERE id = p_generation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timetable generation not found: %', p_generation_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock configuration
    SELECT * INTO v_config
    FROM public.timetable_configurations
    WHERE id = v_gen.timetable_configuration_id
    FOR UPDATE;

    -- 4. Mark generation as unpublished / archived
    UPDATE public.timetable_generations
    SET is_published = false,
        archived_at = NOW(),
        metadata = jsonb_set(
            jsonb_set(metadata, '{is_published}', 'false'::jsonb, true),
            '{archived_at}', to_jsonb(NOW()::text), true
        )
    WHERE id = p_generation_id;

    -- 5. Revert configuration status to GENERATED
    UPDATE public.timetable_configurations
    SET generation_status = 'GENERATED',
        published_generation_id = NULL,
        updated_at = NOW()
    WHERE id = v_config.id AND published_generation_id = p_generation_id;

    RETURN jsonb_build_object(
        'generation_id', p_generation_id,
        'configuration_id', v_config.id,
        'is_published', false,
        'archived_at', NOW()
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.unpublish_timetable_generation_atomic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpublish_timetable_generation_atomic(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. ATOMIC RPC FOR DELETING AN UNPUBLISHED DRAFT GENERATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_timetable_generation_atomic(
    p_generation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_gen RECORD;
    v_deleted_entries INTEGER := 0;
    v_remaining_generations INTEGER := 0;
BEGIN
    -- 1. Authorization Guard
    IF NOT (public.is_admin() OR public.is_timetable_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks administrative privileges'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Lock generation
    SELECT * INTO v_gen
    FROM public.timetable_generations
    WHERE id = p_generation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timetable generation not found: %', p_generation_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Immutability Guard: Reject deletion of published schedules
    IF v_gen.is_published OR (v_gen.metadata->>'is_published')::boolean = true THEN
        RAISE EXCEPTION 'Cannot delete a published timetable. Please unpublish or archive it first.'
            USING ERRCODE = '22000';
    END IF;

    -- 4. Delete entries
    DELETE FROM public.timetable_entries
    WHERE timetable_generation_id = p_generation_id;
    GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;

    -- 5. Delete generation record
    DELETE FROM public.timetable_generations
    WHERE id = p_generation_id;

    -- 6. Check if any generations remain for the configuration
    SELECT COUNT(*) INTO v_remaining_generations
    FROM public.timetable_generations
    WHERE timetable_configuration_id = v_gen.timetable_configuration_id;

    IF v_remaining_generations = 0 THEN
        UPDATE public.timetable_configurations
        SET generation_status = 'DRAFT',
            published_generation_id = NULL,
            updated_at = NOW()
        WHERE id = v_gen.timetable_configuration_id;
    END IF;

    RETURN jsonb_build_object(
        'generation_id', p_generation_id,
        'configuration_id', v_gen.timetable_configuration_id,
        'deleted_entries_count', v_deleted_entries,
        'remaining_generations', v_remaining_generations
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.delete_timetable_generation_atomic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_timetable_generation_atomic(UUID) TO authenticated, service_role;
