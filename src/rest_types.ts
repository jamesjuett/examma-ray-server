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