export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'principal' | 'finance_officer' | 'regional_director'
export type SubmissionStatus = 'pending' | 'verified' | 'flagged'

export interface Database {
  public: {
    Tables: {
      regions: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      campuses: {
        Row: {
          id: string
          name: string
          code: string
          region_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          code: string
          region_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          code?: string
          region_id?: string
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          region_id: string | null
          campus_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: UserRole
          region_id?: string | null
          campus_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: UserRole
          region_id?: string | null
          campus_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      assembly_submissions: {
        Row: {
          id: string
          campus_id: string
          principal_id: string
          photo_url: string
          submitted_at: string
          is_late: boolean
          status: SubmissionStatus
          verified_by: string | null
          verified_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campus_id: string
          principal_id: string
          photo_url: string
          submitted_at?: string
          is_late?: boolean
          status?: SubmissionStatus
          verified_by?: string | null
          verified_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campus_id?: string
          principal_id?: string
          photo_url?: string
          submitted_at?: string
          is_late?: boolean
          status?: SubmissionStatus
          verified_by?: string | null
          verified_at?: string | null
          notes?: string | null
          created_at?: string
        }
      }
    }
  }
}
