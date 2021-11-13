// import { configureGradingApp } from "examma-ray/dist/grading_interface/code-grader";
// import { EndOfMainStateCheckpoint } from "lobster-vis/dist/js/analysis/checkpoints";
// import { Exercise } from "lobster-vis/dist/js/core/Project";
// import { Simulation } from "lobster-vis/dist/js/core/Simulation";

// $(() => {
//   configureGradingApp({
//       question: Question_ADTs_Pencil_Case_Pencil_Ctor,
//       rubric: Rubric_ADTs_Pencil_Case_Pencil_Ctor,
//       groupingFunctionName: "Pencil::[[constructor]]",
//       testHarness : `
// #include <string>
// #include <iostream>

// const int MAX_PENCILS = 20;

// class Pencil {
// private:

//   bool sharp;
//   int num_times_used;

// public:

//   // MODIFIES: this Pencil
//   // EFFECTS: Initializes a Pencil. It is used 0 times and is originally sharp.
//   {{submission}}
//   //Pencil();

//   // Assume these functions have already been implemented:

//   // MODIFIES: this Pencil
//   // EFFECTS: Increments the number of times the pencil has been used by 1.
//   void increase_use();

//   // EFFECTS: Returns whether the pencil is sharp.
//   bool is_sharp();

//   // EFFECTS: Returns number of times the pencil has been used.
//   int times_used();

//   // MODIFIES: this Pencil
//   // EFFECTS: Update member variables to reflect the sharpened pencil.
//   void sharpen();
// };

// class PencilCase {
// private:
//   int num_pencils;
//   Pencil pencils[20]; //instead of MAX_PENCILS for Lobster purposes

// public:

//   // REQUIRES: num_pencils_in >= 1,
//   //           num_pencils_in < MAX_PENCILS,
//   //           there are at least num_pencil_in pencils in pencils_in.
//   // EFFECTS: Initializes a PencilCase. Sets the number of pencils in
//   //          the PencilCase. Copies each pencil from the array
//   //          pointed to by pencils_in to the PencilCase's own pencils
//   //          array.
//   PencilCase(int num_pencils_in, const Pencil * pencils_in);

//   // EFFECTS: returns a pointer to a pencil in the pencil case that
//   //          can be given to a friend :)
//   Pencil * gift_pencil();
// };

// int main() {
//   //test cases go here
//   assert(false);
// }
// `,
//     checkpoints: [
//       new EndOfMainStateCheckpoint("Do not use this", (sim: Simulation) => {
//         return !sim.hasAnyEventOccurred
//       }, "", 5000)
//     ],
//     autograder: (ex: Exercise) => {
//       return {
//         wasBlankSubmission: false,
//         itemResults: {
//           "all_correct": {status: ex.checkpointCompletions[0] ? "on" : "unknown"}
//         },
//         verified: false
//       };
//     }
//   })
// });