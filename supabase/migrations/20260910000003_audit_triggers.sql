-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 003: AUDIT LOGGING & UPDATED_AT TRIGGERS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATED_AT AUTOMATION TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND column_name = 'updated_at'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;
            CREATE TRIGGER trg_set_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
        ', t, t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. AUTOMATIC AUDIT LOGGING TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    current_actor_id UUID;
    action_type TEXT;
    entity_id_val UUID;
    old_data JSONB := NULL;
    new_data JSONB := NULL;
BEGIN
    current_actor_id := auth.uid();
    action_type := TG_OP || '_' || TG_TABLE_NAME;

    IF (TG_OP = 'DELETE') THEN
        entity_id_val := OLD.id;
        old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'UPDATE') THEN
        entity_id_val := NEW.id;
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'INSERT') THEN
        entity_id_val := NEW.id;
        new_data := to_jsonb(NEW);
    END IF;

    -- Insert into audit_logs
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_name,
        entity_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        current_actor_id,
        action_type,
        TG_TABLE_NAME,
        entity_id_val,
        old_data,
        new_data,
        NOW()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit log triggers to critical tables
DROP TRIGGER IF EXISTS audit_timetables ON public.timetables;
CREATE TRIGGER audit_timetables
AFTER INSERT OR UPDATE OR DELETE ON public.timetables
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_attendance_sessions ON public.attendance_sessions;
CREATE TRIGGER audit_attendance_sessions
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_faculty_subjects ON public.faculty_subjects;
CREATE TRIGGER audit_faculty_subjects
AFTER INSERT OR UPDATE OR DELETE ON public.faculty_subjects
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_students ON public.students;
CREATE TRIGGER audit_students
AFTER INSERT OR UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
