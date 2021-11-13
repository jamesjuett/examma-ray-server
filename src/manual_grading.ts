import { ResponseKind, SkinReplacements, StudentInfo } from "examma-ray";
import { GradingResult } from "examma-ray/dist/graders/QuestionGrader";

export type GradingSubmission<QT extends ResponseKind = ResponseKind> = {
  question_uuid: string,
  skin_replacements: SkinReplacements,
  student: StudentInfo,
  response: string
}

export type GradingGroup<QT extends ResponseKind = ResponseKind, GR extends GradingResult = GradingResult> = {
  name: string,
  submissions: GradingSubmission<QT>[],
  grader?: string,
  grading_result?: GR
}

export type GradingAssignmentSpecification<QT extends ResponseKind = ResponseKind, GR extends GradingResult = GradingResult> = {
  name?: string,
  exam_id: string,
  question_id: string,
  groups: GradingGroup<QT,GR>[]
};