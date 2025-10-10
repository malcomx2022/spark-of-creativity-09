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
      appointments: {
        Row: {
          address: string
          created_at: string | null
          date: string
          duration: number
          id: string
          notes: string | null
          patient_id: string
          patient_name: string
          practitioner_id: string
          practitioner_name: string
          reason: string
          specialty: string
          status: string
          time: string
          updated_at: string | null
          urgency_level: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          date: string
          duration?: number
          id?: string
          notes?: string | null
          patient_id: string
          patient_name: string
          practitioner_id: string
          practitioner_name: string
          reason: string
          specialty: string
          status?: string
          time: string
          updated_at?: string | null
          urgency_level?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          date?: string
          duration?: number
          id?: string
          notes?: string | null
          patient_id?: string
          patient_name?: string
          practitioner_id?: string
          practitioner_name?: string
          reason?: string
          specialty?: string
          status?: string
          time?: string
          updated_at?: string | null
          urgency_level?: string | null
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
          created_at: string
          currency: string
          fedapay_payment_url: string | null
          fedapay_transaction_id: string | null
          id: string
          patient_id: string
          payment_method: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id: string
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          id?: string
          patient_id: string
          payment_method: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          created_at?: string
          currency?: string
          fedapay_payment_url?: string | null
          fedapay_transaction_id?: string | null
          id?: string
          patient_id?: string
          payment_method?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      practitioners: {
        Row: {
          address: string | null
          available: boolean | null
          created_at: string | null
          id: string
          image: string | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          rating: number | null
          specialty: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          available?: boolean | null
          created_at?: string | null
          id?: string
          image?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          rating?: number | null
          specialty: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          available?: boolean | null
          created_at?: string | null
          id?: string
          image?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          rating?: number | null
          specialty?: string
          updated_at?: string | null
          user_id?: string
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
          patient_id: string
          practitioner_id: string
          rating: number
        }
        Insert: {
          appointment_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          patient_id: string
          practitioner_id: string
          rating: number
        }
        Update: {
          appointment_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
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
          attachments: string[] | null
          created_at: string | null
          description: string
          id: string
          status: Database["public"]["Enums"]["ticket_status"] | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          attachments?: string[] | null
          created_at?: string | null
          description: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          attachments?: string[] | null
          created_at?: string | null
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subject?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      blood_type: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"],
      consent_type: ["cgu", "charte", "partage_donnees", "marketing"],
      gender: ["homme", "femme", "autre", "non_specifie"],
      ticket_status: ["ouvert", "en_cours", "resolu", "ferme"],
    },
  },
} as const
