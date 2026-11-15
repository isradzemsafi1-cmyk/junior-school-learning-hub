/* Junior School Learning Hub — Grade-aware quiz schema adapter.
 * Source records are not mutated. Supports the three schemas currently used:
 * Grade 7: prompt/options/correct_option
 * Grades 8–9: question/options/correct_index
 * Legacy in-page bank: question/options/answer (numeric option index)
 */
(function (root) {
  "use strict";

  function answerIndex(record) {
    if (Number.isInteger(record.correct_index)) return record.correct_index;

    if (record.correct_option !== undefined && record.correct_option !== null) {
      if (Number.isInteger(record.correct_option)) return record.correct_option;
      if (typeof record.correct_option === "string") {
        const value = record.correct_option.trim();
        const letterIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(value.toUpperCase());
        if (/^[A-Z]$/i.test(value) && letterIndex >= 0) return letterIndex;
        const optionIndex = (record.options || []).findIndex(
          option => String(option).trim() === value
        );
        if (optionIndex >= 0) return optionIndex;
      }
    }

    // Legacy JSLH gradeSpecificQuizBank stores the option index in "answer".
    if (Number.isInteger(record.answer)) return record.answer;
    if (typeof record.answer === "string" && /^\\d+$/.test(record.answer.trim())) {
      return Number(record.answer.trim());
    }
    return null;
  }

  function normalize(record, grade) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("Quiz record must be an object.");
    }

    const options = Array.isArray(record.options) ? record.options.slice() : [];
    const question = record.prompt || record.question || record.q || "";
    const correctIndex = answerIndex(record);

    if (typeof question !== "string" || !question.trim()) {
      throw new Error("Quiz record has no prompt/question.");
    }
    if (options.length < 2) throw new Error("Quiz record must have at least two options.");
    if (options.some(option => option === undefined || option === null || String(option).trim() === "")) {
      throw new Error("Quiz record contains an empty option.");
    }
    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      throw new Error("Quiz record has an invalid or unsupported answer key.");
    }

    const sourceSchema = record.prompt ? "grade7" :
      Number(grade) === 8 || Number(grade) === 9 ? "grade8-9" : "legacy";

    return {
      ...record,
      question: question.trim(),
      options,
      correct_index: correctIndex,
      explanation: record.explanation || "",
      difficulty: record.difficulty || "standard",
      grade: record.grade || Number(grade),
      source_schema: sourceSchema
    };
  }

  function normalizeMany(records, grade) {
    if (!Array.isArray(records)) throw new TypeError("Quiz bank must be an array.");
    return records.map(record => normalize(record, grade));
  }

  root.JSLHQuizAdapter = Object.freeze({ normalize, normalizeMany });
})(typeof window !== "undefined" ? window : globalThis);
