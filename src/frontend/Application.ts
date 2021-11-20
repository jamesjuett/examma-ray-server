import Cookies from "js-cookie";
import { Mutable } from "../util/util";
import axios from 'axios';
import { ExamSpecification, Section } from "examma-ray";
import { ManualGradingPingRequest, ManualGradingPingResponse } from "../manual_grading";
import { v4 as uuidv4 } from "uuid";

export type UserInfo = {
  id: number;
  email: string;
  name: string;
};

export abstract class ExammaGraderRayApplication {

  public readonly currentUser?: UserInfo;

  public readonly client_uuid: string;

  public constructor() {
    this.client_uuid = uuidv4();
  }

  private async checkLogin() {
    if (Cookies.get("bearer")) {
      const response = await fetch("api/users/me", {
        method: 'GET',
        headers: {
          'Authorization': 'bearer ' + Cookies.get('bearer')
        }
      });

      if (response.status === 200) {
        let newUser = await response.json() as UserInfo;
        if (!this.currentUser || newUser.id !== this.currentUser.id) {
          (<Mutable<this>>this).currentUser = newUser;
          this.onLogin();
        }
      }
      else {
        this.logout();
      }
    }
    else {
      this.logout();
    }
    return this.currentUser;
  }

  private onLogin() {
    $(".examma-ray-log-in-button").html(`<i class="bi bi-person-circle"></i> ${this.currentUser?.email}`);
    $(".examma-ray-log-out-button").show();
  }

  public logout() {
    Cookies.remove("bearer");
    if (this.currentUser) {
      delete (<Mutable<this>>this).currentUser;
      window.location.reload();
    }
  }

  public getBearerToken() {
    return Cookies.get('bearer');
  }

  private setupEventHandlers() {
    const self = this;
    $(".examma-ray-log-out-button").on("click", () => this.logout());
  }


  public async start() {

    this.setupEventHandlers();

    await this.checkLogin();

    this.sendPing();
    setInterval(() => this.sendPing(), 5000);

    await this.onStart();
  }

  protected async sendPing() {

    const pingRequest = this.composePingRequest();

    if (!pingRequest) {
      return;
    }

    const ping_response = await axios({
      url: `api/manual_grading/ping`,
      method: "POST",
      data: pingRequest,
      headers: {
          'Authorization': 'bearer ' + this.getBearerToken()
      }
    });
    this.onPingResponse(<ManualGradingPingResponse>ping_response.data);
    
  }

  protected abstract composePingRequest() : ManualGradingPingRequest | undefined;

  protected async onStart() {
    // do nothing, derived classes can override
  }

  protected onPingResponse(pingResponse: ManualGradingPingResponse) {
    // do nothing, derived classes can override
  }

}


export class IndexExammaRayGraderApplication extends ExammaGraderRayApplication {
  protected composePingRequest() {
    return undefined; // no pings
  }

  protected async onStart() {
    await this.reloadExams();
  }

  private async reloadExams() {
    const app = this;
    if (this.currentUser) {
      try {
  
        let response = await axios({
          url: `api/exams`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
          }
        });
  
        response.data.forEach((exam_spec: Omit<ExamSpecification, "sections">) => {
          const exam_id = exam_spec.exam_id;

          $(".examma-ray-exams-list").append(`
            <li>
              <a href="out/${exam_id}/graded/overview.html">${exam_id}: ${exam_spec.title}</a>
              <button class="btn btn-success examma-ray-run-grading-button" data-exam-id="${exam_id}">Run Grading</button>
              <button class="btn btn-success examma-ray-run-reports-button" data-exam-id="${exam_id}">Generate Grading Reports</button>
            </li>
          `);

          $(".examma-ray-run-grading-button").on("click", async function() {
            let response = await axios({
              url: `run/grade/${$(this).data("exam-id")}`,
              method: "POST",
              data: {},
              headers: {
                  'Authorization': 'bearer ' + app.getBearerToken()
              }
            });
            alert(JSON.stringify(response.data));
          });
  
          $(".examma-ray-run-reports-button").on("click", async function() {
            let response = await axios({
              url: `run/reports/${$(this).data("exam-id")}`,
              method: "POST",
              data: {},
              headers: {
                  'Authorization': 'bearer ' + app.getBearerToken()
              }
            });
            alert(JSON.stringify(response.data));
          });
  
        });
      }
      catch (e: unknown) {
        // no courses listed
      }
    }
    else {
      $(".examma-ray-exams-list").empty();
    }
  }
}