import { TransparentQuestionSubmission } from "examma-ray";
import { query } from "./db";


export async function db_getAllSubmissionsForQuestionEver(question_id: string) {
  return await query("question_submissions").where({question_id: question_id}).select();
}

export async function db_getSubmissionsForQuestionOnExam(question_id: string, exam_id: string) {
  return await query("question_submissions").where({question_id: question_id, exam_id: exam_id}).select();
}

export async function db_getSubmissionsForQuestionOnExamInstance(question_id: string, exam_instance_uuid: string) {
  return await query("question_submissions").where({question_id: question_id, exam_instance_uuid: exam_instance_uuid}).select();
}

export async function db_getSubmissionForQuestionOnAssignedExam(question_id: string, assigned_exam_uuid: string) {
  // should only be one
  return await query("question_submissions").where({question_id: question_id, assigned_exam_uuid: assigned_exam_uuid}).select().first();
}

export async function db_insertQuestionSubmission(submission: {
  question_id: string;
  exam_id: string;
  exam_instance_uuid: string;
  assigned_exam_uuid: string;
  uniqname: string;
  submission: TransparentQuestionSubmission;
}) {
  return await query("question_submissions").insert(submission).returning("*");
}

export async function db_insertQuestionSubmissions(submissions: {
  question_id: string;
  exam_id: string;
  exam_instance_uuid: string;
  assigned_exam_uuid: string;
  uniqname: string;
  submission: TransparentQuestionSubmission;
}[]) {
  return await query("question_submissions").insert(submissions).returning("*");
}