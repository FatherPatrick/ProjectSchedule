-- Index supporting the daily reminder cron lookup
-- (status=CONFIRMED AND reminderSentAt IS NULL AND startsAt BETWEEN x..y).
CREATE INDEX "Appointment_status_reminderSentAt_startsAt_idx"
    ON "Appointment"("status", "reminderSentAt", "startsAt");
