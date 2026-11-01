# API — Email expiration (removed)

The `/api/expiration` routes were **removed**: the Expiration screen became rule templates ("OTP codes — expires after 1 day"…, see [Rules](rules.md)), which create an `older_than` + `trash` rule.

Expirations **already set** are still honoured: every 15 minutes the scheduler moves due emails to the Gmail trash (active accounts) and marks the expiration `is_deleted`. Once none is pending (`SELECT count(*) FROM email_expirations WHERE is_deleted = false` = 0), the table, the service and the scheduled task will be removed.
