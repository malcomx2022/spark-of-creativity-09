export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address: string
          city: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          label: string
          latitude: number | null
          longitude: number | null
          postal_code: string | null
          user_id: string
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          user_id: string
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          address: string
          confirmation_requested_at: string | null
          created_at: string | null
          date: string
          duration: number
          id: string
          internal_notes: string | null
          notes: string | null
          patient_confirmed_at: string | null
          patient_id: string
          patient_name: string
          payment_amount: number | null
          payment_expires_at: string | null
          practitioner_id: string
          practitioner_last_location_update: string | null
          practitioner_latitude: number | null
          practitioner_longitude: number | null
          practitioner_name: string
          practitioner_status: string | null
          pre_visit_checklist: Json | null
          reason: string
          specialty: string
          status: string
          time: string
          updated_at: string | null
          urgency_level: string | null
          visit_status: string | null
        }
        Insert: {
          address: string
          confirmation_requested_at?: string | null
          created_at?: string | null
          date: string
          duration?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          patient_confirmed_at?: string | null
          patient_id: string
          patient_name: string
          payment_amount?: number | null
          payment_expires_at?: string | null
          practitioner_id: string
          practitioner_last_location_update?: string | null
          practitioner_latitude?: number | null
          practitioner_longitude?: number | null
          practitioner_name: string
          practitioner_status?: string | null
          pre_visit_checklist?: Json | null
          reason: string
          specialty: string
          status?: string
          time: string
          updated_at?: string | null
          urgency_level?: string | null
          visit_status?: string | null
        }
        Update: {
          address?: string
          confirmation_requested_at?: string | null
          created_at?: string | null
          date?: string
          duration?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          patient_confirmed_at?: string | null
          patient_id?: string
          patient_name?: string
          payment_amount?: number | null
          payment_expires_at?: string | null
          practitioner_id?: string
          practitioner_last_location_update?: string | null
          practitioner_latitude?: number | null
          practitioner_longitude?: number | null
          practitioner_name?: string
          practitioner_status?: string | null
          pre_visit_checklist?: Json | null
          reason?: string
          specialty?: string
          status?: string
          time?: string
          updated_at?: string | null
          urgency_level?: string | null
          visit_status?: string | null
        }
        Relationships: []
      }
      care_notes: {
        Row: {
          appointment_id: string
          assessment: string | null
          attachments: string[] | null
          created_at: string | null
          id: string
          objective: string | null
          plan: string | null
          practitioner_id: string
          shared_with_patient: boolean | null
          subjective: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id: string
          assessment?: string | null
          attachments?: string[] | null
          created_at?: string | null
          id?: string
          objective?: string | null
          plan?: string | null
          practitioner_id: string
          shared_with_patient?: boolean | null
          subjective?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string
          assessment?: string | null
          attachments?: string[] | null
          created_at?: string | null
          id?: string
          objective?: string | null
          plan?: string | null
          practitioner_id?: string
          shared_with_patient?: boolean | null
          subjective?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_notes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_notes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_versions: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          content: string
          created_at: string | null
          created_by: string | null
          effective_date: string | null
          id: string
          is_active: boolean | null
          version: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          content: string
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          version: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          content?: string
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          version?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          accepted_at: string | null
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string | null
          id: string
          is_accepted: boolean | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string | null
          id?: string
          is_accepted?: boolean | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string | null
          id?: string
          is_accepted?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      consultation_reports: {
        Row: {
          additional_comments: string | null
          appointment_id: string
          clinical_findings: string | null
          consultation_date: string
          consultation_reason: string | null
          consultation_type: string
          created_at: string | null
          follow_up_recommendation: string | null
          follow_up_timeframe: string | null
          id: string
          practitioner_id: string
          primary_diagnosis: string | null
          severity_level: string
          share_with_doctor: boolean | null
          treatment_prescription: string | null
          updated_at: string | null
        }
        Insert: {
          additional_comments?: string | null
          appointment_id: string
          clinical_findings?: string | null
          consultation_date?: string
          consultation_reason?: string | null
          consultation_type: string
          created_at?: string | null
          follow_up_recommendation?: string | null
          follow_up_timeframe?: string | null
          id?: string
          practitioner_id: string
          primary_diagnosis?: string | null
          severity_level: string
          share_with_doctor?: boolean | null
          treatment_prescription?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_comments?: string | null
          appointment_id?: string
          clinical_findings?: string | null
          consultation_date?: string
          consultation_reason?: string | null
          consultation_type?: string
          created_at?: string | null
          follow_up_recommendation?: string | null
          follow_up_timeframe?: string | null
          id?: string
          practitioner_id?: string
          primary_diagnosis?: string | null
          severity_level?: string
          share_with_doctor?: boolean | null
          treatment_prescription?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dispute_messages: {
        Row: {
          attachments: string[] | null
          created_at: string | null
          dispute_id: string
          id: string
          message: string
          sender_id: string
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string | null
          dispute_id: string
          id?: string
          message: string
          sender_id: string
        }
        Update: {
          attachments?: string[] | null
          created_at?: string | null
          dispute_id?: string
          id?: string
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          created_at: string | null
          description: string
          id: string
          priority: string | null
          raised_by: string
          resolution: string | null
          resolved_at: string | null
          sla_deadline: string | null
          status: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          created_at?: string | null
          description: string
          id?: string
          priority?: string | null
          raised_by: string
          resolution?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          created_at?: string | null
          description?: string
          id?: string
          priority?: string | null
          raised_by?: string
          resolution?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string | null
          id: string
          name: string
          phone: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          phone: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          phone?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          is_published: boolean | null
          question: string
          target_audience: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          answer: string
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          question: string
          target_audience?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          question?: string
          target_audience?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      file_access_logs: {
        Row: {
          access_type: string
          created_at: string | null
          file_id: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          access_type: string
          created_at?: string | null
          file_id?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          access_type?: string
          created_at?: string | null
          file_id?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_access_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string | null
          folder: string | null
          id: string
          metadata: Json | null
          shared_with: string[] | null
          storage_provider: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type?: string | null
          folder?: string | null
          id?: string
          metadata?: Json | null
          shared_with?: string[] | null
          storage_provider?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string | null
          folder?: string | null
          id?: string
          metadata?: Json | null
          shared_with?: string[] | null
          storage_provider?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      group_session_participants: {
        Row: {
          id: string
          joined_at: string | null
          patient_id: string
          payment_status: string | null
          session_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          patient_id: string
          payment_status?: string | null
          session_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          patient_id?: string
          payment_status?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "group_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_sessions: {
        Row: {
          coach_id: string
          created_at: string | null
          current_participants: number | null
          description: string | null
          end_time: string
          id: string
          location: string
          max_participants: number | null
          min_participants: number | null
          price_per_person: number
          scheduled_date: string
          session_name: string
          session_type: string
          start_time: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          current_participants?: number | null
          description?: string | null
          end_time: string
          id?: string
          location: string
          max_participants?: number | null
          min_participants?: number | null
          price_per_person: number
          scheduled_date: string
          session_name: string
          session_type: string
          start_time: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          current_participants?: number | null
          description?: string | null
          end_time?: string
          id?: string
          location?: string
          max_participants?: number | null
          min_participants?: number | null
          price_per_person?: number
          scheduled_date?: string
          session_name?: string
          session_type?: string
          start_time?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["ledger_account_type"]
          created_at: string
          currency: string
          id: string
          owner_id: string | null
          owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Insert: {
          account_type: Database["public"]["Enums"]["ledger_account_type"]
          created_at?: string
          currency?: string
          id?: string
          owner_id?: string | null
          owner_type: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Update: {
          account_type?: Database["public"]["Enums"]["ledger_account_type"]
          created_at?: string
          currency?: string
          id?: string
          owner_id?: string | null
          owner_type?: Database["public"]["Enums"]["ledger_owner_type"]
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          currency: string
          debit: number
          description: string | null
          id: string
          reference_id: string
          reference_type: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          currency?: string
          debit?: number
          description?: string | null
          id?: string
          reference_id: string
          reference_type: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          currency?: string
          debit?: number
          description?: string | null
          id?: string
          reference_id?: string
          reference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_profiles: {
        Row: {
          additional_notes: string | null
          allergies: string | null
          blood_type: Database["public"]["Enums"]["blood_type"] | null
          chronic_diseases: string | null
          created_at: string | null
          current_medications: string | null
          id: string
          share_with_practitioner: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          allergies?: string | null
          blood_type?: Database["public"]["Enums"]["blood_type"] | null
          chronic_diseases?: string | null
          created_at?: string | null
          current_medications?: string | null
          id?: string
          share_with_practitioner?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          allergies?: string | null
          blood_type?: Database["public"]["Enums"]["blood_type"] | null
          chronic_diseases?: string | null
          created_at?: string | null
          current_medications?: string | null
          id?: string
          share_with_practitioner?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          appointment_id: string
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_id: string
        }
        Insert: {
          appointment_id: string
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id: string
        }
        Update: {
          appointment_id?: string
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          push_enabled: boolean | null
          sms_enabled: boolean | null
          updated_at: string | null
          user_id: string
          whatsapp_enabled: boolean | null
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
          whatsapp_enabled?: boolean | null
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
          whatsapp_enabled?: boolean | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      otp_attempts: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          phone_number: string
          status: string
          twilio_sid: string | null
          user_agent: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          phone_number: string
          status: string
          twilio_sid?: string | null
          user_agent?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          phone_number?: string
          status?: string
          twilio_sid?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      otp_rate_limits: {
        Row: {
          attempts: number | null
          blocked_until: string | null
          first_attempt_at: string | null
          phone_number: string
        }
        Insert: {
          attempts?: number | null
          blocked_until?: string | null
          first_attempt_at?: string | null
          phone_number: string
        }
        Update: {
          attempts?: number | null
          blocked_until?: string | null
          first_attempt_at?: string | null
          phone_number?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount: number
          appointment_id: string | null
          attempt_number: number
          completed_at: string | null
          created_at: string | null
          error_details: Json | null
          error_message: string | null
          error_type: string | null
          id: string
          payment_id: string | null
          payment_method: string
          phone_number_encrypted: string | null
          retry_after: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          attempt_number?: number
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          payment_id?: string | null
          payment_method: string
          phone_number_encrypted?: string | null
          retry_after?: string | null
          status: string
          user_id: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          attempt_number?: number
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          payment_id?: string | null
          payment_method?: string
          phone_number_encrypted?: string | null
          retry_after?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          payment_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          payment_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliations: {
        Row: {
          fedapay_status: string
          fedapay_transaction_data: Json | null
          id: string
          new_status: string
          notes: string | null
          old_status: string
          payment_id: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_type: string
        }
        Insert: {
          fedapay_status: string
          fedapay_transaction_data?: Json | null
          id?: string
          new_status: string
          notes?: string | null
          old_status: string
          payment_id?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_type: string
        }
        Update: {
          fedapay_status?: string
          fedapay_transaction_data?: Json | null
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string
          payment_id?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          created_at: string
          id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          refund_amount: number
          refund_reason: string | null
          refunded_by: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id: string
          processed_at?: string | null
          provider_refund_id?: string | null
          refund_amount: number
          refund_reason?: string | null
          refunded_by: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string
          processed_at?: string | null
          provider_refund_id?: string | null
          refund_amount?: number
          refund_reason?: string | null
          refunded_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string
          channel: string | null
          commission_amount: number | null
          created_at: string
          currency: string
          fedapay_payment_url: string | null
          fedapay_transaction_id: string | null
          fees_amount: number | null
          gateway_fees_amount: number | null
          hold_until: string | null
          id: string
          idempotency_key: string | null
          invoice_number: string | null
          net_amount: number | null
          patient_id: string
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_method: string
          payment_session_data: Json | null
          payout_status: string | null
          provider_ref: string | null
          receipt_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id: string
          channel?: string | null
          commission_amount?: number | null
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          fees_amount?: number | null
          gateway_fees_amount?: number | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_number?: string | null
          net_amount?: number | null
          patient_id: string
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_method: string
          payment_session_data?: Json | null
          payout_status?: string | null
          provider_ref?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          channel?: string | null
          commission_amount?: number | null
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          fees_amount?: number | null
          gateway_fees_amount?: number | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_number?: string | null
          net_amount?: number | null
          patient_id?: string
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_method?: string
          payment_session_data?: Json | null
          payout_status?: string | null
          provider_ref?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payout_batches: {
        Row: {
          batch_date: string
          created_at: string
          created_by: string
          id: string
          payment_method: string
          practitioners_count: number
          processed_at: string | null
          statement_url: string | null
          status: Database["public"]["Enums"]["payout_batch_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          batch_date?: string
          created_at?: string
          created_by: string
          id?: string
          payment_method: string
          practitioners_count?: number
          processed_at?: string | null
          statement_url?: string | null
          status?: Database["public"]["Enums"]["payout_batch_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          batch_date?: string
          created_at?: string
          created_by?: string
          id?: string
          payment_method?: string
          practitioners_count?: number
          processed_at?: string | null
          statement_url?: string | null
          status?: Database["public"]["Enums"]["payout_batch_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      payout_payments: {
        Row: {
          amount_included: number
          created_at: string | null
          id: string
          payment_id: string
          payout_id: string
        }
        Insert: {
          amount_included: number
          created_at?: string | null
          id?: string
          payment_id: string
          payout_id: string
        }
        Update: {
          amount_included?: number
          created_at?: string | null
          id?: string
          payment_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_payments_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "practitioner_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          practitioner_id: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          practitioner_id: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          practitioner_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_availability_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_availability_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_balances: {
        Row: {
          balance_available: number
          balance_on_hold: number
          balance_pending: number
          currency: string
          last_payout_at: string | null
          practitioner_id: string
          updated_at: string
        }
        Insert: {
          balance_available?: number
          balance_on_hold?: number
          balance_pending?: number
          currency?: string
          last_payout_at?: string | null
          practitioner_id: string
          updated_at?: string
        }
        Update: {
          balance_available?: number
          balance_on_hold?: number
          balance_pending?: number
          currency?: string
          last_payout_at?: string | null
          practitioner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_balances_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: true
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_balances_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: true
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_exceptions: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_available: boolean | null
          practitioner_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_available?: boolean | null
          practitioner_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_available?: boolean | null
          practitioner_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_exceptions_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_exceptions_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_payment_info: {
        Row: {
          account_holder_name: string
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          id: string
          is_verified: boolean | null
          payment_method: string
          phone_number: string | null
          practitioner_id: string
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean | null
          payment_method: string
          phone_number?: string | null
          practitioner_id: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean | null
          payment_method?: string
          phone_number?: string | null
          practitioner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_payment_info_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_payment_info_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_payouts: {
        Row: {
          account_details: Json | null
          amount: number
          batch_id: string | null
          commission_amount: number | null
          created_at: string | null
          currency: string | null
          fees_amount: number | null
          id: string
          net_amount: number | null
          payment_method: string
          period_end: string
          period_start: string
          practitioner_id: string
          processed_at: string | null
          status: string | null
          transaction_ids: string[] | null
        }
        Insert: {
          account_details?: Json | null
          amount: number
          batch_id?: string | null
          commission_amount?: number | null
          created_at?: string | null
          currency?: string | null
          fees_amount?: number | null
          id?: string
          net_amount?: number | null
          payment_method: string
          period_end: string
          period_start: string
          practitioner_id: string
          processed_at?: string | null
          status?: string | null
          transaction_ids?: string[] | null
        }
        Update: {
          account_details?: Json | null
          amount?: number
          batch_id?: string | null
          commission_amount?: number | null
          created_at?: string | null
          currency?: string | null
          fees_amount?: number | null
          id?: string
          net_amount?: number | null
          payment_method?: string
          period_end?: string
          period_start?: string
          practitioner_id?: string
          processed_at?: string | null
          status?: string | null
          transaction_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_payouts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_payouts_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_payouts_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_rates: {
        Row: {
          base_price: number
          created_at: string | null
          duration_minutes: number | null
          id: string
          practitioner_id: string
          service_type: string
          updated_at: string | null
        }
        Insert: {
          base_price: number
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          practitioner_id: string
          service_type: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          practitioner_id?: string
          service_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_rates_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_rates_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioners: {
        Row: {
          address: string | null
          available: boolean | null
          bio: string | null
          can_accept_missions: boolean | null
          certifications: string[] | null
          communes_served: string[] | null
          created_at: string | null
          diplomas: string[] | null
          id: string
          id_document_expiry: string | null
          id_document_url: string | null
          image: string | null
          insurance_document_url: string | null
          insurance_expiry: string | null
          intervention_radius: number | null
          intervention_zone: string | null
          is_online: boolean | null
          kyc_comment: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          kyc_status: string | null
          kyc_validated_at: string | null
          languages: string[] | null
          latitude: number | null
          license_document_url: string | null
          license_expiry: string | null
          license_number: string | null
          longitude: number | null
          name: string
          phone: string | null
          practitioner_type:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating: number | null
          session_types: string[] | null
          specialty: string
          updated_at: string | null
          user_id: string
          years_experience: number | null
        }
        Insert: {
          address?: string | null
          available?: boolean | null
          bio?: string | null
          can_accept_missions?: boolean | null
          certifications?: string[] | null
          communes_served?: string[] | null
          created_at?: string | null
          diplomas?: string[] | null
          id?: string
          id_document_expiry?: string | null
          id_document_url?: string | null
          image?: string | null
          insurance_document_url?: string | null
          insurance_expiry?: string | null
          intervention_radius?: number | null
          intervention_zone?: string | null
          is_online?: boolean | null
          kyc_comment?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: string | null
          kyc_validated_at?: string | null
          languages?: string[] | null
          latitude?: number | null
          license_document_url?: string | null
          license_expiry?: string | null
          license_number?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          practitioner_type?:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating?: number | null
          session_types?: string[] | null
          specialty: string
          updated_at?: string | null
          user_id: string
          years_experience?: number | null
        }
        Update: {
          address?: string | null
          available?: boolean | null
          bio?: string | null
          can_accept_missions?: boolean | null
          certifications?: string[] | null
          communes_served?: string[] | null
          created_at?: string | null
          diplomas?: string[] | null
          id?: string
          id_document_expiry?: string | null
          id_document_url?: string | null
          image?: string | null
          insurance_document_url?: string | null
          insurance_expiry?: string | null
          intervention_radius?: number | null
          intervention_zone?: string | null
          is_online?: boolean | null
          kyc_comment?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: string | null
          kyc_validated_at?: string | null
          languages?: string[] | null
          latitude?: number | null
          license_document_url?: string | null
          license_expiry?: string | null
          license_number?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          practitioner_type?:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating?: number | null
          session_types?: string[] | null
          specialty?: string
          updated_at?: string | null
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          phone: string | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id: string
          phone?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          phone?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_reports: {
        Row: {
          amount_mismatch_count: number
          anomalies: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          matched_count: number
          missing_in_db_count: number
          missing_in_fedapay_count: number
          period_end: string
          period_start: string
          recommendations: Json | null
          status: string
          status_mismatch_count: number
          total_amount_discrepancy: number
          total_db_payments: number
          total_fedapay_transactions: number
          updated_at: string
        }
        Insert: {
          amount_mismatch_count?: number
          anomalies?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          matched_count?: number
          missing_in_db_count?: number
          missing_in_fedapay_count?: number
          period_end: string
          period_start: string
          recommendations?: Json | null
          status?: string
          status_mismatch_count?: number
          total_amount_discrepancy?: number
          total_db_payments?: number
          total_fedapay_transactions?: number
          updated_at?: string
        }
        Update: {
          amount_mismatch_count?: number
          anomalies?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          matched_count?: number
          missing_in_db_count?: number
          missing_in_fedapay_count?: number
          period_end?: string
          period_start?: string
          recommendations?: Json | null
          status?: string
          status_mismatch_count?: number
          total_amount_discrepancy?: number
          total_db_payments?: number
          total_fedapay_transactions?: number
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          appointment_id: string
          comment: string | null
          created_at: string | null
          id: string
          is_hidden: boolean | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          patient_id: string
          practitioner_id: string
          rating: number
        }
        Insert: {
          appointment_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_hidden?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          patient_id: string
          practitioner_id: string
          rating: number
        }
        Update: {
          appointment_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_hidden?: boolean | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          patient_id?: string
          practitioner_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_methods: {
        Row: {
          consent_given_at: string
          created_at: string | null
          id: string
          is_default: boolean | null
          phone_number_encrypted: string
          phone_number_masked: string
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consent_given_at?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          phone_number_encrypted: string
          phone_number_masked: string
          provider: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consent_given_at?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          phone_number_encrypted?: string
          phone_number_masked?: string
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_audit_log: {
        Row: {
          action: string
          id: string
          modified_at: string | null
          modified_by: string | null
          new_values: Json | null
          old_values: Json | null
          service_id: string | null
        }
        Insert: {
          action: string
          id?: string
          modified_at?: string | null
          modified_by?: string | null
          new_values?: Json | null
          old_values?: Json | null
          service_id?: string | null
        }
        Update: {
          action?: string
          id?: string
          modified_at?: string | null
          modified_by?: string | null
          new_values?: Json | null
          old_values?: Json | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_audit_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price: number | null
          category: string | null
          created_at: string | null
          description: string | null
          duration: number | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          base_price?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          base_price?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          attachments: string[] | null
          created_at: string | null
          description: string
          id: string
          priority: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"] | null
          subject: string
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          attachments?: string[] | null
          created_at?: string | null
          description: string
          id?: string
          priority?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subject: string
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          attachments?: string[] | null
          created_at?: string | null
          description?: string
          id?: string
          priority?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subject?: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      triage_results: {
        Row: {
          answers: Json | null
          created_at: string | null
          id: string
          message: string | null
          recommendations: string[] | null
          score: number
          urgency_level: string
          user_id: string
        }
        Insert: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          message?: string | null
          recommendations?: string[] | null
          score: number
          urgency_level: string
          user_id: string
        }
        Update: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          message?: string | null
          recommendations?: string[] | null
          score?: number
          urgency_level?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          error_message: string | null
          error_stack: string | null
          event_id: string
          event_type: string
          id: string
          last_retry_at: string | null
          payload: Json
          processed_at: string | null
          processing_status: string | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          event_id: string
          event_type: string
          id?: string
          last_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          processing_status?: string | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          event_id?: string
          event_type?: string
          id?: string
          last_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_dashboard_stats: {
        Row: {
          appointments_count: number | null
          patients_count: number | null
          practitioners_count: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      admin_finance_stats: {
        Row: {
          completed_payments: number | null
          pending_payments: number | null
          pending_payouts: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      practitioners_public_view: {
        Row: {
          address: string | null
          available: boolean | null
          bio: string | null
          certifications: string[] | null
          communes_served: string[] | null
          id: string | null
          image: string | null
          intervention_radius: number | null
          intervention_zone: string | null
          languages: string[] | null
          latitude: number | null
          longitude: number | null
          name: string | null
          practitioner_type:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating: number | null
          session_types: string[] | null
          specialty: string | null
          years_experience: number | null
        }
        Insert: {
          address?: string | null
          available?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          communes_served?: string[] | null
          id?: string | null
          image?: string | null
          intervention_radius?: number | null
          intervention_zone?: string | null
          languages?: string[] | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          practitioner_type?:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating?: number | null
          session_types?: string[] | null
          specialty?: string | null
          years_experience?: number | null
        }
        Update: {
          address?: string | null
          available?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          communes_served?: string[] | null
          id?: string | null
          image?: string | null
          intervention_radius?: number | null
          intervention_zone?: string | null
          languages?: string[] | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          practitioner_type?:
            | Database["public"]["Enums"]["practitioner_type"]
            | null
          rating?: number | null
          session_types?: string[] | null
          specialty?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_practitioner_kyc: {
        Args: { p_reviewed_by?: string; p_user_id: string }
        Returns: Json
      }
      auto_confirm_consultations: { Args: never; Returns: undefined }
      check_otp_rate_limit: { Args: { phone: string }; Returns: Json }
      cleanup_expired_payment_slots: { Args: never; Returns: undefined }
      cleanup_old_file_access_logs: { Args: never; Returns: undefined }
      cleanup_old_otp_attempts: { Args: never; Returns: undefined }
      cleanup_old_otp_rate_limits: { Args: never; Returns: undefined }
      cleanup_old_payment_attempts: { Args: never; Returns: undefined }
      generate_invoice_number: { Args: never; Returns: string }
      get_practitioner_id_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_payment_balance: {
        Args: {
          p_net_amount: number
          p_payment_id: string
          p_practitioner_id: string
        }
        Returns: Json
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      promote_to_super_admin: { Args: { user_email: string }; Returns: Json }
      request_consultation_confirmation: { Args: never; Returns: undefined }
      reserve_group_session_spot: {
        Args: { p_patient_id: string; p_session_id: string }
        Returns: Json
      }
      update_payment_with_balance: {
        Args: {
          p_hold_until?: string
          p_net_amount: number
          p_new_payout_status: string
          p_new_status: string
          p_payment_id: string
          p_practitioner_id: string
        }
        Returns: Json
      }
      update_practitioner_balance_atomic: {
        Args: {
          p_delta_available?: number
          p_delta_on_hold?: number
          p_delta_pending?: number
          p_practitioner_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "ops"
        | "finance"
        | "compliance"
        | "support"
        | "analyst"
      blood_type:
        | "A+"
        | "A-"
        | "B+"
        | "B-"
        | "AB+"
        | "AB-"
        | "O+"
        | "O-"
        | "inconnu"
      consent_type: "cgu" | "charte" | "partage_donnees" | "marketing"
      gender: "homme" | "femme" | "autre" | "non_specifie"
      ledger_account_type:
        | "cash"
        | "payable"
        | "receivable"
        | "revenue_commission"
        | "revenue_fees"
        | "obligation"
      ledger_owner_type: "platform" | "patient" | "practitioner"
      payout_batch_status:
        | "queued"
        | "processing"
        | "sent"
        | "failed"
        | "partially_sent"
      practitioner_type:
        | "medecin"
        | "infirmier"
        | "kinesitherapeute"
        | "nutritionniste"
        | "sage_femme"
        | "psychologue"
        | "coach_sportif"
        | "autre"
      ticket_status: "ouvert" | "en_cours" | "resolu" | "ferme"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "ops",
        "finance",
        "compliance",
        "support",
        "analyst",
      ],
      blood_type: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"],
      consent_type: ["cgu", "charte", "partage_donnees", "marketing"],
      gender: ["homme", "femme", "autre", "non_specifie"],
      ledger_account_type: [
        "cash",
        "payable",
        "receivable",
        "revenue_commission",
        "revenue_fees",
        "obligation",
      ],
      ledger_owner_type: ["platform", "patient", "practitioner"],
      payout_batch_status: [
        "queued",
        "processing",
        "sent",
        "failed",
        "partially_sent",
      ],
      practitioner_type: [
        "medecin",
        "infirmier",
        "kinesitherapeute",
        "nutritionniste",
        "sage_femme",
        "psychologue",
        "coach_sportif",
        "autre",
      ],
      ticket_status: ["ouvert", "en_cours", "resolu", "ferme"],
    },
  },
} as const
