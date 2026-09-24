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
      exercise_contraindications: {
        Row: {
          condition_id: string
          created_at: string
          created_by: string | null
          exercise_id: string
          id: string
          level: Database["public"]["Enums"]["contraindication_level"]
          note: string | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          condition_id: string
          created_at?: string
          created_by?: string | null
          exercise_id: string
          id?: string
          level: Database["public"]["Enums"]["contraindication_level"]
          note?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          condition_id?: string
          created_at?: string
          created_by?: string | null
          exercise_id?: string
          id?: string
          level?: Database["public"]["Enums"]["contraindication_level"]
          note?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_contraindications_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "health_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_contraindications_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_contraindications_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_contraindications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_defaults: {
        Row: {
          exercise_id: string
          id: string
          organization_id: string | null
          quantity_max: number | null
          quantity_min: number | null
          quantity_unit: Database["public"]["Enums"]["quantity_unit"]
          rest_max: number | null
          rest_min: number | null
          sets: number | null
          updated_at: string
        }
        Insert: {
          exercise_id: string
          id?: string
          organization_id?: string | null
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          rest_max?: number | null
          rest_min?: number | null
          sets?: number | null
          updated_at?: string
        }
        Update: {
          exercise_id?: string
          id?: string
          organization_id?: string | null
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          rest_max?: number | null
          rest_min?: number | null
          sets?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_defaults_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_defaults_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_defaults_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          equipment: string | null
          id: string
          instructions: string | null
          media_bytes: number
          muscle_groups: string[]
          name: string
          organization_id: string | null
          poster_path: string | null
          source_exercise_id: string | null
          updated_at: string
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          equipment?: string | null
          id?: string
          instructions?: string | null
          media_bytes?: number
          muscle_groups?: string[]
          name: string
          organization_id?: string | null
          poster_path?: string | null
          source_exercise_id?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          equipment?: string | null
          id?: string
          instructions?: string | null
          media_bytes?: number
          muscle_groups?: string[]
          name?: string
          organization_id?: string | null
          poster_path?: string | null
          source_exercise_id?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      health_conditions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_conditions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          is_seed: boolean
          name: string
          overdue_grace_days: number
          plan: Database["public"]["Enums"]["plan_tier"]
          slug: string
          student_limit: number
          updated_at: string
          video_quota_bytes: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_seed?: boolean
          name: string
          overdue_grace_days?: number
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug: string
          student_limit?: number
          updated_at?: string
          video_quota_bytes?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_seed?: boolean
          name?: string
          overdue_grace_days?: number
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string
          student_limit?: number
          updated_at?: string
          video_quota_bytes?: number | null
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
      plan_item_sets: {
        Row: {
          id: string
          intensity_type: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value: number | null
          item_id: string
          load_text: string | null
          load_unit: Database["public"]["Enums"]["load_unit"] | null
          load_value: number | null
          organization_id: string
          position: number
          quantity_max: number | null
          quantity_min: number | null
          quantity_note: string | null
          quantity_unit: Database["public"]["Enums"]["quantity_unit"]
          reps: string | null
          rest_max: number | null
          rest_min: number | null
          rest_seconds: number | null
          set_type: Database["public"]["Enums"]["set_type"]
          speed: Database["public"]["Enums"]["speed_preset"] | null
          tempo: string | null
        }
        Insert: {
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          item_id: string
          load_text?: string | null
          load_unit?: Database["public"]["Enums"]["load_unit"] | null
          load_value?: number | null
          organization_id: string
          position: number
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_note?: string | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          reps?: string | null
          rest_max?: number | null
          rest_min?: number | null
          rest_seconds?: number | null
          set_type?: Database["public"]["Enums"]["set_type"]
          speed?: Database["public"]["Enums"]["speed_preset"] | null
          tempo?: string | null
        }
        Update: {
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          item_id?: string
          load_text?: string | null
          load_unit?: Database["public"]["Enums"]["load_unit"] | null
          load_value?: number | null
          organization_id?: string
          position?: number
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_note?: string | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          reps?: string | null
          rest_max?: number | null
          rest_min?: number | null
          rest_seconds?: number | null
          set_type?: Database["public"]["Enums"]["set_type"]
          speed?: Database["public"]["Enums"]["speed_preset"] | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_sets_item_id_organization_id_fkey"
            columns: ["item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "plan_workout_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      plan_item_substitutes: {
        Row: {
          exercise_id: string
          item_id: string
          organization_id: string
          position: number
        }
        Insert: {
          exercise_id: string
          item_id: string
          organization_id: string
          position: number
        }
        Update: {
          exercise_id?: string
          item_id?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_substitutes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_item_substitutes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_item_substitutes_item_id_organization_id_fkey"
            columns: ["item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "plan_workout_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      plan_tier_limits: {
        Row: {
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
          video_quota_bytes: number
        }
        Insert: {
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          video_quota_bytes: number
        }
        Update: {
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          video_quota_bytes?: number
        }
        Relationships: []
      }
      plan_workout_items: {
        Row: {
          exercise_id: string
          group_key: string | null
          id: string
          intensity_type: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value: number | null
          load_text: string | null
          load_unit: Database["public"]["Enums"]["load_unit"] | null
          load_value: number | null
          method_id: string | null
          notes: string | null
          objective_id: string | null
          organization_id: string
          position: number
          quantity_max: number | null
          quantity_min: number | null
          quantity_note: string | null
          quantity_unit: Database["public"]["Enums"]["quantity_unit"]
          reps: string | null
          rest_max: number | null
          rest_min: number | null
          rest_seconds: number | null
          rpe_target: number | null
          sets: number | null
          speed: Database["public"]["Enums"]["speed_preset"] | null
          tempo: string | null
          tip: string | null
          workout_id: string
        }
        Insert: {
          exercise_id: string
          group_key?: string | null
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          load_text?: string | null
          load_unit?: Database["public"]["Enums"]["load_unit"] | null
          load_value?: number | null
          method_id?: string | null
          notes?: string | null
          objective_id?: string | null
          organization_id: string
          position: number
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_note?: string | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          reps?: string | null
          rest_max?: number | null
          rest_min?: number | null
          rest_seconds?: number | null
          rpe_target?: number | null
          sets?: number | null
          speed?: Database["public"]["Enums"]["speed_preset"] | null
          tempo?: string | null
          tip?: string | null
          workout_id: string
        }
        Update: {
          exercise_id?: string
          group_key?: string | null
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          load_text?: string | null
          load_unit?: Database["public"]["Enums"]["load_unit"] | null
          load_value?: number | null
          method_id?: string | null
          notes?: string | null
          objective_id?: string | null
          organization_id?: string
          position?: number
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_note?: string | null
          quantity_unit?: Database["public"]["Enums"]["quantity_unit"]
          reps?: string | null
          rest_max?: number | null
          rest_min?: number | null
          rest_seconds?: number | null
          rpe_target?: number | null
          sets?: number | null
          speed?: Database["public"]["Enums"]["speed_preset"] | null
          tempo?: string | null
          tip?: string | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_workout_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_workout_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_workout_items_method_fkey"
            columns: ["method_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_methods"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "plan_workout_items_objective_fkey"
            columns: ["objective_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_objectives"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "plan_workout_items_workout_id_organization_id_fkey"
            columns: ["workout_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "plan_workouts"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      plan_workouts: {
        Row: {
          id: string
          label: string
          name: string | null
          notes: string | null
          organization_id: string
          plan_id: string
          position: number
        }
        Insert: {
          id?: string
          label: string
          name?: string | null
          notes?: string | null
          organization_id: string
          plan_id: string
          position: number
        }
        Update: {
          id?: string
          label?: string
          name?: string | null
          notes?: string | null
          organization_id?: string
          plan_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_workouts_plan_id_organization_id_fkey"
            columns: ["plan_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id", "organization_id"]
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
      special_group_conditions: {
        Row: {
          condition_id: string
          group_id: string
          organization_id: string
        }
        Insert: {
          condition_id: string
          group_id: string
          organization_id: string
        }
        Update: {
          condition_id?: string
          group_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_group_conditions_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "health_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_group_conditions_group_id_organization_id_fkey"
            columns: ["group_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "special_groups"
            referencedColumns: ["id", "organization_id"]
          },
        ]
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
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
          health_consent_declared_at?: string | null
          health_consent_declared_by?: string | null
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
          workout_plan_ends_at?: string | null
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
          health_consent_declared_at?: string | null
          health_consent_declared_by?: string | null
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
          workout_plan_ends_at?: string | null
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
      training_methods: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          position: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          position?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_objectives: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          position: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          position?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_objectives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          ends_on: string | null
          goal: string | null
          id: string
          level: string | null
          name: string
          no_end: boolean
          notes: string | null
          organization_id: string
          planned_sessions: number | null
          source_plan_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["plan_status"]
          student_id: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          level?: string | null
          name: string
          no_end?: boolean
          notes?: string | null
          organization_id: string
          planned_sessions?: number | null
          source_plan_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          student_id?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          level?: string | null
          name?: string
          no_end?: boolean
          notes?: string | null
          organization_id?: string
          planned_sessions?: number | null
          source_plan_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          student_id?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "training_plans_student_id_organization_id_fkey"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students_with_status"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "training_plans_trainer_fkey"
            columns: ["trainer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      exercise_library: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          customized: boolean | null
          equipment: string | null
          has_video: boolean | null
          id: string | null
          instructions: string | null
          is_global: boolean | null
          muscle_groups: string[] | null
          name: string | null
          organization_id: string | null
          search_text: string | null
          source_exercise_id: string | null
          video_url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customized?: never
          equipment?: string | null
          has_video?: never
          id?: string | null
          instructions?: string | null
          is_global?: never
          muscle_groups?: string[] | null
          name?: string | null
          organization_id?: string | null
          search_text?: never
          source_exercise_id?: string | null
          video_url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customized?: never
          equipment?: string | null
          has_video?: never
          id?: string | null
          instructions?: string | null
          is_global?: never
          muscle_groups?: string[] | null
          name?: string | null
          organization_id?: string | null
          search_text?: never
          source_exercise_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
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
          health_consent_declared_at?: string | null
          health_consent_declared_by?: string | null
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
          workout_plan_ends_at?: string | null
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
          health_consent_declared_at?: string | null
          health_consent_declared_by?: string | null
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
          workout_plan_ends_at?: string | null
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
      activate_plan: {
        Args: { p_plan_id: string }
        Returns: Database["public"]["Enums"]["plan_status"]
      }
      admin_activate_due_plans: { Args: never; Returns: number }
      apply_plan_to_students: {
        Args: {
          p_activate: boolean
          p_ends_on: string
          p_no_end: boolean
          p_source: string
          p_starts_on: string
          p_students: string[]
        }
        Returns: {
          error: string
          plan_id: string
          status: Database["public"]["Enums"]["plan_status"]
          student_id: string
        }[]
      }
      apply_template_to_student: {
        Args: {
          p_ends_on?: string
          p_starts_on?: string
          p_student_id: string
          p_template_id: string
        }
        Returns: string
      }
      approve_signup: {
        Args: { p_group_ids?: string[]; p_id: string; p_trainer_id?: string }
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      archive_plan: { Args: { p_plan_id: string }; Returns: undefined }
      can_view_student_health: {
        Args: { p_student_id: string }
        Returns: boolean
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      customize_exercise: { Args: { p_id: string }; Returns: string }
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_plan: { Args: { p_plan_id: string }; Returns: string }
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_health_consent_request: {
        Args: never
        Returns: {
          declared_at: string
          group_names: string[]
          organization_name: string
          student_id: string
          trainer_name: string
        }[]
      }
      get_plan_header: {
        Args: { p_plan_id: string }
        Returns: {
          student_id: string
          student_name: string
          trainer_id: string
          trainer_name: string
        }[]
      }
      get_public_signup_form: {
        Args: { p_token: string }
        Returns: {
          form_config: Json
          organization_name: string
        }[]
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
      log_students_export: {
        Args: { p_count: number; p_filters: Json; p_format: string }
        Returns: undefined
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
      organization_video_usage: {
        Args: never
        Returns: {
          quota_bytes: number
          used_bytes: number
        }[]
      }
      plan_contraindication_alerts: {
        Args: { p_plan_id: string }
        Returns: {
          condition_name: string
          exercise_id: string
          group_name: string
          hidden: boolean
          item_id: string
          level: Database["public"]["Enums"]["contraindication_level"]
          note: string
          restricted: boolean
          substitute: boolean
        }[]
      }
      preview_plan_alerts_for_students: {
        Args: { p_source: string; p_students: string[] }
        Returns: {
          avoid: number
          caution: number
          error: string
          hidden: boolean
          student_id: string
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_student_access_email: {
        Args: { p_student_id: string }
        Returns: {
          email: string
          first_name: string
          organization_id: string
          student_id: string
          user_id: string
        }[]
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
      request_anamnesis: {
        Args: { p_student_id: string; p_template_id: string }
        Returns: string
      }
      respond_my_health_consent: {
        Args: { p_accept: boolean }
        Returns: undefined
      }
      save_exercise: {
        Args: { p_data: Json; p_id: string; p_rules: Json }
        Returns: string
      }
      save_plan_as_template: {
        Args: { p_name: string; p_plan_id: string }
        Returns: string
      }
      save_training_plan: { Args: { p_plan: Json }; Returns: string }
      soft_delete_student: {
        Args: { p_confirm_name: string; p_student_id: string }
        Returns: undefined
      }
      student_contraindication_rules: {
        Args: { p_student_id: string }
        Returns: {
          condition_name: string
          exercise_id: string
          group_name: string
          hidden: boolean
          level: Database["public"]["Enums"]["contraindication_level"]
          note: string
          restricted: boolean
        }[]
      }
      student_effective_status: {
        Args: { s: Database["public"]["Tables"]["students"]["Row"] }
        Returns: Database["public"]["Enums"]["effective_status"]
      }
      student_plan_counts: {
        Args: never
        Returns: {
          expired: number
          expiring: number
          no_plan: number
        }[]
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
          health_consent_declared_at: string | null
          health_consent_declared_by: string | null
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
          workout_plan_ends_at: string | null
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
      contraindication_level: "avoid" | "caution"
      effective_status: "active" | "blocked" | "inactive" | "expired"
      intensity_type: "pct_1rm" | "rpe" | "rir"
      load_unit: "kg" | "lb"
      payment_method: "pix" | "card" | "cash" | "transfer" | "other"
      payment_status: "pending" | "paid" | "canceled"
      plan_status: "draft" | "active" | "scheduled" | "archived"
      plan_tier: "free" | "pro" | "gold"
      quantity_unit:
        | "reps"
        | "failure"
        | "seconds"
        | "minutes"
        | "meters"
        | "km"
        | "arrivals"
      set_type: "warmup" | "work" | "drop"
      sex: "M" | "F"
      signup_status: "pending" | "approved" | "rejected"
      speed_preset: "slow" | "moderate" | "fast" | "explosive"
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
      contraindication_level: ["avoid", "caution"],
      effective_status: ["active", "blocked", "inactive", "expired"],
      intensity_type: ["pct_1rm", "rpe", "rir"],
      load_unit: ["kg", "lb"],
      payment_method: ["pix", "card", "cash", "transfer", "other"],
      payment_status: ["pending", "paid", "canceled"],
      plan_status: ["draft", "active", "scheduled", "archived"],
      plan_tier: ["free", "pro", "gold"],
      quantity_unit: [
        "reps",
        "failure",
        "seconds",
        "minutes",
        "meters",
        "km",
        "arrivals",
      ],
      set_type: ["warmup", "work", "drop"],
      sex: ["M", "F"],
      signup_status: ["pending", "approved", "rejected"],
      speed_preset: ["slow", "moderate", "fast", "explosive"],
      student_source: ["manual", "public_link"],
      student_status: ["active", "inactive"],
      user_role: ["owner", "trainer", "student"],
    },
  },
} as const
