
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
  question_id: string,
  groups: ManualGradingGroupRecord[]
};




export type ManualGradingPingRequest = {
  client_uuid: string,
  question_id: string,
  group_uuid?: string
};

export type ManualGradingPingResponse = {

  /**
   * What question is this for?
   */
  question_id: string,

  /**
   * What version of groupings are we on?
   */
  group_epoch: string,

  /**
   * What version of the rubric are we on?
   */
  rubric_epoch: string,

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
