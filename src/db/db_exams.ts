import { ExamSpecification, TrustedExamSubmission } from "examma-ray";
import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import { assert } from "../util/util";

export async function db_getExam(exam_id: string) {
  return query("exams").where({exam_id: exam_id}).select("*").first();
}

export async function db_getExams() {
  return query("exams").select("*");
}

export async function db_getExamEpoch(exam_id: string) {
  return query("exams").where({exam_id: exam_id}).select("epoch").first();
}

export async function db_nextExamEpoch(exam_id: string, new_epoch?: number) {

  if (!new_epoch) {
    new_epoch = (await query("exams").where({exam_id: exam_id}).select("epoch").first())?.epoch;
    assert(new_epoch !== undefined);
    ++new_epoch;
    console.log(new_epoch);
  }

  return await query("exams").where({exam_id: exam_id}).update({
    epoch: new_epoch
  }).returning("epoch");
}

export async function db_getOrCreateExam(exam_id: string) {
  return await query("exams").where({exam_id: exam_id}).first()
   ?? (await query("exams").insert({
    exam_id: exam_id,
    uuidv5_namespace: uuidv4(),
    epoch: 0
  }).returning("*"))[0];
}

export async function db_updateExamUuidV5Namespace(exam_id: string, namespace: string) {
  return await query("exams").where({exam_id: exam_id}).update({
    uuidv5_namespace: namespace,
  });
}

export async function db_deleteExam(exam_id: string) {
  return await query("exams").where({
    exam_id: exam_id,
  }).delete();
}


export async function db_getExamSubmissions(exam_id: string) {
  return await query("exam_submissions").where({exam_id: exam_id}).select();
}

export async function db_deleteExamSubmissions(exam_id: string) {
  return await query("exam_submissions").where({exam_id: exam_id}).delete();
}



export async function db_addExamSubmission(submission: TrustedExamSubmission) {
  return await query("exam_submissions").insert({
    uuid: submission.uuid,
    exam_id: submission.exam_id,
    uniqname: submission.student.uniqname,
    name: submission.student.name
  }).returning("*");
}

export async function db_getExamSubmissionByUuid(exam_uuid: string) {
  return await query("exam_submissions").where({uuid: exam_uuid}).select().first();
}

export async function db_deleteExamSubmissionByUuid(exam_uuid: string) {
  return await query("exam_submissions").where({uuid: exam_uuid}).delete();
}