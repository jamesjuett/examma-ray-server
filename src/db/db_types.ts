import { Knex } from "knex";
import { ManualGradingRubricItemStatus } from "../manual_grading";

declare module "knex/types/tables" {

  // Define base types here for ALL tables
  interface DB_Users {
    id: number;
    email: string;
    name: string;
  }

  interface DB_Exams {
    exam_id: string;
    uuidv5_namespace: string;
    epoch: number;
  }

  interface DB_Exam_Submissions {
    uuid: string;
    exam_id: string;
    uniqname: string;
    name: string;
  }

  interface DB_Manual_Grading_Code_Grader_Config {
    question_id: string;
    test_harness: string;
    grouping_function: string;
  }

  interface DB_Manual_Grading_Questions {
    question_id: string;
    // grouping_epoch: number;
    grading_epoch: number;
  }

  interface DB_Manual_Grading_Question_Skins {
    question_id: string;
    skin_id: string;
    non_composite_skin_id?: string;
    replacements: {[index: string]: string};
  }

  interface DB_Manual_Grading_Rubrics {
    question_id: string;
    rubric_item_uuid: string;
    points: number;
    title: string;
    description: string;
    sort_index?: string;
    active: boolean;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }

  interface DB_Manual_Grading_Groups {
    group_uuid: string;
    question_id: string;
    finished: boolean;
    // grouper: string;
    grader: string;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }

  interface DB_Manual_Grading_Submissions {
    submission_uuid: string;
    question_id: string;
    skin_id: string;
    exam_id: string;
    group_uuid: string;
    uniqname: string;
    submission: string;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }

  interface DB_Manual_Grading_Records {
    group_uuid: string;
    rubric_item_uuid: string;
    status: ManualGradingRubricItemStatus;
    notes?: string;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }
  
  type ExceptID<T> = Knex.CompositeTableType<T, Omit<T, "id"> & {id?: undefined}, Partial<Omit<T, "id">> & {id?: undefined}>;

  interface Tables {
    users: ExceptID<DB_Users>;

    exams: Knex.CompositeTableType<
      // Base Type
      DB_Exams,
      // Insert Type
      //   All required
      DB_Exams,
      // Update Type
      //   Only allowed to update epoch or uuidv5_namespace
      Partial<Pick<DB_Exams, "epoch" | "uuidv5_namespace">>
    >;
    
    exam_submissions: Knex.CompositeTableType<
      // Base Type
      DB_Exam_Submissions,
      // Insert Type
      //   All required
      DB_Exam_Submissions,
      // Update Type
      //   Doesn't make sense to update (you should be using insert/delete)
      never
    >;

    manual_grading_code_grader_config: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Code_Grader_Config,
      // Insert Type
      //   All required
      DB_Manual_Grading_Code_Grader_Config,
      // Update Type
      //   All optional except question_id may not be updated
      Partial<Omit<DB_Manual_Grading_Code_Grader_Config, "question_id">> & {question_id?: undefined}
    >;

    manual_grading_questions: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Questions,
      // Insert Type
      //   All required
      DB_Manual_Grading_Questions,
      // Update Type
      //   Only allowed to update epochs
      Partial<Pick<DB_Manual_Grading_Questions, "grading_epoch">>
    >;

    manual_grading_question_skins: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Question_Skins,
      // Insert Type
      //   All required
      DB_Manual_Grading_Question_Skins,
      // Update Type
      //   Doesn't make sense to update (you should be using insert/delete)
      never
    >;

    manual_grading_rubrics: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Rubrics,
      // Insert Type
      //   All required, except active (default true) and sort_index (optional)
      Omit<DB_Manual_Grading_Rubrics, "active" | "sort_index"> & Partial<Pick<DB_Manual_Grading_Rubrics, "active" | "sort_index">>,
      // Update Type
      //   All optional except question_id and rubric_item_uuid may not be updated
      Partial<Omit<DB_Manual_Grading_Rubrics, "question_id" | "rubric_item_uuid">> & Partial<Record<"question_id" | "rubric_item_uuid", undefined>>
    >;

    manual_grading_groups: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Groups,
      // Insert Type
      //   All required, except grader is optional (nullable) and finished is optional (default false)
      Omit<DB_Manual_Grading_Groups, "grader" | "finished"> & Partial<Pick<DB_Manual_Grading_Groups, "grader" | "finished">>,
      // Update Type
      //   Only allowed to update finished
      Partial<Pick<DB_Manual_Grading_Groups, "finished">>
    >;

    manual_grading_submissions: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Submissions,
      // Insert Type
      //   All required, except group_uuid is optional (nullable)
      Omit<DB_Manual_Grading_Submissions, "group_uuid"> & Partial<Pick<DB_Manual_Grading_Submissions, "group_uuid">>,
      // Update Type
      //   Only allowed to update group_uuid
      Partial<Pick<DB_Manual_Grading_Submissions, "group_uuid">>
    >;

    manual_grading_records: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Records,
      // Insert Type
      //   All required, except status and notes are optional (may be null)
      Omit<DB_Manual_Grading_Records, "status" | "notes"> & Partial<Pick<DB_Manual_Grading_Records, "status" | "notes">>,
      // Update Type
      //   Only allowed to update status and notes
      Partial<Pick<DB_Manual_Grading_Records, "status" | "notes">>
    >;
  }
}

export function withoutProps<P extends string, T extends Record<P, any>>(obj: T, ...props: readonly P[]) : Omit<T, P> {
  let copy : Omit<T, P> & Partial<Pick<T,P>> = Object.assign({}, obj);
  props.forEach(p => delete copy[p]);
  return copy;
}

// export function includingProps<T extends object, P extends object>(obj: T, props: P)
//   : T extends Omit<infer R, keyof P> ? (R extends T & P ? R : T & P) : T & P {
//   return Object.assign(obj, props) as any;
// }