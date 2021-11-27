import { ManualGradingEpochTransition } from "./ExammaRayGradingServer";

export type ManualCodeGraderConfiguration = {
  test_harness: string,
  grouping_function: string
};


export type ManualGradingSubmission = {
  submission_uuid: string,
  // skin_replacements: SkinReplacements,
  uniqname: string,
  submission: string
}

export type ManualGradingRubricItemStatus = "on" | "off" | "unknown";

export type ManualGradingRubricItem = {
  rubric_item_id: string,
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

export type ManualGradingQuestionRecord = {
  // name?: string,
  // exam_id: string,
  grading_epoch: number,
  question_id: string,
  groups: {
    [index: string]: ManualGradingGroupRecord
  }
};




export type ManualGradingPingRequest = {
  client_uuid: string,
  exam_id: string,
  question_id: string,
  group_uuid?: string,
  my_grading_epoch: number | undefined
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
  [index: string]: {
    graders: {
      [index: string]: {
        group_uuid?: string,
        email: string
      }
    }
  }
};
