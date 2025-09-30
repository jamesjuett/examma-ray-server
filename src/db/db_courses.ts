import { Exact } from "../util/util";
import { query } from "./db";

export async function db_getAllCourses() {
  return query("courses").select("*");
}

export async function db_getAllCourseUsers(course_pk: number) {
  return query("course_users").select("*").where({ course_pk });
}

export async function db_getCourseUsersByRole(course_pk: number, role: "student" | "staff" | "admin") {
  return query("course_users").select("*").where({ course_pk: course_pk, role: role });
}

export async function db_getRosterForCourseAndRole(course_pk: number, role: "student" | "staff" | "admin") {
  return query("course_users").select("*").where({ course_pk: course_pk, role: role });
}

export async function db_upsertUsersToCourseRosterWithRole<T>(
  course_pk: number, roster: Exact<T, { email: string; name: string; }>[], role: "student" | "staff" | "admin") {
  return query("course_users")
    .insert(
      roster.map(r => ({
        course_pk: course_pk,
        email: r.email,
        role: role,
      }))
    )
    .onConflict(["course_pk", "email"])
    .merge();
}

export async function db_getCourseSections(course_pk: number) {
  return query("course_sections").select("*").where({ course_pk });
}

export async function db_upsertCourseSections<T>(
  sections: Exact<T, { course_pk: number, section_id: string; section_name: string; }>[]) {
  return query("course_sections")
    .insert(sections)
    .onConflict(["course_pk", "section_id"])
    .merge();
}

export async function db_assignUsersToSections<T>(
  section_assignments: Exact<T, { email: string; section_pk: number; }>[]) {
  return query("user_sections")
    .insert(section_assignments)
    .onConflict(["email", "section_pk"])
    .ignore();
}
