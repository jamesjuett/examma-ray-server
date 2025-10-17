import avatar from "animal-avatar-generator";
import axios from "axios";
import { QuestionSpecification } from "examma-ray";
import { ActiveCollaborativeGrader, CollaborativeGraderKind, CollaborativeGradingEpochTransition, CollaborativeGradingPingRequest, CollaborativeGradingPingResponse, CollaborativeGradingServerConfig, GraderState, GradingOperation } from "../collaborative_grading/CollaborativeGradingTypes";
import { asMutable, assert } from "../util/util";
import { ExammaRayClient } from "./Application";
import "./code-grader.css";


const ACTIVE_GRADER_AVATAR_SIZE = 30;

// export type SetRubricItemStatusOperation = {
//   kind: "set_rubric_item_status",
//   group_uuid: string,
//   rubric_item_uuid: string,
//   status: ManualGradingRubricItemStatus
// };

// export type SetRubricItemNotesOperation = {
//   kind: "set_rubric_item_notes",
//   group_uuid: string,
//   rubric_item_uuid: string,
//   notes: string
// };

// export type SetGroupFinishedOperation = {
//   kind: "set_group_finished",
//   group_uuid: string,
//   finished: boolean
// };

// export type EditRubricItemOperation = {
//   kind: "edit_rubric_item",
//   rubric_item_uuid: string,
//   edits: Partial<ManualGradingRubricItem>
// };

// export type CreateRubricItemOperation = {
//   kind: "create_rubric_item",
//   rubric_item: ManualGradingRubricItem,
//   // after: string
// };

// export type EditCodeGraderConfigOperation = {
//   kind: "edit_code_grader_config",
//   edits: Partial<ManualCodeGraderConfiguration>
// };

// export type AssignGroupsOperation = {
//   kind: "assign_groups_operation",
//   assignment: {[index: string]: string | undefined} // mapping of submission uuids to group uuids. undefined means leave it in current group
// };





export interface CollaborativeGradingApp<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> {
  currentState() : GraderState<CGKind>;
  applyOperation(operation: GradingOperation<CGKind>) : void;

  onOperationApplied(op: GradingOperation<CGKind>, client_uuid: string) : void;
  onPingSuccess(ping_request: CollaborativeGradingPingRequest<CGKind>) : void;
  onPingFailure(ping_request: CollaborativeGradingPingRequest<CGKind>, err: unknown) : void;
};


export class CollaborativeGradingClient<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> {
  
  public readonly client: ExammaRayClient;

  public readonly question_id: string;

  public readonly grading_server_pk: number;
  public readonly epoch : number;

  private pendingPing: boolean = false;
  
  private local_changes: GradingOperation<CGKind>[] = [];

  public readonly active_graders_by_client_uuid : {
    [index: string]: ActiveCollaborativeGrader<CGKind>
  } = {};

  private app!: CollaborativeGradingApp<CGKind>;

  private constructor(client: ExammaRayClient, config: CollaborativeGradingServerConfig) {
    this.client = client;
    this.grading_server_pk = config.grading_server_pk;
    this.epoch = config.epoch;
    this.question_id = config.question_id;
  }

  public static async create(client: ExammaRayClient, grading_server_pk: number) {
    try {
      return new CollaborativeGradingClient(
        client,
        await requestCollaborativeGraderConfig(client, grading_server_pk),
      );
    }
    catch(e: unknown) {
      alert("Error loading collaborative grading client :(");
      throw e;
    }
  }

  public start(app: CollaborativeGradingApp<CGKind>) {
    this.app = app;
    this.sendPing();
    setInterval(() => this.sendPing(), 1000);
  }

  private async sendPing() {
    assert(this.app !== undefined, "Client not started - no app registered.");

    // only one ping at a time
    if (this.pendingPing) {
      return;
    }
    
    this.pendingPing = true;

    let ping_request: CollaborativeGradingPingRequest<CGKind> = {
      client_uuid: this.client.client_uuid,
      client_state: this.app.currentState(),
      client_grading_epoch: this.epoch,
      client_operations: this.local_changes.slice() // copy
    };

    // All local changes will be sent with the request and
    // reflected in the response to come up to the latest grading
    // epoch, so they'll be reapplied and we don't need to keep them.
    this.local_changes.length = 0; // clear the array

    try {
      const ping_response = await requestPingResponse(this.client, this.grading_server_pk, ping_request);
      
      this.updateActiveGraders(ping_response);

      if (ping_response.server_transitions === "invalid") {
        alert("Uh oh, something went wrong synchronizing your work to the server. This should never happen. Try reloading the page, I guess? :(");
      }
      else if (ping_response.server_transitions === "reload") {
        // await this.app.reloadGradingRecords();
        // TODO: attempt to save work to local storage before reloading (or implement graceful full grading records reload)
        alert("Uh oh - looks like your local records are behind. Please refresh the page.")
      }
      else {
        this.applyRemoteEpochTransitions(ping_response.server_transitions, ping_response.server_epoch);
      }

      this.app.onPingSuccess(ping_request);
    }
    catch(err: unknown) {

      // TODO: can we avoid losing local changes here?

      console.log(err);
      this.app.onPingFailure(ping_request, err);
    }
    
    this.pendingPing = false;
  }

  private applyRemoteEpochTransitions(transitions: readonly CollaborativeGradingEpochTransition<CGKind>[], to_epoch: number) {
    assert(this.app !== undefined, "Client not started - no app registered.");
    
    // Apply remote transitions. This potentially includes some of our own that have been locally applied.
    // That's fine because operations are idempotent and do not depend on previous state.
    transitions.forEach(t => t.ops.forEach(op => {
      this.app.applyOperation(op);
      this.app.onOperationApplied(op, t.client_uuid);
    }));

    // Reapply our current set of local operations. This is similar to a rebase in git.
    // i.e. we "time travel" and pretend that all our local operations happened after
    // others (and that's fine because local_changes only contains operations that have not yet been
    // sent to the server - akin to the "golden rule of rebasing"). Technically the rebased
    // local operations have already been applied in our grading record, but they may have been undone
    // by others' operations, so we need to reapply them to get back to the correct state.
    // And it's fine to apply them again because operations are idempotent and do not depend on previous state.
    this.local_changes.forEach(op => this.app.applyOperation(op));
    // we do not call onOperationApplied() here since we are reapplying past local operations

    asMutable(this).epoch = to_epoch;
  }

  private updateActiveGraders(pingResponse: CollaborativeGradingPingResponse<CGKind>) {
    assert(this.app !== undefined, "Client not started - no app registered.");
    let active_graders = pingResponse.active_graders_by_client_uuid;
    asMutable(this).active_graders_by_client_uuid = active_graders;
    let avatarsElem = $(".examma-ray-active-graders").empty();
    Object.values(active_graders)
      .sort((g1, g2) => g1.email.localeCompare(g2.email))
      .forEach(grader => {
      $(`<div class="examma-ray-active-grader-avatar" style="display: inline-block;" data-toggle="tooltip" data-placement="bottom" title="${grader.email}" data-client-uuid="${grader.client_uuid}">
        ${avatar(grader.email, { size: ACTIVE_GRADER_AVATAR_SIZE })}
      </div>`).appendTo(avatarsElem);
    });
    $(".examma-ray-active-graders div").tooltip();
  }

  public performLocalOperation(op: GradingOperation<CGKind>) {
    assert(this.app !== undefined, "Client not started - no app registered.");
    this.app.applyOperation(op);
    this.local_changes.push(op);
    this.app.onOperationApplied(op, this.client.client_uuid);
  }

};

async function requestCollaborativeGraderConfig(client: ExammaRayClient, grading_server_pk: number) {
  const rubric_response = await axios({
    url: `/api/collaborative_grading/${grading_server_pk}/config`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return rubric_response.data as CollaborativeGradingServerConfig;
}

async function requestPingResponse<CGKind extends CollaborativeGraderKind>(client: ExammaRayClient, grading_server_pk: number, ping_request: CollaborativeGradingPingRequest<CGKind>) {
  const ping_response = await axios({
    url: `/api/collaborative_grading/${grading_server_pk}/ping`,
    method: "POST", // TODO: shouldn't this be PUT? all operations should be idempotent?
    data: ping_request,
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return ping_response.data as CollaborativeGradingPingResponse<CGKind>;
}