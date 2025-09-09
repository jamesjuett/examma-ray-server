import { TrustedExamSubmission } from "examma-ray";
import { v4 as uuidv4 } from "uuid";
import { assert } from "../util/util";
import { query } from "./db";

export async function db_createLiveExamInstance(exam_id: string, duration_seconds: number) {
  return (await query("live_exam_instances").insert({
    exam_instance_uuid: uuidv4(),
    exam_id: exam_id,
    duration_seconds: duration_seconds
  }).returning("*"))[0];
}

export async function db_createLiveExamAssignment(
  exam_uuid: string, exam_instance_uuid: string,
  uniqname: string, student_email: string) {

  return (await query("live_exam_assignments").insert({
    exam_uuid: exam_uuid,
    exam_instance_uuid: exam_instance_uuid,
    uniqname: uniqname,
    student_email: student_email,
    force_open: false
  }).returning("*"))[0];
}

export async function db_getLiveExamInstance(exam_instance_uuid: string) {
  return await query("live_exam_instances").where({exam_instance_uuid: exam_instance_uuid}).select("*").first();
}

export async function db_getLiveExamAssignmentsByInstance(exam_instance_uuid: string) {
  return await query("live_exam_assignments").where({exam_instance_uuid: exam_instance_uuid}).select("*");
}

export async function db_getLiveExamAssignmentsByEmail(email: string) {
  return await query("live_exam_assignments")
    .join('live_exam_instances', 'live_exam_instances.exam_instance_uuid', '=', 'live_exam_assignments.exam_instance_uuid')
    .where({student_email: email}).select("*");
}