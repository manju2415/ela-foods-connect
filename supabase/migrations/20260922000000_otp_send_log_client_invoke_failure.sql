-- Some login/verify attempts never reach verify-otp-login at all (dropped
-- connection, a stale cached bundle calling a removed/renamed endpoint,
-- CORS block) — until now these were invisible: no row anywhere named them,
-- so a customer's "it doesn't work" couldn't be distinguished from a real
-- server-side rejection. Let the browser record just this one narrow case,
-- best-effort, from the public (anon) client — the user has no session yet
-- at the point a login attempt is failing.
--
-- Scoped tightly on purpose: only INSERT, only this exact outcome value, no
-- SELECT/UPDATE/DELETE grant — the existing admin-only SELECT policy is
-- untouched, so this cannot be used to read the log, and cannot be used to
-- write any other outcome (in particular, not a fake "session:SUCCESS").
DROP POLICY IF EXISTS "Anon can log a failed client invoke" ON public.otp_send_log;
CREATE POLICY "Anon can log a failed client invoke"
ON public.otp_send_log FOR INSERT
TO anon, authenticated
WITH CHECK (outcome = 'session:CLIENT_INVOKE_FAILED');

GRANT INSERT ON public.otp_send_log TO anon;
GRANT INSERT ON public.otp_send_log TO authenticated;
