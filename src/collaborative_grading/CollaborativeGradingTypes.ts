import { expectType, TypeOf } from "ts-expect";
import type { FITBDropGraderState, FITBDropGradingOperation, FITBDropGradingRecords } from "./FITBDropGradingCommon";
import { GraderKind, GraderSpecification } from "examma-ray/dist/graders/QuestionGrader";

export type CollaborativeGraderKind =
  | "manual_regex_fill_in_the_blank"
  | "simple_multiple_choice"
  | "summation_multiple_choice"
  | "standard_select_lines"
  | "standard_fitb_drop"
  | "bug_catching";

// Verify the above are precisely a subset of the GraderKind from examma-ray
expectType<TypeOf<GraderKind, CollaborativeGraderKind>>(true);

/**
 * The full records for a collaborative grading endeavor, encoding all information
 * about grading work that has been done so far. This may include grader configurations,
 * rubric specification, or individual grading groups and which rubric items are applied
 * for manual grading. These records evolve in discrete epochs as grading operations are
 * applied on the server. All fields must be JSON-serializable.
 */
export interface CollaborativeGradingRecordsBase {

}

export type GradingRecords<CGKind extends CollaborativeGraderKind> =
  CGKind extends "standard_fitb_drop" ? FITBDropGradingRecords :
  never; // TODO: add other kinds here

expectType<TypeOf<CollaborativeGradingRecordsBase, GradingRecords<CollaborativeGraderKind>>>(true);

/**
 * A grading operation that represents a unit of collaborative grading work. All
 * operations must be idempotent and must not depend on previous state. Different
 * kinds of collaborative graders define a discriminated union of types that extend
 * this interface with a `kind` field as the discriminant. All fields must be
 * JSON-serializable.
 */
export interface CollaborativeGradingOperationBase {
  readonly kind: string;
}

export type GradingOperation<K extends CollaborativeGraderKind> =
  K extends "standard_fitb_drop" ? FITBDropGradingOperation :
  never; // TODO: add other kinds here

expectType<TypeOf<CollaborativeGradingOperationBase, GradingOperation<CollaborativeGraderKind>>>(true);

/**
 * Base interface for the current state of a collaborative grader client. Different
 * kinds of collaborative graders can extend this interface with additional fields
 * that represent the current state of the client as needed (e.g. what submission/group
 * are they currently viewing, what rubric item are they editing, etc.). This information
 * will be available to other clients connected to the same question. All fields must be
 * JSON-serializable.
 */
export interface CollaborativeGraderStateBase {
  readonly client_uuid: string,
};

export type GraderState<K extends CollaborativeGraderKind> =
  K extends "standard_fitb_drop" ? FITBDropGraderState :
  never; // TODO: add other kinds here

expectType<TypeOf<CollaborativeGraderStateBase, GraderState<CollaborativeGraderKind>>>(true);




export interface CollaborativeGradingServerStrategy<CGKind extends CollaborativeGraderKind> {
  readonly grader_kind: CollaborativeGraderKind;
  applyOperation(grading_records: GradingRecords<CGKind>, op: GradingOperation<CGKind>, client_uuid: string) : void;
  recordOperation(op: GradingOperation<CGKind>, client_uuid: string) : Promise<void>;
  loadGradingRecords(grading_server_pk: number) : Promise<GradingRecords<CGKind>>;
  loadGraderSpec(grading_records: FITBDropGradingRecords): GraderSpecification<"standard_fitb_drop">;
};


// NOTE: all operations must be idempotent and must not depend on previous state
export type CollaborativeGradingEpochTransition<CGKind extends CollaborativeGraderKind> = {
  readonly client_uuid: string,
  readonly grader_email: string,
  readonly ops: readonly GradingOperation<CGKind>[]
};

export type ActiveCollaborativeGrader<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> = {
  client_uuid: string,
  email: string,
  client_state: GraderState<CGKind>,
};

export type CollaborativeGradingPingRequest<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> = {
  client_uuid: string,
  client_state: GraderState<CGKind>,
  client_grading_epoch: number,
  client_operations: readonly GradingOperation<CGKind>[],
};

export type CollaborativeGradingPingResponse<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> = {

  /**
   * What grading epoch are we on
   */
  server_epoch: number,

  /**
   * Tranistions needed to come up to the current epoch
   */
  server_transitions: readonly CollaborativeGradingEpochTransition<CGKind>[] | "reload" | "invalid"

  /**
   * Who has active browser tabs open on this question?
   */
  active_graders_by_client_uuid: {
    [index: string]: ActiveCollaborativeGrader<CGKind>
  };
};





export interface CollaborativeGradingServerConfig {
  grading_server_pk: number;
  question_id: string;
  grader_kind: CollaborativeGraderKind;
  epoch: number;
}