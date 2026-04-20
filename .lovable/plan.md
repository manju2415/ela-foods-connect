
Goal: debug the OTP flow with evidence, then fix the real delivery issue instead of assuming it works.

What I verified already
- The `msg91-send-otp` backend function is being triggered for the real number `9108682966`.
- Frontend phone formatting is correct:
  - UI collects `9108682966`
  - frontend sends `+919108682966`
  - backend normalizes it to `919108682966`
- Live backend logs show two actual MSG91 API calls:

```text
2026-04-20T07:13:03Z
[msg91-send-otp] Sending OTP to: 919108682966
[msg91-send-otp] Request body: {"mobile":"919108682966","template_id":"MSG91_TEMPLATE_ID=69b906d98a47e8b5070e0862","otp_length":6}
[msg91-send-otp] HTTP Status: 200
[msg91-send-otp] Response: {"request_id":"3664746c51636a71454b5350","type":"success"}

2026-04-20T07:13:37Z
[msg91-send-otp] Sending OTP to: 919108682966
[msg91-send-otp] Request body: {"mobile":"919108682966","template_id":"MSG91_TEMPLATE_ID=69b906d98a47e8b5070e0862","otp_length":6}
[msg91-send-otp] HTTP Status: 200
[msg91-send-otp] Response: {"request_id":"3664746c514c616671383452","type":"success"}
```

Most important finding
- The configured template value is malformed in the request.
- It is currently being sent as:
  - `MSG91_TEMPLATE_ID=69b906d98a47e8b5070e0862`
- It should almost certainly be only the raw template id:
  - `69b906d98a47e8b5070e0862`

Why this matters
- This explains why the backend “looks successful” while delivery can still fail or behave incorrectly.
- The current code only returns `{ success: true }` on provider success, so the UI hides useful diagnostics.
- I cannot confirm dashboard-side DLT status from code alone, but the malformed template value is a real issue visible in logs and should be fixed first.

What I will change after approval
1. Fix the MSG91 template handling
- Correct the runtime secret so it stores only the raw template id.
- Also harden the backend to sanitize bad secret formats like `KEY=value` so this cannot silently break again.

2. Add proper backend diagnostics
- Update `msg91-send-otp` to return structured debug info:
  - normalized mobile
  - provider HTTP status
  - provider response body
  - request id
  - sanitized template id info
  - clear error reason when delivery setup is rejected
- Do the same for `msg91-verify-otp`.

3. Stop swallowing errors in the UI
- Update `Auth.tsx` and `MLMLogin.tsx` to log the full function response in the browser console.
- Show the real backend/provider error message in the toast instead of generic failures.

4. Re-test the flow with evidence
- Trigger OTP again for a real number.
- Confirm fresh logs show the corrected template id format.
- Capture the new MSG91 response and request id.
- If send still reports success but SMS is not delivered, use the request id to isolate the dashboard-side issue.

5. Validate dashboard-side DLT configuration
- Check that the template is ACTIVE in MSG91.
- Check it is linked to:
  - Entity: `Ela Foods and Snacks Pvt Ltd`
  - correct Sender ID, e.g. `ELABZR`
  - the approved Airtel DLT setup
- If code-side fix is done and SMS still does not arrive, this is the next likely root cause.

Additional security fix I should include
- `supabase/functions/msg91-config/index.ts` currently exposes `MSG91_AUTH_TOKEN` to the client.
- That secret should not be returned to the browser.
- I should remove that leakage while fixing the OTP flow.

Technical details
- Current send function confirms provider acceptance, not actual handset delivery.
- There are no `msg91-verify-otp` logs yet, so verification has not completed successfully in the tested real-phone flow.
- The backend secret exists, so this does not look like a missing-key problem.
- The API key appears accepted enough to get a MSG91 `request_id`, but I still need to surface provider diagnostics properly to distinguish:
  - accepted by API
  - rejected by DLT/template
  - accepted but not delivered by route/template setup

Expected result after implementation
- You will be able to see the exact backend/provider response instead of a vague success/failure.
- The template id will be sent correctly.
- We will know whether the remaining issue is code/config or MSG91 dashboard DLT setup.
- If the SMS still does not arrive, the request ids already captured (`3664746c51636a71454b5350`, `3664746c514c616671383452`) can be checked against MSG91 reports to confirm the exact delivery/DLT rejection reason.
