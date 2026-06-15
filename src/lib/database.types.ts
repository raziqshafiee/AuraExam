export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          role: "student" | "lecturer" | "admin";
          status: "active" | "banned" | "pending";
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          role?: "student" | "lecturer" | "admin";
          status?: "active" | "banned" | "pending";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      class_enrollments: {
        Row: {
          class_id: string;
          student_id: string;
          enrolled_at: string;
        };
        Insert: {
          class_id: string;
          student_id: string;
          enrolled_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["class_enrollments"]["Insert"]>;
      };
      exams: {
        Row: {
          id: string;
          title: string;
          class_id: string | null;
          start_time: string;
          end_time: string;
          duration: number;
          questions_count: number;
          status: "draft" | "upcoming" | "live" | "closed" | "graded";
          shuffle: boolean;
          require_camera: boolean;
          subject_weight: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          class_id?: string | null;
          start_time: string;
          end_time: string;
          duration: number;
          questions_count?: number;
          status?: "draft" | "upcoming" | "live" | "closed" | "graded";
          shuffle?: boolean;
          require_camera?: boolean;
          subject_weight?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exams"]["Insert"]>;
      };
      questions: {
        Row: {
          id: string;
          type: "MCQ" | "TF" | "ESSAY";
          text: string;
          class_id: string | null;
          difficulty: "easy" | "med" | "hard";
          points: number;
          tags: string[];
          meta: Json | null;
          version: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: "MCQ" | "TF" | "ESSAY";
          text: string;
          class_id?: string | null;
          difficulty?: "easy" | "med" | "hard";
          points?: number;
          tags?: string[];
          meta?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["questions"]["Insert"]>;
      };
      exam_questions: {
        Row: { exam_id: string; question_id: string; order_index: number };
        Insert: { exam_id: string; question_id: string; order_index: number };
        Update: Partial<Database["public"]["Tables"]["exam_questions"]["Insert"]>;
      };
      submissions: {
        Row: {
          id: string;
          exam_id: string | null;
          student_id: string | null;
          status: "in-progress" | "submitted" | "graded" | "flagged" | "retake-approved";
          score: number | null;
          auto_score: number | null;
          total: number;
          flags: number;
          appeal_required: boolean;
          started_at: string | null;
          last_seen_at: string | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id?: string | null;
          student_id?: string | null;
          status?: "in-progress" | "submitted" | "graded" | "flagged" | "retake-approved";
          score?: number | null;
          auto_score?: number | null;
          total: number;
          flags?: number;
          appeal_required?: boolean;
          started_at?: string | null;
          last_seen_at?: string | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["submissions"]["Insert"]>;
      };
      flag_reasons: {
        Row: { id: string; submission_id: string; time: string; type: string; label: string; created_at: string };
        Insert: { id?: string; submission_id: string; time: string; type: string; label: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["flag_reasons"]["Insert"]>;
      };
      essay_answers: {
        Row: {
          id: string;
          submission_id: string;
          question_id: string;
          answer: string | null;
          score: number | null;
          graded_by: string | null;
          graded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          question_id: string;
          answer?: string | null;
          score?: number | null;
          graded_by?: string | null;
          graded_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["essay_answers"]["Insert"]>;
      };
      announcements: {
        Row: { id: string; class_id: string | null; author_id: string | null; title: string; body: string; created_at: string };
        Insert: { id?: string; class_id?: string | null; author_id?: string | null; title: string; body: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["announcements"]["Insert"]>;
      };
      class_notes: {
        Row: {
          id: string;
          class_id: string | null;
          author_id: string | null;
          title: string;
          description: string;
          file_type: "pdf" | "image" | "file";
          file_name: string;
          file_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id?: string | null;
          author_id?: string | null;
          title: string;
          description?: string;
          file_type: "pdf" | "image" | "file";
          file_name: string;
          file_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["class_notes"]["Insert"]>;
      };
      class_assignments: {
        Row: {
          id: string;
          class_id: string;
          lecturer_id: string;
          title: string;
          description: string | null;
          file_url: string | null;
          file_name: string | null;
          file_type: "pdf" | "image" | "file" | null;
          max_score: number;
          start_at: string;
          end_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          lecturer_id: string;
          title: string;
          description?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: "pdf" | "image" | "file" | null;
          max_score: number;
          start_at: string;
          end_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["class_assignments"]["Insert"]>;
      };
      assignment_submissions: {
        Row: {
          id: string;
          assignment_id: string;
          class_id: string;
          student_id: string;
          file_url: string;
          file_name: string;
          file_type: "pdf" | "image" | "file";
          status: "submitted" | "reviewed";
          grade: number | null;
          feedback: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          class_id: string;
          student_id?: string;
          file_url: string;
          file_name: string;
          file_type: "pdf" | "image" | "file";
          status?: "submitted" | "reviewed";
          grade?: number | null;
          feedback?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignment_submissions"]["Insert"]>;
      };
      appeals: {
        Row: {
          id: string;
          submission_id: string;
          exam_id: string;
          student_id: string;
          type: "score" | "integrity";
          reason: string;
          status: "pending" | "approved" | "rejected";
          lecturer_reply: string | null;
          submitted_at: string;
          decided_at: string | null;
          deadline_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          exam_id: string;
          student_id: string;
          type: "score" | "integrity";
          reason: string;
          status?: "pending" | "approved" | "rejected";
          lecturer_reply?: string | null;
          submitted_at?: string;
          decided_at?: string | null;
          deadline_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["appeals"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };
      audit_log: {
        Row: { id: string; actor_id: string | null; action: string; target: string; category: string; created_at: string };
        Insert: { id?: string; actor_id?: string | null; action: string; target: string; category?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
      };
      class_grade_config: {
        Row: { id: string; class_id: string; items: Json; updated_at: string | null };
        Insert: { id?: string; class_id: string; items?: Json; updated_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["class_grade_config"]["Insert"]>;
      };
      classes: {
        Row: {
          id: string;
          code: string;
          name: string;
          lecturer_id: string | null;
          color: string;
          exam_weight: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          lecturer_id?: string | null;
          color?: string;
          exam_weight?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// Convenience row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type DbClass = Database["public"]["Tables"]["classes"]["Row"];
export type DbExam = Database["public"]["Tables"]["exams"]["Row"];
export type DbQuestion = Database["public"]["Tables"]["questions"]["Row"];
export type DbSubmission = Database["public"]["Tables"]["submissions"]["Row"];
export type DbFlagReason = Database["public"]["Tables"]["flag_reasons"]["Row"];
export type DbEssayAnswer = Database["public"]["Tables"]["essay_answers"]["Row"];
export type DbAnnouncement = Database["public"]["Tables"]["announcements"]["Row"];
export type DbClassNote = Database["public"]["Tables"]["class_notes"]["Row"];
export type DbClassAssignment = Database["public"]["Tables"]["class_assignments"]["Row"];
export type DbAssignmentSubmission = Database["public"]["Tables"]["assignment_submissions"]["Row"];
export type DbAppeal = Database["public"]["Tables"]["appeals"]["Row"];
export type DbNotification = Database["public"]["Tables"]["notifications"]["Row"];
export type DbAuditEvent = Database["public"]["Tables"]["audit_log"]["Row"];
export type DbClassGradeConfig = Database["public"]["Tables"]["class_grade_config"]["Row"];
