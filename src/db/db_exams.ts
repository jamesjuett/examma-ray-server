import { ExamSpecification, TrustedExamSubmission } from "examma-ray";
import { query } from "./db";
import { v4 as uuidv4 } from "uuid";

export async function db_getExamEpoch(exam_id: string) {
  return await query("exams").where({exam_id: exam_id}).select().first();
}

export async function db_createExam(exam_spec: ExamSpecification) {
  return await query("exams").insert({
    exam_id: exam_spec.exam_id,
    epoch: uuidv4()
  }).returning("*");
}

export async function db_getSubmissionsList(exam_id: string) {
  return await query("exam_submissions").where({exam_id: exam_id}).select();
}

export async function db_getExamSubmissionByUuid(exam_uuid: string) {
  return await query("exam_submissions").where({uuid: exam_uuid}).select().first();
}

export async function db_addExamSubmission(submission: TrustedExamSubmission) {
  return await query("exam_submissions").insert({
    uuid: submission.uuid,
    exam_id: submission.exam_id,
    uniqname: submission.student.uniqname,
    name: submission.student.name
  }).returning("*");
}