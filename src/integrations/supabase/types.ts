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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mentor_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mentor_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mentor_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_invites: {
        Row: {
          contact: string
          created_at: string
          id: string
          invited_by: string
          mentor_id: string
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          contact: string
          created_at?: string
          id?: string
          invited_by: string
          mentor_id: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          contact?: string
          created_at?: string
          id?: string
          invited_by?: string
          mentor_id?: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          display_name: string | null
          id: string
          joined_at: string
          mentor_id: string
          student_id: string
        }
        Insert: {
          display_name?: string | null
          id?: string
          joined_at?: string
          mentor_id: string
          student_id: string
        }
        Update: {
          display_name?: string | null
          id?: string
          joined_at?: string
          mentor_id?: string
          student_id?: string
        }
        Relationships: []
      }
      community_post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          media_type: string | null
          media_url: string | null
          mentor_id: string
          post_type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          media_type?: string | null
          media_url?: string | null
          mentor_id: string
          post_type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          media_type?: string | null
          media_url?: string | null
          mentor_id?: string
          post_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          completed: boolean
          id: string
          last_watched_at: string | null
          lesson_id: string
          progress_percent: number
          student_id: string
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          id?: string
          last_watched_at?: string | null
          lesson_id: string
          progress_percent?: number
          student_id: string
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          id?: string
          last_watched_at?: string | null
          lesson_id?: string
          progress_percent?: number
          student_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_question_answers: {
        Row: {
          content: string
          created_at: string
          id: string
          mentor_id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mentor_id: string
          question_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mentor_id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_question_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "lesson_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_questions: {
        Row: {
          content: string
          created_at: string
          id: string
          lesson_id: string
          mentor_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lesson_id: string
          mentor_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lesson_id?: string
          mentor_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_published: boolean
          lesson_type: string
          mentor_id: string
          position: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          lesson_type?: string
          mentor_id: string
          position?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          lesson_type?: string
          mentor_id?: string
          position?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_messages: {
        Row: {
          created_at: string
          display_name: string
          id: string
          message: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          message: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          message?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recordings: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          live_session_id: string | null
          mentor_id: string
          recording_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          live_session_id?: string | null
          mentor_id: string
          recording_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          live_session_id?: string | null
          mentor_id?: string
          recording_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_recordings_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reminders: {
        Row: {
          created_at: string
          id: string
          mentor_id: string
          scheduled_live_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentor_id: string
          scheduled_live_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentor_id?: string
          scheduled_live_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reminders_scheduled_live_id_fkey"
            columns: ["scheduled_live_id"]
            isOneToOne: false
            referencedRelation: "live_scheduled"
            referencedColumns: ["id"]
          },
        ]
      }
      live_scheduled: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mentor_id: string
          scheduled_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mentor_id: string
          scheduled_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mentor_id?: string
          scheduled_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_sessions: {
        Row: {
          ended_at: string | null
          id: string
          mentor_id: string
          recording_url: string | null
          started_at: string
          status: string
          title: string
          viewer_count: number
        }
        Insert: {
          ended_at?: string | null
          id?: string
          mentor_id: string
          recording_url?: string | null
          started_at?: string
          status?: string
          title?: string
          viewer_count?: number
        }
        Update: {
          ended_at?: string | null
          id?: string
          mentor_id?: string
          recording_url?: string | null
          started_at?: string
          status?: string
          title?: string
          viewer_count?: number
        }
        Relationships: []
      }
      live_signals: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          payload: Json
          session_id: string
          signal_type: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          payload: Json
          session_id: string
          signal_type: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          payload?: Json
          session_id?: string
          signal_type?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_signals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      private_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          created_at: string
          id: string
          lesson_id: string | null
          mentor_id: string
          question: string
          student_id: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string | null
          mentor_id: string
          question: string
          student_id: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string | null
          mentor_id?: string
          question?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notify_email: boolean
          notify_sms: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_answers: {
        Row: {
          answer_text: string | null
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          selected_option_id: string | null
          submission_id: string
        }
        Insert: {
          answer_text?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          selected_option_id?: string | null
          submission_id: string
        }
        Update: {
          answer_text?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          selected_option_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "quiz_question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "quiz_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_question_options: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          is_correct: boolean
          option_text: string
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          is_correct?: boolean
          option_text: string
          position?: number
          question_id: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          is_correct?: boolean
          option_text?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          created_at: string
          expected_answer: string | null
          hint: string | null
          id: string
          position: number
          question_text: string
          question_type: string
          quiz_id: string
        }
        Insert: {
          created_at?: string
          expected_answer?: string | null
          hint?: string | null
          id?: string
          position?: number
          question_text: string
          question_type?: string
          quiz_id: string
        }
        Update: {
          created_at?: string
          expected_answer?: string | null
          hint?: string | null
          id?: string
          position?: number
          question_text?: string
          question_type?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_submissions: {
        Row: {
          id: string
          max_score: number | null
          mentor_id: string
          quiz_id: string
          score: number | null
          student_id: string
          submitted_at: string
        }
        Insert: {
          id?: string
          max_score?: number | null
          mentor_id: string
          quiz_id: string
          score?: number | null
          student_id: string
          submitted_at?: string
        }
        Update: {
          id?: string
          max_score?: number | null
          mentor_id?: string
          quiz_id?: string
          score?: number | null
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          lesson_id: string | null
          mentor_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          lesson_id?: string | null
          mentor_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          lesson_id?: string | null
          mentor_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      student_category_access: {
        Row: {
          category_id: string
          granted_at: string
          id: string
          mentor_id: string
          student_id: string
        }
        Insert: {
          category_id: string
          granted_at?: string
          id?: string
          mentor_id: string
          student_id: string
        }
        Update: {
          category_id?: string
          granted_at?: string
          id?: string
          mentor_id?: string
          student_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_community_member: {
        Args: { _mentor_id: string; _student_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "mentor" | "student"
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
      app_role: ["mentor", "student"],
    },
  },
} as const
