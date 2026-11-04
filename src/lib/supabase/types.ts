
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "aao_chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"decision_id": string,"embedding": string | null,"fts": unknown,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_index": number,"content": string,"decision_id": string,"embedding"?: string | null,"fts"?: never,"id"?: never
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"decision_id"?: string,"embedding"?: string | null,"fts"?: never,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "aao_chunks_decision_id_fkey"
      columns: ["decision_id"]
isOneToOne: false
      referencedRelation: "aao_decisions"
      referencedColumns: ["id"]
    }
                  ]
                },"aao_decisions": {
                  Row: {
                    "content": string,"created_at": string,"decision_date": string,"field": string | null,"id": string,"outcome": string,"source_url": string,"split": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"decision_date": string,"field"?: string | null,"id": string,"outcome": string,"source_url": string,"split"?: string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"decision_date"?: string,"field"?: string | null,"id"?: string,"outcome"?: string,"source_url"?: string,"split"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agent_events": {
                  Row: {
                    "case_id": string | null,"cost_usd": number | null,"created_at": string,"id": number,"input_tokens": number | null,"kind": string,"latency_ms": number | null,"message": string,"meta": NonNullable<Json>,"model": string | null,"output_tokens": number | null,"run_id": string | null,"step": string
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id"?: string | null,"cost_usd"?: number | null,"created_at"?: string,"id"?: never,"input_tokens"?: number | null,"kind": string,"latency_ms"?: number | null,"message": string,"meta"?: NonNullable<Json>,"model"?: string | null,"output_tokens"?: number | null,"run_id"?: string | null,"step": string
                  }
                  Update: {
                    "case_id"?: string | null,"cost_usd"?: number | null,"created_at"?: string,"id"?: never,"input_tokens"?: number | null,"kind"?: string,"latency_ms"?: number | null,"message"?: string,"meta"?: NonNullable<Json>,"model"?: string | null,"output_tokens"?: number | null,"run_id"?: string | null,"step"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_events_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_events_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"case_id": string | null,"created_at": string,"detail": NonNullable<Json>,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"case_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"case_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    }
                  ]
                },"cases": {
                  Row: {
                    "active_run_id": string | null,"attorney_id": string | null,"beneficiary_name": string,"client_id": string | null,"created_at": string,"created_by": string | null,"field": string,"id": string,"petitioner": string,"proposed_role": string,"status": Database["public"]['Enums']["case_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_run_id"?: string | null,"attorney_id"?: string | null,"beneficiary_name": string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"field": string,"id"?: string,"petitioner"?: string,"proposed_role"?: string,"status"?: Database["public"]['Enums']["case_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "active_run_id"?: string | null,"attorney_id"?: string | null,"beneficiary_name"?: string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"field"?: string,"id"?: string,"petitioner"?: string,"proposed_role"?: string,"status"?: Database["public"]['Enums']["case_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cases_active_run_fk"
      columns: ["active_run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cases_attorney_id_fkey"
      columns: ["attorney_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cases_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"claims": {
                  Row: {
                    "case_id": string,"created_at": string,"exhibit_id": string,"id": string,"page_no": number,"quote": string,"quote_verified": boolean,"run_id": string,"statement": string
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"created_at"?: string,"exhibit_id": string,"id"?: string,"page_no": number,"quote": string,"quote_verified"?: boolean,"run_id": string,"statement": string
                  }
                  Update: {
                    "case_id"?: string,"created_at"?: string,"exhibit_id"?: string,"id"?: string,"page_no"?: number,"quote"?: string,"quote_verified"?: boolean,"run_id"?: string,"statement"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "claims_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claims_exhibit_id_fkey"
      columns: ["exhibit_id"]
isOneToOne: false
      referencedRelation: "exhibits"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claims_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"criterion_assessments": {
                  Row: {
                    "case_id": string,"claim_ids": (string)[],"comparable_evidence": boolean,"criterion": Database["public"]['Enums']["criterion_key"],"id": string,"rationale": string,"run_id": string,"strength": Database["public"]['Enums']["evidence_strength"]
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"claim_ids"?: (string)[],"comparable_evidence"?: boolean,"criterion": Database["public"]['Enums']["criterion_key"],"id"?: string,"rationale": string,"run_id": string,"strength": Database["public"]['Enums']["evidence_strength"]
                  }
                  Update: {
                    "case_id"?: string,"claim_ids"?: (string)[],"comparable_evidence"?: boolean,"criterion"?: Database["public"]['Enums']["criterion_key"],"id"?: string,"rationale"?: string,"run_id"?: string,"strength"?: Database["public"]['Enums']["evidence_strength"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "criterion_assessments_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "criterion_assessments_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"draft_sections": {
                  Row: {
                    "case_id": string,"criterion": Database["public"]['Enums']["criterion_key"] | null,"heading": string,"id": string,"position": number,"run_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"heading": string,"id"?: string,"position": number,"run_id": string
                  }
                  Update: {
                    "case_id"?: string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"heading"?: string,"id"?: string,"position"?: number,"run_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "draft_sections_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_sections_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"exhibit_pages": {
                  Row: {
                    "case_id": string,"content": string,"exhibit_id": string,"page_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"content": string,"exhibit_id": string,"page_no": number
                  }
                  Update: {
                    "case_id"?: string,"content"?: string,"exhibit_id"?: string,"page_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "exhibit_pages_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exhibit_pages_exhibit_id_fkey"
      columns: ["exhibit_id"]
isOneToOne: false
      referencedRelation: "exhibits"
      referencedColumns: ["id"]
    }
                  ]
                },"exhibits": {
                  Row: {
                    "case_id": string,"created_at": string,"doc_type": string,"id": string,"label": string,"page_count": number,"sha256": string,"storage_path": string,"title": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"created_at"?: string,"doc_type"?: string,"id"?: string,"label": string,"page_count"?: number,"sha256": string,"storage_path": string,"title": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "case_id"?: string,"created_at"?: string,"doc_type"?: string,"id"?: string,"label"?: string,"page_count"?: number,"sha256"?: string,"storage_path"?: string,"title"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exhibits_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exhibits_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"follow_up_questions": {
                  Row: {
                    "answer": string | null,"answered_at": string | null,"answered_by": string | null,"case_id": string,"criterion": Database["public"]['Enums']["criterion_key"] | null,"id": string,"question": string,"rationale": string,"run_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"case_id": string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"id"?: string,"question": string,"rationale": string,"run_id": string,"status"?: string
                  }
                  Update: {
                    "answer"?: string | null,"answered_at"?: string | null,"answered_by"?: string | null,"case_id"?: string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"id"?: string,"question"?: string,"rationale"?: string,"run_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_up_questions_answered_by_fkey"
      columns: ["answered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_questions_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_questions_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"gaps": {
                  Row: {
                    "case_id": string,"criterion": Database["public"]['Enums']["criterion_key"] | null,"detail": string,"id": string,"kind": string,"run_id": string,"severity": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"detail": string,"id"?: string,"kind": string,"run_id": string,"severity": string,"title": string
                  }
                  Update: {
                    "case_id"?: string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"detail"?: string,"id"?: string,"kind"?: string,"run_id"?: string,"severity"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gaps_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gaps_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"objections": {
                  Row: {
                    "aao_refs": NonNullable<Json>,"case_id": string,"criterion": Database["public"]['Enums']["criterion_key"] | null,"id": string,"objection": string,"prong": string,"reason_code": string,"run_id": string,"severity": string,"status": string,"suggested_fix": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aao_refs"?: NonNullable<Json>,"case_id": string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"id"?: string,"objection": string,"prong": string,"reason_code": string,"run_id": string,"severity": string,"status"?: string,"suggested_fix": string
                  }
                  Update: {
                    "aao_refs"?: NonNullable<Json>,"case_id"?: string,"criterion"?: Database["public"]['Enums']["criterion_key"] | null,"id"?: string,"objection"?: string,"prong"?: string,"reason_code"?: string,"run_id"?: string,"severity"?: string,"status"?: string,"suggested_fix"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "objections_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "objections_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"paragraph_versions": {
                  Row: {
                    "actor_id": string | null,"actor_kind": string,"case_id": string,"created_at": string,"id": number,"note": string | null,"paragraph_id": string,"sentences": NonNullable<Json>,"status": Database["public"]['Enums']["paragraph_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_kind": string,"case_id": string,"created_at"?: string,"id"?: never,"note"?: string | null,"paragraph_id": string,"sentences": NonNullable<Json>,"status": Database["public"]['Enums']["paragraph_status"],"version": number
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_kind"?: string,"case_id"?: string,"created_at"?: string,"id"?: never,"note"?: string | null,"paragraph_id"?: string,"sentences"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["paragraph_status"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "paragraph_versions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paragraph_versions_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paragraph_versions_paragraph_id_fkey"
      columns: ["paragraph_id"]
isOneToOne: false
      referencedRelation: "paragraphs"
      referencedColumns: ["id"]
    }
                  ]
                },"paragraphs": {
                  Row: {
                    "case_id": string,"id": string,"position": number,"review_note": string | null,"section_id": string,"sentences": NonNullable<Json>,"status": Database["public"]['Enums']["paragraph_status"],"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"id"?: string,"position": number,"review_note"?: string | null,"section_id": string,"sentences": NonNullable<Json>,"status"?: Database["public"]['Enums']["paragraph_status"],"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "case_id"?: string,"id"?: string,"position"?: number,"review_note"?: string | null,"section_id"?: string,"sentences"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["paragraph_status"],"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "paragraphs_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paragraphs_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "draft_sections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paragraphs_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pipeline_runs": {
                  Row: {
                    "case_id": string,"config": NonNullable<Json>,"current_step": string | null,"error": string | null,"finished_at": string | null,"id": string,"started_at": string,"status": string,"workflow_run_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"config"?: NonNullable<Json>,"current_step"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string,"workflow_run_id"?: string | null
                  }
                  Update: {
                    "case_id"?: string,"config"?: NonNullable<Json>,"current_step"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string,"workflow_run_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pipeline_runs_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"id": string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"signoffs": {
                  Row: {
                    "attorney_id": string,"case_id": string,"content_sha256": string | null,"created_at": string,"id": string,"note": string | null,"run_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attorney_id"?: string,"case_id": string,"content_sha256"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"run_id": string
                  }
                  Update: {
                    "attorney_id"?: string,"case_id"?: string,"content_sha256"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"run_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "signoffs_attorney_id_fkey"
      columns: ["attorney_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signoffs_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signoffs_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"step_checkpoints": {
                  Row: {
                    "completed_at": string,"output": NonNullable<Json>,"run_id": string,"step": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"output": NonNullable<Json>,"run_id": string,"step": string
                  }
                  Update: {
                    "completed_at"?: string,"output"?: NonNullable<Json>,"run_id"?: string,"step"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "step_checkpoints_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "pipeline_runs"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_read_case":
{ Args: { "p_case": string }; Returns: boolean
                           },
"draft_digest":
{ Args: { "p_run": string }; Returns: string
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"match_aao_chunks":
{ Args: { "exclude_ids"?: (string)[],"match_count"?: number,"query_embedding": string,"query_text": string,"rrf_k"?: number }; Returns: {
              "chunk_index": number,"content": string,"decision_id": string,"score": number
            }[]
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           }
          }
          Enums: {
            "case_status": "intake"|"processing"|"needs_review"|"signed_off"|"failed","criterion_key": "awards"|"membership"|"published_material"|"judging"|"original_contributions"|"scholarly_articles"|"critical_employment"|"high_remuneration","evidence_strength": "strong"|"moderate"|"weak"|"none","paragraph_status": "pending"|"accepted"|"edited"|"rejected","user_role": "attorney"|"paralegal"|"client"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "case_status": ["intake", "processing", "needs_review", "signed_off", "failed"],"criterion_key": ["awards", "membership", "published_material", "judging", "original_contributions", "scholarly_articles", "critical_employment", "high_remuneration"],"evidence_strength": ["strong", "moderate", "weak", "none"],"paragraph_status": ["pending", "accepted", "edited", "rejected"],"user_role": ["attorney", "paralegal", "client"]
          }
        }
} as const
