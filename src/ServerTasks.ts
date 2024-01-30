
import { Worker } from "worker_threads";

export class ServerTasks<Tasks extends string> {

  public readonly taskStatus: {[Key in Tasks]?: string} = { };

  public workerTask(worker: Worker, task: Tasks, initial_status: string) {
    this.taskStatus[task] = initial_status;
    return new Promise<void>((resolve, reject) => {
      worker.on("message", (status: string) => this.taskStatus[task] = status)
      worker.on("error", () => {
        this.taskStatus[task] = "ERROR";
        reject();
      });
      worker.on("exit", (exitCode) => {
        if (exitCode === 0) {
          this.taskStatus[task] = "DONE";
          setTimeout(() => this.taskStatus[task] === "DONE" && delete this.taskStatus[task], 10000);
          resolve();
        }
        else {
          this.taskStatus[task] = "ERROR";
          reject();
        }
      });
    });
  }


};
