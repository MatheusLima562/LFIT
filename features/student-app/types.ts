import type { QuantityUnit, SpeedPreset } from "@/features/plans/prescription";
import type { LoadUnit, SetType } from "@/features/plans/schemas";

/** Formato de `private.workout_json` (plano ativo e cópia da divisão na sessão). Nunca tem contraindicação. */
export interface AppExercise {
  id: string;
  name: string;
  instructions: string | null;
  equipment: string | null;
  video_url: string | null;
  video_path: string | null;
  poster_path: string | null;
  /** Preenchidos no servidor (URL assinada do vídeo próprio), depois de a RPC autorizar a leitura. */
  video_src?: string | null;
  poster_src?: string | null;
}

interface AppPrescription {
  quantity_unit: QuantityUnit;
  quantity_min: number | null;
  quantity_max: number | null;
  quantity_note: string | null;
  load_value: number | null;
  load_unit: LoadUnit | null;
  load_text: string | null;
  intensity: string | null;
  speed: SpeedPreset | null;
  tempo: string | null;
  rest_min: number | null;
  rest_max: number | null;
}

export interface AppSetDetail extends AppPrescription {
  position: number;
  set_type: SetType;
}

export interface AppItem extends AppPrescription {
  id: string;
  position: number;
  group_key: string | null;
  sets: number | null;
  method: string | null;
  tip: string | null;
  care_note: string | null;
  /** Pedir dor ao concluir (alerta para o aluno ou orientação de cuidado) — só o booleano, calculado no servidor. */
  ask_pain: boolean;
  exercise: AppExercise;
  substitutes: AppExercise[];
  sets_detail: AppSetDetail[];
}

export interface AppWorkout {
  id: string;
  label: string;
  name: string | null;
  notes: string | null;
  position: number;
  items: AppItem[];
}

export type TrainingMode = "self" | "full" | "restricted";

export interface AppActivePlan {
  mode: TrainingMode;
  plan: {
    id: string;
    name: string;
    goal: string | null;
    notes: string | null;
    starts_on: string | null;
    ends_on: string | null;
    no_end: boolean;
    planned_sessions: number | null;
    completed_sessions: number;
  };
  suggested_workout_id: string | null;
  open_session: { id: string; workout_id: string | null; started_at: string } | null;
  workouts: AppWorkout[];
}

export interface AppLoggedSet {
  set_index: number;
  exercise_id: string | null;
  quantity_value: number | null;
  load_value: number | null;
  load_unit: LoadUnit | null;
  load_text: string | null;
}

export interface AppItemLog {
  item_id: string;
  exercise_id: string | null;
  exercise_name: string;
  substitute: boolean;
  completed_at: string | null;
  pain_score: number | null;
  sets: AppLoggedSet[];
}

export interface AppTrainingSession {
  mode: TrainingMode;
  session: {
    id: string;
    status: "in_progress" | "completed" | "abandoned";
    started_at: string;
    finished_at: string | null;
    plan_id: string | null;
    workout_id: string | null;
    workout_label: string;
    workout_name: string | null;
    rpe: number | null;
    pain_checkin: "normal" | "ainda_incomoda" | null;
    feedback_note: string | null;
  };
  workout: AppWorkout;
  items: AppItemLog[];
}

export interface AppProfile {
  student_id: string;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  organization_name: string;
  trainer_name: string | null;
  effective_status: "active" | "blocked" | "inactive" | "expired";
}

export interface AppHistoryEntry {
  session_id: string;
  started_at: string;
  finished_at: string | null;
  status: "in_progress" | "completed" | "abandoned";
  plan_name: string | null;
  workout_label: string;
  workout_name: string | null;
  rpe: number | null;
  by_trainer: boolean;
  exercises_done: number;
}
