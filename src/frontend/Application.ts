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

  protected onPingResponse(pingResponse: ManualGradingPingResponse) {
    // do nothing, derived classes can override
  }

}


export class IndexExammaRayGraderApplication extends ExammaGraderRayApplication {
  protected composePingRequest() {
    return undefined; // no pings
  }
}