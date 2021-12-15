// export type DashboardPingRequest = {
//   client_uuid: string,
//   exam_id: string,
// };

import { ActiveExamGraders } from "./manual_grading";


// export type DashboardPingResponse = {
//   exam_id: string,
//   exam_epoch: string,
// };



export type ExamSubmissionRecord = {
  uuid: string;
  exam_id: string;
  uniqname: string;
  name: string;
};


export type ExamPingRequest = {
  client_uuid: string,
  exam_id: string,
};

export type ExamPingResponse = {

  epoch: number,
  active_graders: ActiveExamGraders
};