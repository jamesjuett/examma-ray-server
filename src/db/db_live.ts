import { TrustedExamSubmission } from "examma-ray";
import { v4 as uuidv4 } from "uuid";
import { assert } from "../util/util";
import { query } from "./db";
import * as crypto from "crypto";
import { DB_Live_Exam_Assignment_Insert, DB_Live_Exam_Assignment_Update, DB_Live_Exam_Assignments, DB_Live_Submissions } from "knex/types/tables";
import { StudentFacingExamInfo, WindowInfo } from "../rest_types";

// TODO remove the name "live" from instances
export async function db_createLiveExamInstance(
  exam_id: string, name: string, duration_seconds: number,
  uuidv5_namespace: string = uuidv4(),
  randomization_seed: string = crypto.randomBytes(12).toString('base64') // 3 bytes -> 4 base64 chars, so 12 bytes -> 16 char seed
) {
  return (await query("live_exam_instances").insert({
    exam_instance_uuid: uuidv4(),
    name: name,
    exam_id: exam_id,
    duration_seconds: duration_seconds,
    uuidv5_namespace: uuidv5_namespace,
    randomization_seed: randomization_seed
  }).returning("*"))[0];
}

export async function db_createLiveExamAssignment(
  fields: DB_Live_Exam_Assignment_Insert
) {

  return (await query("live_exam_assignments").insert(fields).returning("*"))[0];
}

export async function db_updateLiveExamAssignment(
  exam_uuid: string,
  fields: DB_Live_Exam_Assignment_Update
) {
    console.log(fields)
  return (await query("live_exam_assignments").where({exam_uuid: exam_uuid}).update(fields).returning("*"))[0];
}

export async function db_setStartTimeToNow(exam_uuid: string) {
  return (await query("live_exam_assignments").where({exam_uuid: exam_uuid}).update({
    start_time: new Date()
  }).returning("*"))[0];
}


export async function db_getLiveExamInstancesByExamId(exam_id: string) {
  return await query("live_exam_instances").where({exam_id: exam_id}).select("*");
}

export async function db_getLiveExamInstanceByUuid(exam_instance_uuid: string) {
  return await query("live_exam_instances").where({exam_instance_uuid: exam_instance_uuid}).select("*").first();
}

export async function db_getLiveExamAssignmentsByInstance(exam_instance_uuid: string) {
  return await query("live_exam_assignments").where({exam_instance_uuid: exam_instance_uuid}).select("*");
}

export async function db_getLiveExamAssignmentsByEmail(student_email: string) {
  return await query("live_exam_assignments").where({student_email: student_email}).select("*");
}

export async function db_getStudentExamInfoByUuid(exam_uuid: string) {
  const orig_assn = await query("live_exam_assignments").where({exam_uuid: exam_uuid}).select("*").first();
  if (!orig_assn) {
    return undefined;
  }
  return db_helper_getStudentExamInfo(orig_assn);
}

async function db_helper_getStudentExamInfo(orig_assn: DB_Live_Exam_Assignments) {
  const exam_instance = await db_getLiveExamInstanceByUuid(orig_assn.exam_instance_uuid);
  assert(exam_instance !== undefined);

  const window = orig_assn.window_uuid && await db_getWindowByUuid(orig_assn.window_uuid);
  const submission = await db_getLiveExamSubmissionByUuid(orig_assn.exam_uuid);
  
  const result: StudentFacingExamInfo = {
    assigned_exam: {
      exam_uuid: orig_assn.exam_uuid,
      uniqname: orig_assn.uniqname,
      name: orig_assn.name,
      student_email: orig_assn.student_email,
      force_open: orig_assn.force_open,
      start_time: orig_assn.start_time,
      duration_multiplier: orig_assn.duration_multiplier,
      graded: orig_assn.graded,
    },
    exam_instance: {
      name: exam_instance.name,
      duration_seconds: exam_instance.duration_seconds,
      exam_id: exam_instance.exam_id,
    },
    window: window ? {
      name: window.name,
      open_time: window.open_time,
      close_time: window.close_time,
    } : undefined,
    submission: submission ? {
      created_at: submission.created_at,
      updated_at: submission.updated_at,
    } : undefined,
  };
  return result;
}
  

export async function db_getStudentExamsInfoByEmail(student_email: string) {
  const orig_assignments = await query("live_exam_assignments").where({student_email: student_email}).select("*");
  return await Promise.all(orig_assignments.map(
    async orig_assn => db_helper_getStudentExamInfo(orig_assn)
  ));
}



export async function db_getLiveExamAssignmentsByUniqname(uniqname: string) {
  return await query("live_exam_assignments")
    .join('live_exam_instances', 'live_exam_instances.exam_instance_uuid', '=', 'live_exam_assignments.exam_instance_uuid')
    .where({uniqname: uniqname}).select("*");
}

export async function db_getLiveExamAssignmentByExamUuid(exam_uuid: string) {
  return await query("live_exam_assignments").where({exam_uuid: exam_uuid}).select("*").first();
}

export async function db_getLiveExamSubmissions(exam_instance_uuid: string) {
  return await query("live_submissions")
    .join('live_exam_assignments', 'live_exam_assignments.exam_uuid', '=', 'live_submissions.exam_uuid')
    .where({exam_instance_uuid: exam_instance_uuid})
    .select([
      "live_submissions.exam_uuid",
      "live_submissions.updated_by_email",
      "live_submissions.created_at",
      "live_submissions.updated_at",
    ]) as Pick<DB_Live_Submissions, "exam_uuid" | "updated_by_email" | "created_at" | "updated_at">[];
}

export async function db_getLiveExamSubmissionsWithSubmissionJSON(exam_instance_uuid: string) {
  return await query("live_submissions")
    .join('live_exam_assignments', 'live_exam_assignments.exam_uuid', '=', 'live_submissions.exam_uuid')
    .where({exam_instance_uuid: exam_instance_uuid})
    .select('*');
}

export async function db_getLiveExamSubmissionByUuid(exam_uuid: string) {
  return await query("live_submissions").where({exam_uuid: exam_uuid}).select("*").first();
}

export async function db_saveLiveExamSubmission(
  exam_uuid: string, updated_by_email: string, submission: string) {

  // check if submission exists
  const existing = await query("live_submissions").where({exam_uuid: exam_uuid}).select("*").first();
  if (existing) {
    return (await query("live_submissions").where({exam_uuid: exam_uuid}).update({
      updated_by_email: updated_by_email,
      submission: submission,
      updated_at: new Date()
    }).returning("*"))[0];
  }
  else {
    return (await query("live_submissions").insert({
      exam_uuid: exam_uuid,
      updated_by_email: updated_by_email,
      submission: submission
    }).returning("*"))[0];
  }
}

export async function db_getWindowByUuid(window_uuid: string) {
  return await query("live_windows").where({window_uuid: window_uuid}).select("*").first();
}

export async function db_getExamInstanceWindows(exam_instance_uuid: string) {
  return await query("live_windows").where({exam_instance_uuid: exam_instance_uuid}).select("*");
}

export async function db_createOrUpdateExamInstanceWindowsWithUuids(windows: readonly WindowInfo[]) {
  return await query("live_windows").insert(windows).returning("*").onConflict("window_uuid").merge();
}