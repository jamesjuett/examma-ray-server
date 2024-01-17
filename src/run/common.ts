import { parentPort } from "worker_threads";

export function RATE_LIMITED_POST_MESSAGE(limit: number = 1000) {
  let lastMessage = Date.now();
  return (status: string) => {
    if (Date.now() > lastMessage + limit) {
      lastMessage = Date.now();
      parentPort?.postMessage(status);
    }
  }
}