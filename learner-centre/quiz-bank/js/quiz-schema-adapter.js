/* Junior School Learning Hub — Grade-aware quiz schema adapter. */
(function(root){
 "use strict";
 function answerIndex(record,options){
  if(Number.isInteger(record.correct_index))return record.correct_index;
  if(record.correct_option!==undefined&&record.correct_option!==null){
   if(Number.isInteger(record.correct_option))return record.correct_option;
   if(typeof record.correct_option==="string"){
    const value=record.correct_option.trim();
    const letterIndex="ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(value.toUpperCase());
    if(/^[A-Z]$/i.test(value)&&letterIndex>=0)return letterIndex;
    const optionIndex=options.findIndex(option=>String(option).trim()===value);
    if(optionIndex>=0)return optionIndex;
   }
  }
  if(Number.isInteger(record.answer))return record.answer;
  if(typeof record.answer==="string"&&/^\d+$/.test(record.answer.trim()))return Number(record.answer.trim());
  return null;
 }
 function normalize(record,grade){
  if(!record||typeof record!=="object"||Array.isArray(record))throw new TypeError("Quiz record must be an object.");
  const rawOptions=Array.isArray(record.options)?record.options:[];
  const options=rawOptions.map(option=>{
   if(option&&typeof option==="object")return String(option.text??option.label??"");
   return String(option);
  });
  const question=record.prompt||record.question||record.q||"";
  const correctIndex=answerIndex(record,options);
  if(typeof question!=="string"||!question.trim())throw new Error("Quiz record has no prompt/question.");
  if(options.length<2||options.some(option=>!option.trim()))throw new Error("Quiz record has missing options.");
  if(correctIndex===null||correctIndex<0||correctIndex>=options.length)throw new Error("Quiz record has an invalid answer key.");
  return {...record,question:question.trim(),options,correct_index:correctIndex,explanation:record.explanation||"",difficulty:record.difficulty||"standard",grade:record.grade||Number(grade)};
 }
 function normalizeMany(records,grade){
  if(!Array.isArray(records))throw new TypeError("Quiz bank must be an array.");
  return records.map(record=>normalize(record,grade));
 }
 root.JSLHQuizAdapter=Object.freeze({normalize,normalizeMany});
})(typeof window!=="undefined"?window:globalThis);
