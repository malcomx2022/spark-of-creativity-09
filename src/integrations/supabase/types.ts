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
          created_at: string | null
          date: string
          duration: number
          id: string
          internal_notes: string | null
          notes: string | null
          patient_id: string
          patient_name: string
          practitioner_id: string
          practitioner_name: string
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
          created_at?: string | null
          date: string
          duration?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          patient_id: string
          patient_name: string
          practitioner_id: string
          practitioner_name: string
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
          created_at?: string | null
          date?: string
          duration?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          patient_id?: string
          patient_name?: string
          practitioner_id?: string
          practitioner_name?: string
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
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_id: string
        }
        Insert: {
          appointment_id: string
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id: string
        }
        Update: {
          appointment_id?: string
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
      payments: {
        Row: {
          amount: number
          appointment_id: string
          commission_amount: number | null
          created_at: string
          currency: string
          fedapay_payment_url: string | null
          fedapay_transaction_id: string | null
          fees_amount: number | null
          id: string
          net_amount: number | null
          patient_id: string
          payment_method: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id: string
          commission_amount?: number | null
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          fees_amount?: number | null
          id?: string
          net_amount?: number | null
          patient_id: string
          payment_method: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          commission_amount?: number | null
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          fees_amount?: number | null
          id?: string
          net_amount?: number | null
          patient_id?: string
          payment_method?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      practitioner_payouts: {
        Row: {
          account_details: Json | null
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          payment_method: string
          period_end: string
          period_start: string
          practitioner_id: string
          processed_at: string | null
          status: string | null
        }
        Insert: {
          account_details?: Json | null
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method: string
          period_end: string
          period_start: string
          practitioner_id: string
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          account_details?: Json | null
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string
          period_end?: string
          period_start?: string
          practitioner_id?: string
          processed_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_payouts_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
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
        ]
      }
      practitioners: {
        Row: {
          address: string | null
          available: boolean | null
          bio: string | null
          can_accept_missions: boolean | null
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
          rating: number | null
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
          rating?: number | null
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
          rating?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: {
        Args: { _user_id: string }
        Returns: boolean
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
      ticket_status: ["ouvert", "en_cours", "resolu", "ferme"],
    },
  },
} as const
