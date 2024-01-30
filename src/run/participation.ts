// import minimist from "minimist";
import { writeFileSync } from "fs";
import { unparse } from "papaparse";
import { query } from "../db/db";
import { db_getAllParticipation } from "../db/db_participation";

async function main() {

  const raw_data = await db_getAllParticipation();

  const exam_participation : {[index: string]: string[]} = {};

  raw_data.forEach(row => {
    (exam_participation[row.exam_id] ??= []).push(row.email);
  });
  const exam_ids = Object.keys(exam_participation);

  const max_height = Object.values(exam_participation).reduce((prev,ex) => Math.max(prev, ex.length), 0);

  const csv_data : string[][] = [
    exam_ids // header row
  ];

  for(let i = 0; i < max_height; ++i) {
    csv_data.push(exam_ids.map(ex_id => exam_participation[ex_id][i] ?? ""));
  }
  console.log("writing participation csv...");
  writeFileSync(
    `out/participation.csv`,
    unparse(csv_data),
    "utf8"
  );

  await query.destroy();
}

main();
