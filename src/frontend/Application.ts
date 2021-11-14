import Cookies from "js-cookie";
import { Mutable } from "../util/util";
import axios from 'axios';
import { ExamSpecification, Section } from "examma-ray";

export type UserInfo = {
  id: number;
  email: string;
  name: string;
};

export class ExammaRayApplication {

  public readonly currentUser?: UserInfo;

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

    let user = await this.checkLogin();


  }

}

