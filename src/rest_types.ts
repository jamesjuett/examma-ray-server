export type ExamInfo = {
  readonly exam_id: string,
  readonly exam_instances: readonly ExamInstanceInfo[],
  readonly epoch: string,
};

export type ExamInstanceInfo = {
  readonly exam_instance_uuid: string,
  readonly name: string,
  readonly exam_id: string,
  readonly duration_seconds: number,
  readonly uuidv5_namespace: string,
  readonly randomization_seed: string,
  readonly epoch: string,
};

export type ExamAssignmentInfo = {
  readonly exam_uuid: string,
  readonly exam_instance_uuid: string,
  readonly uniqname: string,
  readonly name?: string,
  readonly student_email: string,
  readonly window_uuid?: string,
  readonly force_open: boolean,
  readonly start_time?: Date, // timestamp
  readonly duration_multiplier: number, // float, defaults to 1.0
  readonly graded: boolean,
};

export type SubmissionInfo = {
  readonly exam_uuid: string,
  readonly updated_by_email: string,
  readonly created_at: Date, // timestamp
  readonly updated_at: Date, // timestamp
};

export type WindowInfo = {
  readonly window_uuid: string,
  readonly exam_instance_uuid: string,
  readonly name?: string,
  readonly open_time: Date, // timestamp
  readonly close_time: Date, // timestamp
};

// student-facing type
export type StudentFacingExamInfo = {
  readonly assigned_exam: Pick<ExamAssignmentInfo, "exam_uuid" | "uniqname" | "name" | "student_email" | "force_open" | "start_time" | "duration_multiplier" | "graded">,
  readonly exam_instance: Pick<ExamInstanceInfo, "exam_id" | "name" | "duration_seconds">,
  readonly window?: Pick<WindowInfo, "name" | "open_time" | "close_time">,
  readonly submission?: Pick<SubmissionInfo, "created_at" | "updated_at">,
};

export type StudentExamsResponse = {
  readonly exams: readonly StudentFacingExamInfo[],
  readonly now: number, // Unix timestamp in milliseconds
};

export type ExamSessionInfo = {
  readonly exam_uuid: string,
  readonly exam_window?: Pick<WindowInfo, "name" | "open_time" | "close_time">,
  readonly start_time?: Date, // timestamp
  readonly now: number; // Unix timestamp in milliseconds
  readonly duration_seconds: number,
  readonly force_open?: boolean,
  readonly duration_multiplier: number,
};