# Politiques RLS - Lovable Cloud (DomiCares)

Liste complète des politiques Row Level Security (RLS) à appliquer sur votre base externe.

---

## Table: `addresses`
```sql
CREATE POLICY "Users can manage their addresses" ON public.addresses
FOR ALL USING ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'))
WITH CHECK ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'));
```

---

## Table: `admin_audit_logs`
```sql
CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `admins`
```sql
CREATE POLICY "Admins can manage admins table" ON public.admins
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view admins table" ON public.admins
FOR SELECT TO authenticated
USING (is_admin(auth.uid()));
```

---

## Table: `appointments`
```sql
CREATE POLICY "Admins can update all appointments" ON public.appointments
FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all appointments" ON public.appointments
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Patients can create appointments" ON public.appointments
FOR INSERT WITH CHECK (patient_id = (auth.uid())::text);

CREATE POLICY "Patients can update their appointments" ON public.appointments
FOR UPDATE USING (patient_id = (auth.uid())::text);

CREATE POLICY "Patients can view their appointments" ON public.appointments
FOR SELECT USING (patient_id = (auth.uid())::text);

CREATE POLICY "Practitioners can update their appointments" ON public.appointments
FOR UPDATE TO authenticated
USING (practitioner_id = (get_practitioner_id_for_user(auth.uid()))::text);

CREATE POLICY "Practitioners can view their appointments" ON public.appointments
FOR SELECT TO authenticated
USING (practitioner_id = (get_practitioner_id_for_user(auth.uid()))::text);
```

---

## Table: `care_notes`
```sql
CREATE POLICY "Patients can view shared care notes" ON public.care_notes
FOR SELECT USING (
  (shared_with_patient = true) AND (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = care_notes.appointment_id 
    AND appointments.patient_id = (auth.uid())::text
  ))
);

CREATE POLICY "Practitioners can manage their care notes" ON public.care_notes
FOR ALL USING (
  practitioner_id IN (
    SELECT practitioners.id FROM practitioners
    WHERE practitioners.user_id = auth.uid()
  )
);
```

---

## Table: `care_notes_sharing_log`
```sql
CREATE POLICY "Admins can view sharing log" ON public.care_notes_sharing_log
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can insert sharing log" ON public.care_notes_sharing_log
FOR INSERT WITH CHECK (true);
```

---

## Table: `consent_versions`
```sql
CREATE POLICY "Admins can manage consent versions" ON public.consent_versions
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Everyone can view active consent versions" ON public.consent_versions
FOR SELECT USING ((is_active = true) OR is_admin(auth.uid()));
```

---

## Table: `consents`
```sql
CREATE POLICY "Users can manage their consents" ON public.consents
FOR ALL USING ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'))
WITH CHECK ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'));
```

---

## Table: `consultation_reports`
```sql
CREATE POLICY "Patients can view their consultation reports" ON public.consultation_reports
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = consultation_reports.appointment_id
    AND appointments.patient_id = (auth.uid())::text
  )
);

CREATE POLICY "Practitioners can manage their consultation reports" ON public.consultation_reports
FOR ALL USING (
  practitioner_id IN (
    SELECT practitioners.id FROM practitioners
    WHERE practitioners.user_id = auth.uid()
  )
);
```

---

## Table: `consultation_reports_access_log`
```sql
CREATE POLICY "Admins can view access log" ON public.consultation_reports_access_log
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can insert access log" ON public.consultation_reports_access_log
FOR INSERT WITH CHECK (true);
```

---

## Table: `dispute_messages`
```sql
CREATE POLICY "Users can create messages for their disputes" ON public.dispute_messages
FOR INSERT WITH CHECK (
  (auth.uid() = sender_id) AND (EXISTS (
    SELECT 1 FROM disputes
    WHERE disputes.id = dispute_messages.dispute_id
    AND (disputes.raised_by = auth.uid() OR is_admin(auth.uid()))
  ))
);

CREATE POLICY "Users can view messages for their disputes" ON public.dispute_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM disputes
    WHERE disputes.id = dispute_messages.dispute_id
    AND (disputes.raised_by = auth.uid() OR is_admin(auth.uid()))
  )
);
```

---

## Table: `disputes`
```sql
CREATE POLICY "Admins can manage all disputes" ON public.disputes
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can create disputes for their appointments" ON public.disputes
FOR INSERT WITH CHECK (
  (auth.uid() = raised_by) AND (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = disputes.appointment_id
    AND (appointments.patient_id = (auth.uid())::text OR appointments.practitioner_id = (auth.uid())::text)
  ))
);

CREATE POLICY "Users can view their own disputes" ON public.disputes
FOR SELECT USING (
  (auth.uid() = raised_by) OR (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = disputes.appointment_id
    AND (appointments.patient_id = (auth.uid())::text OR appointments.practitioner_id = (auth.uid())::text)
  ))
);
```

---

## Table: `emergency_contacts`
```sql
CREATE POLICY "Practitioners can view emergency contacts for active appointments" ON public.emergency_contacts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = (p.id)::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = (emergency_contacts.user_id)::text
    AND a.status = 'in-progress'
  )
);

CREATE POLICY "Users can manage their emergency contacts" ON public.emergency_contacts
FOR ALL USING ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'))
WITH CHECK ((auth.uid() = user_id) OR ((auth.jwt() ->> 'role') = 'service_role'));
```

---

## Table: `faqs`
```sql
CREATE POLICY "Admins can manage FAQs" ON public.faqs
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Everyone can view published FAQs" ON public.faqs
FOR SELECT USING ((is_published = true) OR is_admin(auth.uid()));
```

---

## Table: `file_access_logs`
```sql
CREATE POLICY "Service role can insert access logs" ON public.file_access_logs
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view their own access logs" ON public.file_access_logs
FOR SELECT USING ((auth.uid() = user_id) OR is_admin(auth.uid()));
```

---

## Table: `files`
```sql
CREATE POLICY "Users can delete their own files" ON public.files
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files" ON public.files
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files" ON public.files
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own files" ON public.files
FOR SELECT USING (
  (auth.uid() = user_id) OR (auth.uid() = ANY(shared_with)) OR is_admin(auth.uid())
);
```

---

## Table: `group_session_participants`
```sql
CREATE POLICY "Coaches can manage participants in their sessions" ON public.group_session_participants
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM group_sessions gs
    WHERE gs.id = group_session_participants.session_id
    AND gs.coach_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
  )
);

CREATE POLICY "Participants can view their own registrations" ON public.group_session_participants
FOR SELECT USING (
  (auth.uid() = patient_id) OR (EXISTS (
    SELECT 1 FROM group_sessions gs
    WHERE gs.id = group_session_participants.session_id
    AND gs.coach_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
  ))
);

CREATE POLICY "Users can register for group sessions" ON public.group_session_participants
FOR INSERT WITH CHECK (auth.uid() = patient_id);
```

---

## Table: `group_sessions`
```sql
CREATE POLICY "Authenticated users can view group sessions" ON public.group_sessions
FOR SELECT TO authenticated
USING (status = ANY(ARRAY['confirmee', 'planifiee']));

CREATE POLICY "Coaches can manage their group sessions" ON public.group_sessions
FOR ALL USING (
  coach_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `kyc_documents`
```sql
CREATE POLICY "Admins can manage kyc_documents" ON public.kyc_documents
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view all kyc_documents" ON public.kyc_documents
FOR SELECT TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view own kyc_documents" ON public.kyc_documents
FOR SELECT TO authenticated
USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `ledger_accounts`
```sql
CREATE POLICY "Admins can manage ledger accounts" ON public.ledger_accounts
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all ledger accounts" ON public.ledger_accounts
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `ledger_entries`
```sql
CREATE POLICY "Admins can manage ledger entries" ON public.ledger_entries
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all ledger entries" ON public.ledger_entries
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `medical_profiles`
```sql
CREATE POLICY "Patients can create their own medical profile" ON public.medical_profiles
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Patients can delete their own medical profile" ON public.medical_profiles
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Patients can update their own medical profile" ON public.medical_profiles
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Patients can view their own medical profile" ON public.medical_profiles
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Practitioners can view shared medical profiles for active appointments" ON public.medical_profiles
FOR SELECT USING (
  (share_with_practitioner = true) AND (EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = (p.id)::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = (medical_profiles.user_id)::text
    AND a.status = ANY(ARRAY['confirmed', 'in-progress'])
    AND (a.date::date >= CURRENT_DATE - INTERVAL '1 day')
    AND (a.date::date <= CURRENT_DATE + INTERVAL '1 day')
  ))
);

CREATE POLICY "Users can manage their medical profile" ON public.medical_profiles
FOR ALL USING (auth.uid() = user_id);
```

---

## Table: `messages`
```sql
CREATE POLICY "Users can create messages for their appointments" ON public.messages
FOR INSERT WITH CHECK (
  (auth.uid() = sender_id) AND (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = messages.appointment_id
    AND (appointments.patient_id = (auth.uid())::text OR appointments.practitioner_id = (auth.uid())::text)
  ))
);

CREATE POLICY "Users can delete their own messages" ON public.messages
FOR DELETE USING (auth.uid() = sender_id);

CREATE POLICY "Users can view messages for their appointments" ON public.messages
FOR SELECT USING (
  (auth.uid() = sender_id) OR (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = messages.appointment_id
    AND (appointments.patient_id = (auth.uid())::text OR appointments.practitioner_id = (auth.uid())::text)
  ))
);
```

---

## Table: `notification_preferences`
```sql
CREATE POLICY "Users can manage their notification preferences" ON public.notification_preferences
FOR ALL USING (auth.uid() = user_id);
```

---

## Table: `notifications`
```sql
CREATE POLICY "Users can update their notifications" ON public.notifications
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their notifications" ON public.notifications
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `otp_attempts`
```sql
CREATE POLICY "Admins can view OTP attempts" ON public.otp_attempts
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `otp_rate_limits`
```sql
CREATE POLICY "Admins can view OTP rate limits" ON public.otp_rate_limits
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can manage OTP rate limits" ON public.otp_rate_limits
FOR ALL USING (false) WITH CHECK (false);
```

---

## Table: `payment_attempts`
```sql
CREATE POLICY "Admins can view all payment attempts" ON public.payment_attempts
FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid()));

CREATE POLICY "Users can create their own payment attempts" ON public.payment_attempts
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own payment attempts" ON public.payment_attempts
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `payment_events`
```sql
CREATE POLICY "Admins can view all payment events" ON public.payment_events
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view payment events for their appointments" ON public.payment_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM payments p
    JOIN appointments a ON a.id = p.appointment_id
    WHERE p.id = payment_events.payment_id
    AND a.practitioner_id = (get_practitioner_id_for_user(auth.uid()))::text
  )
);

CREATE POLICY "Service role can insert payment events" ON public.payment_events
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view events for their payments" ON public.payment_events
FOR SELECT USING (
  (EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_events.payment_id AND payments.patient_id = auth.uid()))
  OR is_admin(auth.uid())
);

CREATE POLICY "Users can view their payment events" ON public.payment_events
FOR SELECT USING (
  EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_events.payment_id AND payments.patient_id = auth.uid())
);
```

---

## Table: `payment_reconciliations`
```sql
CREATE POLICY "Admins can view reconciliations" ON public.payment_reconciliations
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert reconciliations" ON public.payment_reconciliations
FOR INSERT WITH CHECK (true);
```

---

## Table: `payment_refunds`
```sql
CREATE POLICY "Admins can manage refunds" ON public.payment_refunds
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view refunds" ON public.payment_refunds
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `payments`
```sql
CREATE POLICY "Admins can update all payments" ON public.payments
FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all payments" ON public.payments
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Coaches can view payments for their group sessions" ON public.payments
FOR SELECT USING (
  (appointment_id ~~ 'group_session_%') AND (EXISTS (
    SELECT 1 FROM group_sessions gs
    JOIN practitioners p ON p.id = gs.coach_id
    WHERE p.user_id = auth.uid()
    AND payments.appointment_id ~~ ('%' || gs.id::text || '%')
  ))
);

CREATE POLICY "Practitioners can view payments for their appointments" ON public.payments
FOR SELECT TO authenticated
USING (
  (EXISTS (SELECT 1 FROM appointments a WHERE a.id = payments.appointment_id AND (a.practitioner_id)::uuid = auth.uid()))
  OR (patient_id = auth.uid())
);

CREATE POLICY "Users can create their own payments" ON public.payments
FOR INSERT WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Users can update their own payments" ON public.payments
FOR UPDATE USING (auth.uid() = patient_id);

CREATE POLICY "Users can view their own payments" ON public.payments
FOR SELECT USING (auth.uid() = patient_id);
```

---

## Table: `payout_batches`
```sql
CREATE POLICY "Admins can manage payout batches" ON public.payout_batches
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view payout batches" ON public.payout_batches
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `payout_payments`
```sql
CREATE POLICY "Admins can view payout payments" ON public.payout_payments
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view their payout payments" ON public.payout_payments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM practitioner_payouts pp
    JOIN practitioners p ON p.id = pp.practitioner_id
    WHERE pp.id = payout_payments.payout_id AND p.user_id = auth.uid()
  )
);
```

---

## Table: `practitioner_availability`
```sql
CREATE POLICY "Authenticated users can view availability" ON public.practitioner_availability
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Practitioners can manage their availability" ON public.practitioner_availability
FOR ALL USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioner_balances`
```sql
CREATE POLICY "Admins can manage balances" ON public.practitioner_balances
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all balances" ON public.practitioner_balances
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view their balance" ON public.practitioner_balances
FOR SELECT USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioner_exceptions`
```sql
CREATE POLICY "Practitioners can manage their exceptions" ON public.practitioner_exceptions
FOR ALL USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioner_payment_info`
```sql
CREATE POLICY "Admins can view all payment info" ON public.practitioner_payment_info
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can manage their payment info" ON public.practitioner_payment_info
FOR ALL USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioner_payouts`
```sql
CREATE POLICY "Admins can manage all payouts" ON public.practitioner_payouts
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view their own payouts" ON public.practitioner_payouts
FOR SELECT USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);

CREATE POLICY "Practitioners can view their payouts" ON public.practitioner_payouts
FOR SELECT USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioner_rates`
```sql
CREATE POLICY "Authenticated users can view rates" ON public.practitioner_rates
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Practitioners can manage their rates" ON public.practitioner_rates
FOR ALL USING (
  practitioner_id IN (SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid())
);
```

---

## Table: `practitioners`
```sql
CREATE POLICY "admins_update_all_practitioners" ON public.practitioners
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "admins_view_all_practitioners" ON public.practitioners
FOR SELECT TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "patients_view_booked_practitioner_limited" ON public.practitioners
FOR SELECT USING (
  (auth.uid() = user_id) OR is_admin(auth.uid()) OR (EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.practitioner_id = (practitioners.id)::text
    AND a.patient_id = (auth.uid())::text
    AND a.status = ANY(ARRAY['confirmed', 'in-progress', 'completed', 'pending_payment'])
  ))
);

CREATE POLICY "practitioners_insert_own" ON public.practitioners
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "practitioners_update_own" ON public.practitioners
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
```

---

## Table: `profiles`
```sql
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view patient profiles for appointments" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = (p.id)::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = (profiles.id)::text
    AND a.status = ANY(ARRAY['confirmed', 'in-progress', 'completed', 'pending_payment'])
  )
);

CREATE POLICY "Service role can insert profiles" ON public.profiles
FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can delete own profile" ON public.profiles
FOR DELETE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);
```

---

## Table: `push_subscriptions`
```sql
CREATE POLICY "Users can delete their own subscriptions" ON public.push_subscriptions
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON public.push_subscriptions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscriptions" ON public.push_subscriptions
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `reconciliation_reports`
```sql
CREATE POLICY "Admins can create reconciliation reports" ON public.reconciliation_reports
FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update reconciliation reports" ON public.reconciliation_reports
FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view reconciliation reports" ON public.reconciliation_reports
FOR SELECT USING (is_admin(auth.uid()));
```

---

## Table: `reviews`
```sql
CREATE POLICY "Patients can create reviews for their appointments" ON public.reviews
FOR INSERT WITH CHECK (
  (auth.uid() = patient_id) AND (EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = reviews.appointment_id
    AND appointments.patient_id = (auth.uid())::text
    AND appointments.status = 'completed'
  ))
);

CREATE POLICY "Users can view reviews" ON public.reviews
FOR SELECT USING ((is_hidden = false) OR is_admin(auth.uid()) OR (auth.uid() = patient_id));
```

---

## Table: `saved_payment_methods`
```sql
CREATE POLICY "Users can create their saved payment methods" ON public.saved_payment_methods
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved payment methods" ON public.saved_payment_methods
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update their saved payment methods" ON public.saved_payment_methods
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their saved payment methods" ON public.saved_payment_methods
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `search_activity_logs`
```sql
CREATE POLICY "Admins can view all search activity logs" ON public.search_activity_logs
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert search activity logs" ON public.search_activity_logs
FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL) OR ((auth.jwt() ->> 'role') = 'service_role'));
```

---

## Table: `service_audit_log`
```sql
CREATE POLICY "Only admins can view service audit logs" ON public.service_audit_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'));
```

---

## Table: `services`
```sql
CREATE POLICY "Anyone can view active services" ON public.services
FOR SELECT USING (is_active = true);

CREATE POLICY "Only admins can delete services" ON public.services
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Only admins can insert services" ON public.services
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Only admins can update services" ON public.services
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));
```

---

## Table: `support_tickets`
```sql
CREATE POLICY "Admins can manage all support tickets" ON public.support_tickets
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can create support tickets" ON public.support_tickets
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their support tickets" ON public.support_tickets
FOR UPDATE USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

CREATE POLICY "Users can view their support tickets" ON public.support_tickets
FOR SELECT USING ((auth.uid() = user_id) OR is_admin(auth.uid()));
```

---

## Table: `system_config`
```sql
CREATE POLICY "Admins can manage system config" ON public.system_config
FOR ALL USING (is_admin(auth.uid()));
```

---

## Table: `triage_results`
```sql
CREATE POLICY "Users can create their triage results" ON public.triage_results
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their triage results" ON public.triage_results
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their triage results" ON public.triage_results
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `user_consents`
```sql
CREATE POLICY "Admins can view all user_consents" ON public.user_consents
FOR SELECT TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert own consents" ON public.user_consents
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own consents" ON public.user_consents
FOR SELECT TO authenticated
USING (user_id = auth.uid());
```

---

## Table: `user_roles`
```sql
CREATE POLICY "Super admins can manage all roles" ON public.user_roles
FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own roles" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id);
```

---

## Table: `webhook_events`
```sql
CREATE POLICY "Admins can view webhook events" ON public.webhook_events
FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert webhook events" ON public.webhook_events
FOR INSERT WITH CHECK (true);
```

---

## Fonctions Helper Requises

Ces fonctions DOIVENT exister sur votre base externe :

### `is_admin(user_id uuid)`
```sql
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = $1
    AND role IN ('super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst')
  )
$$;
```

### `has_role(user_id uuid, role app_role)`
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

### `get_practitioner_id_for_user(user_id uuid)`
```sql
CREATE OR REPLACE FUNCTION public.get_practitioner_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.practitioners WHERE user_id = p_user_id LIMIT 1
$$;
```

---

## Activation RLS

N'oubliez pas d'activer RLS sur chaque table :

```sql
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- ... etc pour toutes les tables
```
