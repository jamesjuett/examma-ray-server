import { ResponseKind, SkinReplacements, StudentInfo } from "examma-ray";
import { GradingResult } from "examma-ray/dist/graders/QuestionGrader";

export type ManualGradingSubmission = {
  submission_uuid: string,
  // skin_replacements: SkinReplacements,
  uniqname: string,
  submission: string
}

export type ManualGradingRubricItemStatus = "on" | "off" | "unknown";

export type ManualGradingResult = {
  [index: string]: ManualGradingRubricItemStatus | undefined
};

export type ManualGradingGroupRecord = {
  // name: string,
  submissions: ManualGradingSubmission[],
  grader?: string,
  grading_result: ManualGradingResult
}

export type ManualGradingQuestionRecord = {
  // name?: string,
  // exam_id: string,
  question_id: string,
  groups: ManualGradingGroupRecord[]
};