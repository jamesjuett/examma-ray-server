import { Knex } from "knex";
import { ManualGradingRubricItemStatus } from "../manual_grading";

declare module "knex/types/tables" {

  // Define base types here for ALL tables
  interface DB_Users {
    id: number;
    email: string;
    name: string;
  }

  interface DB_Manual_Grading_Code_Grader_Config {
    question_id: string;
    test_harness: string;
    grouping_function: string;
  }

  interface DB_Manual_Grading_Rubrics {
    question_id: string;
    rubric_item_id: string;
    points: number;
    title: string;
    description: string;
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
    exam_id: string;
    group_uuid: string;
    uniqname: string;
    submission: string;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }

  interface DB_Manual_Grading_Records {
    group_uuid: string;
    rubric_item_id: string;
    status?: ManualGradingRubricItemStatus;
    // created_at: string; // timestamp
    // updated_at: string; // timestamp
  }
  
  type ExceptID<T> = Knex.CompositeTableType<T, Omit<T, "id"> & {id?: undefined}, Partial<Omit<T, "id">> & {id?: undefined}>;

  interface Tables {
    users: ExceptID<DB_Users>;

    manual_grading_code_grader_config: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Code_Grader_Config,
      // Insert Type
      //   All required, except active is optional (default true)
      DB_Manual_Grading_Code_Grader_Config,
      // Update Type
      //   All optional except question_id may not be updated
      Partial<Omit<DB_Manual_Grading_Code_Grader_Config, "question_id">> & {question_id?: undefined}
    >;

    manual_grading_rubrics: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Rubrics,
      // Insert Type
      //   All required, except active is optional (default true)
      Omit<DB_Manual_Grading_Rubrics, "active"> & Partial<Pick<DB_Manual_Grading_Rubrics, "active">>,
      // Update Type
      //   All optional except question_id may not be updated
      Partial<Omit<DB_Manual_Grading_Rubrics, "question_id">> & {question_id?: undefined}
    >;

    manual_grading_groups: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Groups,
      // Insert Type
      //   All required, except grader is optional (nullable) and finished is optional (default false)
      Omit<DB_Manual_Grading_Groups, "grader" | "finished"> & Partial<Pick<DB_Manual_Grading_Groups, "grader" | "finished">>,
      // Update Type
      //   Only allowed to update finished
      Partial<Pick<DB_Manual_Grading_Groups, "finished">> & Record<Exclude<keyof DB_Manual_Grading_Groups, "finished">, undefined>
    >;

    manual_grading_submissions: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Submissions,
      // Insert Type
      //   All required
      DB_Manual_Grading_Submissions,
      // Update Type
      //   Only allowed to update group_uuid
      Partial<Pick<DB_Manual_Grading_Submissions, "group_uuid">> & Record<Exclude<keyof DB_Manual_Grading_Submissions, "group_uuid">, undefined>
    >;

    manual_grading_records: Knex.CompositeTableType<
      // Base Type
      DB_Manual_Grading_Records,
      // Insert Type
      //   All required, except status is optional (may be null)
      Omit<DB_Manual_Grading_Records, "status"> & Partial<Pick<DB_Manual_Grading_Records, "status">>,
      // Update Type
      //   Only allowed to update status
      Partial<Pick<DB_Manual_Grading_Records, "status">> & Record<Exclude<keyof DB_Manual_Grading_Records, "status">, undefined>
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