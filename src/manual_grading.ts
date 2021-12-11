import { ExamComponentSkin } from "examma-ray";
import { ManualGradingEpochTransition, ManualGradingOperation } from "./ExammaRayGradingServer";

export type ManualCodeGraderConfiguration = {
  question_id: string,
  test_harness: string,
  grouping_function: string
};


export type ManualGradingSubmission = {
  submission_uuid: string,
  uniqname: string,
  submission: string,
  skin_id: string
}

export type ManualGradingRubricItemStatus = "on" | "off" | "unknown";

export type ManualGradingRubricItem = {
  rubric_item_uuid: string,
  points: number,
  title: string,
  description: string,
  active: boolean
};

export type ManualGradingResult = {
  [index: string]: ManualGradingRubricItemStatus | undefined
};

export type ManualGradingGroupRecord = {
  // name: string,
  group_uuid: string,
  submissions: ManualGradingSubmission[],
  finished?: boolean,
  grader?: string,
  grading_result: ManualGradingResult
}

export type ManualGradingQuestionRecords = {
  // name?: string,
  // exam_id: string,
  grading_epoch: number,
  question_id: string,
  groups: {
    [index: string]: ManualGradingGroupRecord
  }
};

export type ManualGradingSkins = {
  [index: string]: ExamComponentSkin
};




export type ManualGradingPingRequest = {
  client_uuid: string,
  exam_id: string,
  question_id: string,
  group_uuid?: string,
  my_grading_epoch: number
  my_operations: readonly ManualGradingOperation[]
};

export type ManualGradingPingResponse = {

  exam_id: string,
  question_id: string,

  /**
   * What grading epoch are we on
   */
  grading_epoch: number,

  /**
   * Tranistions needed to come up to the current epoch
   */
  epoch_transitions: readonly ManualGradingEpochTransition[] | "reload" | "invalid"

  /**
   * Who has active browser tabs open on this question?
   */
  active_graders: ActiveGraders
};

export type ActiveGraders = {
  // Question ID
  [index: string]: {
    graders: {
      // Client ID
      [index: string]: {
        group_uuid?: string,
        email: string
      }
    }
  }
};
