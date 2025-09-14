// export type DashboardPingRequest = {
//   client_uuid: string,
//   exam_id: string,
// };

import { ActiveExamGraders } from "./manual_grading";


// export type DashboardPingResponse = {
//   exam_id: string,
//   exam_epoch: string,
// };




export type ExamPingRequest = {
  client_uuid: string,
  exam_id: string,
};

export type ExamPingResponse = {

  epoch: string,
  active_graders: ActiveExamGraders
};



export type RunGradingRequest = {
  reports: boolean,
  curve: false,
} | {
  reports: boolean,
  curve: true,
  target_mean: number,
  target_stddev: number
};