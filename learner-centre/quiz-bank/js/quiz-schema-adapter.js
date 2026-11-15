/* Junior School Learning Hub — Grade-aware quiz schema adapter.
 * Preserves source records and normalizes only the fields needed by the quiz UI.
 * Grade 7 uses prompt/correct_option; Grades 8–9 use question/correct_index.
 */
(function (root) {
  "use strict";

  function toIndex(record) {
    if (Number.isInteger(record.correct_index)) return record.correct_index;
    if (record.correct_option !== undefined) {
      if (Number.isInteger(record.correct_option)) return record.correct_option;
      if (typeof record.correct_option === "string") {
        const letter = record.correct_option.trim().toUpperCase();
        const letterIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(letter);
        if (letterIndex >= 0) return letterIndex;
        const optionIndex = (record.options || []).findIndex(
          option => String(option).trim() === record.correct_option.trim()
        );
        if (optionIndex >= 0) return optionIndex;
      }
    }
    return null;
  }

  function normalize(record, grade) {
    if (!record || typeof record !== "object") {
      throw new TypeError("Quiz record must be an object.");
    }
    const options = Array.isArray(record.options) ? record.options.slice() : [];
    const correctIndex = toIndex(record);
    const question = record.prompt || record.question || record.q || "";
    if (!question) throw new Error("Quiz record has no prompt/question.");
    if (!options.length) throw new Error("Quiz record has no options.");
    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      throw new Error("Quiz record has an invalid or unsupported answer key.");
    }

    return {
      ...record,
      question,
      options,
      correct_index: correctIndex,
      explanation: record.explanation || "",
      difficulty: record.difficulty || "standard",
      grade: record.grade || Number(grade),
      source_schema: record.prompt ? "grade7" : "grade8-9"
    };
  }

  function normalizeMany(records, grade) {
    if (!Array.isArray(records)) throw new TypeError("Quiz bank must be an array.");
    return records.map(record => normalize(record, grade));
  }

  root.JSLHQuizAdapter = Object.freeze({ normalize, normalizeMany });
})(typeof window !== "undefined" ? window : globalThis);
