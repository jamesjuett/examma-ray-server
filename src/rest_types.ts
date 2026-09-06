import { QuestionSubmission, TransparentQuestionSubmission } from "examma-ray";
import { CollaborativeGraderKind } from "./collaborative_grading/CollaborativeGradingTypes";

export type ExamInfo = {
  readonly exam_id: string,
  readonly exam_instances: readonly ExamInstanceInfo[],
  readonly epoch: string,
};

export type ExamInstanceInfo = {
  readonly exam_instance_uuid: string,
  readonly name: string,
  readonly exam_id: string,
  readonly duration_seconds?: number, // absent means no time limit
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
  readonly start_time?: Date | null, // timestamp
  readonly duration_multiplier: number, // float, defaults to 1.0
  readonly graded: boolean,
};

export type ExamSubmissionInfo = {
  readonly exam_uuid: string,
  readonly updated_by_email: string,
  readonly created_at: Date, // timestamp
  readonly updated_at: Date, // timestamp
};

export type QuestionSubmissionRecord = {
  readonly question_id: string;
  readonly exam_id: string;
  readonly exam_instance_uuid: string;
  readonly assigned_exam_uuid: string;
  readonly uniqname: string;
  readonly submission: TransparentQuestionSubmission;
}

export type AssignedQuestionSkin = {
  readonly question_id: string,
  readonly skin_id: string,
  readonly non_composite_skin_id?: string,
  readonly replacements: {readonly [index: string]: string};
}

export type WindowInfo = {
  readonly window_uuid: string,
  readonly exam_instance_uuid: string,
  readonly name?: string,
  readonly open_time: Date, // timestamp
  readonly close_time: Date, // timestamp
};

export type CourseInfo = {
  readonly course_pk: number,
  readonly subject_code: string,
  readonly course_number: string,
  readonly term: string,
  readonly year: number,
  readonly title: string,
  readonly created_at: Date, // timestamp
  readonly updated_at: Date, // timestamp
};


// student-facing types below
export type StudentFacingExamInfo = {
  readonly assigned_exam: Pick<ExamAssignmentInfo, "exam_uuid" | "uniqname" | "name" | "student_email" | "force_open" | "start_time" | "duration_multiplier" | "graded">,
  readonly exam_instance: Pick<ExamInstanceInfo, "exam_id" | "name" | "duration_seconds">,
  readonly window?: Pick<WindowInfo, "name" | "open_time" | "close_time">,
  readonly submission?: Pick<ExamSubmissionInfo, "created_at" | "updated_at">,
};

export type StudentExamsResponse = {
  readonly exams: readonly StudentFacingExamInfo[],
  readonly now: number, // Unix timestamp in milliseconds
};

export type StudentFacingExamSessionInfo = {
  readonly exam_uuid: string,
  readonly exam_window?: Pick<WindowInfo, "name" | "open_time" | "close_time">,
  readonly start_time?: Date | null, // timestamp
  readonly now: number; // Unix timestamp in milliseconds
  readonly duration_seconds?: number, // absent means no time limit
  readonly force_open?: boolean,
  readonly duration_multiplier: number,
};


