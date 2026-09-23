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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          student_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          organization_id: string
          student_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          student_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_links_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "access_links_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      anamnesis_requests: {
        Row: {
          completed_at: string | null
          id: string
          organization_id: string
          requested_at: string
          requested_by: string | null
          student_id: string
          template_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          organization_id: string
          requested_at?: string
          requested_by?: string | null
          student_id: string
          template_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          organization_id?: string
          requested_at?: string
          requested_by?: string | null
          student_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_requests_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "anamnesis_requests_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "anamnesis_requests_template_id_organization_id_fkey"
            columns: ["template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      anamnesis_templates: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          questions: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          questions?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          questions?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_students: {
        Row: {
          class_id: string
          organization_id: string
          student_id: string
        }
        Insert: {
          class_id: string
          organization_id: string
          student_id: string
        }
        Update: {
          class_id?: string
          organization_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_students_class_id_organization_id_fkey"
            columns: ["class_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "class_students_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "class_students_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_trainer_id_organization_id_fkey"
            columns: ["trainer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_counters: {
        Row: {
          last_enrollment_number: number
          organization_id: string
        }
        Insert: {
          last_enrollment_number?: number
          organization_id: string
        }
        Update: {
          last_enrollment_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          overdue_grace_days: number
          plan: Database["public"]["Enums"]["plan_tier"]
          slug: string
          student_limit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          overdue_grace_days?: number
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug: string
          student_limit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          overdue_grace_days?: number
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string
          student_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          organization_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          due_date: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          organization_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          organization_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      pending_signups: {
        Row: {
          consent_at: string | null
          created_at: string
          id: string
          link_id: string
          organization_id: string
          payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["signup_status"]
          student_id: string | null
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          id?: string
          link_id: string
          organization_id: string
          payload: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["signup_status"]
          student_id?: string | null
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          id?: string
          link_id?: string
          organization_id?: string
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["signup_status"]
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_signups_link_id_organization_id_fkey"
            columns: ["link_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "public_signup_links"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pending_signups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_signups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_signups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          organization_id: string
          preferences: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          organization_id: string
          preferences?: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          preferences?: Json
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_signup_links: {
        Row: {
          created_at: string
          form_config: Json
          id: string
          is_active: boolean
          organization_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_config?: Json
          id?: string
          is_active?: boolean
          organization_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_config?: Json
          id?: string
          is_active?: boolean
          organization_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_signup_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      special_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_groups: {
        Row: {
          group_id: string
          organization_id: string
          student_id: string
        }
        Insert: {
          group_id: string
          organization_id: string
          student_id: string
        }
        Update: {
          group_id?: string
          organization_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_groups_group_id_organization_id_fkey"
            columns: ["group_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "special_groups"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "student_groups_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "student_groups_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      students: {
        Row: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          access_expires_at?: string | null
          birth_date?: string | null
          block_if_overdue?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at?: string | null
          id?: string
          last_name: string
          notes?: string | null
          organization_id: string
          photo_path?: string | null
          sex?: Database["public"]["Enums"]["sex"] | null
          source?: Database["public"]["Enums"]["student_source"]
          status?: Database["public"]["Enums"]["student_status"]
          trainer_id?: string | null
          training_location?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          access_expires_at?: string | null
          birth_date?: string | null
          block_if_overdue?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          enrollment_number?: number
          first_name?: string
          health_data_consent_at?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          organization_id?: string
          photo_path?: string | null
          sex?: Database["public"]["Enums"]["sex"] | null
          source?: Database["public"]["Enums"]["student_source"]
          status?: Database["public"]["Enums"]["student_status"]
          trainer_id?: string | null
          training_location?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_trainer_id_organization_id_fkey"
            columns: ["trainer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      students_with_status: {
        Row: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          effective_status:
            | Database["public"]["Enums"]["effective_status"]
            | null
          email: string | null
          enrollment_number: number | null
          first_name: string | null
          full_name: string | null
          health_data_consent_at: string | null
          id: string | null
          last_name: string | null
          notes: string | null
          organization_id: string | null
          photo_path: string | null
          search_text: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"] | null
          status: Database["public"]["Enums"]["student_status"] | null
          trainer_id: string | null
          training_location: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          access_expires_at?: string | null
          birth_date?: string | null
          block_if_overdue?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          effective_status?: never
          email?: string | null
          enrollment_number?: number | null
          first_name?: string | null
          full_name?: never
          health_data_consent_at?: string | null
          id?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: Database["public"]["Enums"]["sex"] | null
          source?: Database["public"]["Enums"]["student_source"] | null
          status?: Database["public"]["Enums"]["student_status"] | null
          trainer_id?: string | null
          training_location?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          access_expires_at?: string | null
          birth_date?: string | null
          block_if_overdue?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          effective_status?: never
          email?: string | null
          enrollment_number?: number | null
          first_name?: string | null
          full_name?: never
          health_data_consent_at?: string | null
          id?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: Database["public"]["Enums"]["sex"] | null
          source?: Database["public"]["Enums"]["student_source"] | null
          status?: Database["public"]["Enums"]["student_status"] | null
          trainer_id?: string | null
          training_location?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_trainer_id_organization_id_fkey"
            columns: ["trainer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Functions: {
      approve_signups: {
        Args: { p_ids: string[]; p_trainer_id?: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_student_expiration: {
        Args: { p_student_id: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_access_link: {
        Args: { p_token: string }
        Returns: {
          email: string
          first_name: string
          organization_id: string
          student_id: string
          user_id: string
        }[]
      }
      create_access_link: { Args: { p_student_id: string }; Returns: string }
      create_student: {
        Args: { p_data: Json }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deactivate_student: {
        Args: { p_student_id: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_signup_link: {
        Args: never
        Returns: {
          created_at: string
          form_config: Json
          id: string
          is_active: boolean
          organization_id: string
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "public_signup_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_student: {
        Args: { p_student_id: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hard_delete_student: {
        Args: { p_confirm_name: string; p_student_id: string }
        Returns: {
          photo_path: string
          user_id: string
        }[]
      }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      organization_plan_usage: {
        Args: never
        Returns: {
          inactive: number
          plan: Database["public"]["Enums"]["plan_tier"]
          remaining: number
          student_limit: number
          used: number
        }[]
      }
      reactivate_student: {
        Args: { p_student_id: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerate_signup_token: {
        Args: never
        Returns: {
          created_at: string
          form_config: Json
          id: string
          is_active: boolean
          organization_id: string
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "public_signup_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_signups: { Args: { p_ids: string[] }; Returns: number }
      soft_delete_student: {
        Args: { p_confirm_name: string; p_student_id: string }
        Returns: undefined
      }
      student_effective_status: {
        Args: { s: Database["public"]["Tables"]["students"]["Row"] }
        Returns: Database["public"]["Enums"]["effective_status"]
      }
      student_tab_counts: {
        Args: never
        Returns: {
          active: number
          expired: number
          inactive: number
        }[]
      }
      submit_public_signup: {
        Args: { p_consent: boolean; p_payload: Json; p_token: string }
        Returns: string
      }
      update_student: {
        Args: { p_patch: Json; p_student_id: string }
        Returns: {
          access_expires_at: string | null
          birth_date: string | null
          block_if_overdue: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          enrollment_number: number
          first_name: string
          health_data_consent_at: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          photo_path: string | null
          sex: Database["public"]["Enums"]["sex"] | null
          source: Database["public"]["Enums"]["student_source"]
          status: Database["public"]["Enums"]["student_status"]
          trainer_id: string | null
          training_location: string | null
          updated_at: string
          user_id: string | null
          whatsapp_e164: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      effective_status: "active" | "blocked" | "inactive" | "expired"
      payment_method: "pix" | "card" | "cash" | "transfer" | "other"
      payment_status: "pending" | "paid" | "canceled"
      plan_tier: "free" | "pro" | "gold"
      sex: "M" | "F"
      signup_status: "pending" | "approved" | "rejected"
      student_source: "manual" | "public_link"
      student_status: "active" | "inactive"
      user_role: "owner" | "trainer" | "student"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      effective_status: ["active", "blocked", "inactive", "expired"],
      payment_method: ["pix", "card", "cash", "transfer", "other"],
      payment_status: ["pending", "paid", "canceled"],
      plan_tier: ["free", "pro", "gold"],
      sex: ["M", "F"],
      signup_status: ["pending", "approved", "rejected"],
      student_source: ["manual", "public_link"],
      student_status: ["active", "inactive"],
      user_role: ["owner", "trainer", "student"],
    },
  },
} as const
