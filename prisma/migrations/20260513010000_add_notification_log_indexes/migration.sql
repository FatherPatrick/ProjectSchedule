-- Operational indexes for NotificationLog.
-- - (appointmentId, kind) supports "have we already sent a CONFIRMATION
--   for this appointment?" without scanning every row for that appt.
-- - (status, sentAt) supports recent-failures queries
--   ("FAILED sends in the last hour") used by ops dashboards.
CREATE INDEX "NotificationLog_appointmentId_kind_idx"
    ON "NotificationLog"("appointmentId", "kind");

CREATE INDEX "NotificationLog_status_sentAt_idx"
    ON "NotificationLog"("status", "sentAt");
