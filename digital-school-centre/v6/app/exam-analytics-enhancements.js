/* JSLH Exam Analytics V6.11 enhancement layer.
   Uses existing V6 tables only; no database schema changes. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const pct=m=>m.raw_score==null||!Number(m.maximum_score)?null:Number(m.raw_score)/Number(m.maximum_score)*100;
const fmt=x=>x==null?'—':Number(x).toFixed(1);
const group=(a,k)=>{const m=new Map();a.forEach(x=>{const v=k(x);if(!m.has(v))m.set(v,[]);m.get(v).push(x)});return [...m].map(([key,items])=>({key,items}))};
function say(id,msg,error){const e=$(id);if(e){e.textContent=msg;e.classList.toggle('error',!!error)}}
function addUI(){
 const nav=document.querySelector('.tabs');
 if(nav&&!$('tabProgress'))nav.insertAdjacentHTML('beforeend','<button id="tabProgress" onclick="tab(\'progress\',this)">Learner Progress</button>');
 const marks=$('p-marks');
 if(marks&&!$('rosterPanel')){
  const first=marks.querySelector('.panel');
  first.insertAdjacentHTML('afterend','<div class="panel" id="rosterPanel"><h3>Class roster marks entry</h3><p class="muted">Enter marks for a complete grade or stream. Existing marks are prefilled. Only OPEN assessments can be edited.</p><div class="grid"><div class="field"><label>Grade</label><select id="rosterGrade"><option value="">All grades</option></select></div><div class="field"><label>Stream</label><select id="rosterStream"><option value="">All streams</option></select></div></div><div class="actions"><button class="btn alt" type="button" onclick="renderRoster()">Load learner roster</button><button class="btn" type="button" onclick="saveRoster()">Save roster marks</button></div><div id="rosterTable"></div><div id="rosterMsg" class="status"></div></div>');
 }
 const main=$('app');
 if(main&&!$('p-progress'))main.insertAdjacentHTML('beforeend','<section id="p-progress" class="hidden"><div class="panel"><div class="row"><div><h3>Learner progress & intervention</h3><p class="muted">Compare recorded results across examinations and review qualitative CBE evidence.</p></div><div class="field" style="min-width:260px"><label>Learner</label><select id="progressLearner" onchange="renderLearnerProgress()"></select></div></div><div id="progressMetrics" class="metricgrid"></div><h3>Progress by learning area</h3><div id="progressTable"></div><h3>Support signals</h3><div id="interventionTable"></div><p class="muted">The 50% screening threshold is an illustrative school support prompt, not an official KNEC grade or an automated diagnosis. Teachers should review the learner’s full evidence.</p><h3>CBE qualitative evidence</h3><div id="evidenceTable"></div></div></section>');
 }
}
function fillEnhancementOptions(){
 if(typeof data==='undefined')return;
 const fill=(id,arr,label,empty)=>{const el=$(id);if(!el)return;const old=el.value;el.innerHTML='<option value="">'+empty+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(label(x))+'</option>').join('');if([...el.options].some(o=>o.value===old))el.value=old};
 fill('rosterGrade',data.grades||[],x=>x.name,'All grades');
 fill('rosterStream',data.streams||[],x=>x.name,'All streams');
 fill('progressLearner',data.learners||[],x=>x.full_name+' · '+x.admission_number,'Select learner');
}
window.renderRoster=function(){
 if(typeof data==='undefined'||!$('rosterTable'))return;
 const aid=$('mExam')?.value,cid=$('mComponent')?.value,a=data.assessments.find(x=>x.id===aid),c=data.components.find(x=>x.id===cid);
 if(!aid||!cid){$('rosterTable').innerHTML='<div class="empty">Select an examination and component first.</div>';return}
 const grade=$('rosterGrade').value||(a&&a.grade_id)||'',stream=$('rosterStream').value;
 const learners=data.learners.filter(l=>(!grade||l.grade_id===grade)&&(!stream||l.stream_id===stream)&&(!a.grade_id||l.grade_id===a.grade_id)&&!['withdrawn','transferred','graduated'].includes(String(l.enrolment_status||'').toLowerCase())).sort((x,y)=>String(x.full_name).localeCompare(String(y.full_name)));
 if(!learners.length){$('rosterTable').innerHTML='<div class="empty">No learners match this assessment, grade and stream.</div>';return}
 const old=data.marks.filter(m=>m.assessment_id===aid&&m.component_id===cid),by=new Map(old.map(m=>[m.learner_id,m])),locked=a.status!=='open';
 $('rosterTable').innerHTML='<div class="tablewrap"><table><tr><th>Learner</th><th>Admission</th><th>Score / '+esc(c.maximum_score??'Max')+'</th><th>Achievement evidence</th><th>Teacher comment</th></tr>'+learners.map(l=>{const m=by.get(l.id);return '<tr><td>'+esc(l.full_name)+'</td><td>'+esc(l.admission_number)+'</td><td><input data-rscore="'+l.id+'" type="number" min="0" max="'+esc(c.maximum_score??'')+'" step=".01" value="'+esc(m?.raw_score??'')+'" '+(locked?'disabled':'')+' style="width:105px;padding:7px"></td><td><input data-rcode="'+l.id+'" value="'+esc(m?.achievement_code||'')+'" '+(locked?'disabled':'')+' style="width:150px;padding:7px"></td><td><input data-rcomment="'+l.id+'" value="'+esc(m?.teacher_comment||'')+'" '+(locked?'disabled':'')+' style="min-width:170px;padding:7px"></td></tr>'}).join('')+'</table></div>'+(locked?'<p class="notice">Read-only: assessment status is '+esc(a.status)+'. Reopen only through the authorised workflow.</p>':'<p class="muted">'+learners.length+' learners · blank rows are skipped · existing results are prefilled.</p>');
 say('rosterMsg','');
};
window.saveRoster=async function(){
 const aid=$('mExam')?.value,cid=$('mComponent')?.value,a=data.assessments.find(x=>x.id===aid),c=data.components.find(x=>x.id===cid);
 if(!a||!c)return say('rosterMsg','Select an examination and component.',true);
 if(a.status!=='open')return say('rosterMsg','Only OPEN assessments accept marks.',true);
 const inputs=[...document.querySelectorAll('[data-rscore]')],rows=[],bad=[];
 for(const el of inputs){
  const id=el.dataset.rscore,raw=el.value.trim(),code=document.querySelector('[data-rcode="'+id+'"]').value.trim(),comment=document.querySelector('[data-rcomment="'+id+'"]').value.trim();
  if(raw===''&&!code&&!comment)continue;
  const score=raw===''?null:Number(raw),max=c.maximum_score==null?null:Number(c.maximum_score);
  if(c.scoring_mode==='numeric'&&(score===null||!Number.isFinite(score)||max===null||max<=0||score<0||score>max)){bad.push('Invalid numeric score for '+(data.learners.find(x=>x.id===id)?.full_name||id));continue}
  rows.push({school_id:schoolId,assessment_id:aid,component_id:cid,learner_id:id,raw_score:c.scoring_mode==='numeric'?score:null,maximum_score:c.scoring_mode==='numeric'?max:null,achievement_code:code||null,teacher_comment:comment||null,entered_by:uid});
 }
 if(bad.length)return say('rosterMsg',bad.slice(0,12).join(' · '),true);
 if(!rows.length)return say('rosterMsg','No marks or evidence entered.',true);
 const {error}=await db.from('assessment_marks').upsert(rows,{onConflict:'assessment_id,component_id,learner_id'});
 if(error)return say('rosterMsg',error.message,true);
 say('rosterMsg',rows.length+' learner records saved.');
 await window.__originalExamLoadAll();
 window.renderRoster();
};
window.renderLearnerProgress=function(){
 const lid=$('progressLearner')?.value;if(!lid)return;
 const learner=data.learners.find(x=>x.id===lid);if(!learner)return;
 const records=data.marks.filter(m=>m.learner_id===lid).map(m=>{const assessment=data.assessments.find(x=>x.id===m.assessment_id),component=data.components.find(x=>x.id===m.component_id),area=data.areas.find(x=>x.id===component?.learning_area_id);return {...m,assessment,component,area,percentage:pct(m)}}).filter(x=>x.assessment&&x.component);
 const exams=[...data.assessments].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
 const areas=group(records.filter(x=>x.percentage!==null),x=>x.area?.name||'Unassigned').map(g=>{const series=exams.map(a=>{const v=g.items.filter(x=>x.assessment_id===a.id).map(x=>x.percentage).filter(x=>x!==null);return v.length?{name:a.name,mean:avg(v)}:null}).filter(Boolean);return {name:g.key,series,latest:series.at(-1)?.mean,previous:series.at(-2)?.mean}});
 const values=records.map(x=>x.percentage).filter(x=>x!==null);
 $('progressMetrics').innerHTML=[['Learner',learner.full_name],['Assessments',new Set(records.map(x=>x.assessment_id)).size],['Numeric entries',values.length],['Recorded mean',fmt(avg(values))+(values.length?'%':'')]].map(x=>'<div class="metric"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>').join('');
 $('progressTable').innerHTML=areas.length?'<div class="tablewrap"><table><tr><th>Learning area</th><th>Latest mean</th><th>Previous mean</th><th>Change</th><th>Assessments recorded</th></tr>'+areas.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+fmt(x.latest)+'%</td><td>'+fmt(x.previous)+'%</td><td>'+(x.previous==null?'—':(x.latest-x.previous>=0?'+':'')+fmt(x.latest-x.previous)+' percentage points')+'</td><td>'+x.series.length+'</td></tr>').join('')+'</table></div>':'<div class="empty">No numeric results recorded for this learner.</div>';
 const signals=areas.filter(x=>x.latest!==null&&x.latest<50);
 $('interventionTable').innerHTML=signals.length?'<div class="tablewrap"><table><tr><th>Learning area</th><th>Latest mean</th><th>Suggested teacher follow-up</th></tr>'+signals.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+fmt(x.latest)+'%</td><td>Review work samples, identify specific learning gaps and plan targeted practice</td></tr>').join('')+'</table></div>':'<div class="empty">No learning area is currently below the illustrative 50% screening threshold, or results are unavailable.</div>';
 const evidence=records.filter(x=>x.achievement_code||x.teacher_comment||x.evidence_reference);
 $('evidenceTable').innerHTML=evidence.length?'<div class="tablewrap"><table><tr><th>Assessment</th><th>Learning area</th><th>Achievement descriptor</th><th>Teacher comment</th><th>Evidence reference</th></tr>'+evidence.map(x=>'<tr><td>'+esc(x.assessment.name)+'</td><td>'+esc(x.area?.name||'')+'</td><td>'+esc(x.achievement_code||'—')+'</td><td>'+esc(x.teacher_comment||'—')+'</td><td>'+esc(x.evidence_reference||'—')+'</td></tr>').join('')+'</table></div>':'<div class="empty">No qualitative evidence has been recorded yet.</div>';
};
function install(){
 addUI();fillEnhancementOptions();
 const originalTab=window.tab;
 window.tab=function(t,b){if($('p-progress'))$('p-progress').classList.toggle('hidden',t!=='progress');originalTab(t,b);if(t==='progress'){fillEnhancementOptions();window.renderLearnerProgress()}};
 const originalLoad=window.loadAll;
 window.__originalExamLoadAll=originalLoad;
 window.loadAll=async function(){await originalLoad();fillEnhancementOptions();window.renderRoster();window.renderLearnerProgress()};
 ['mExam','mComponent','rosterGrade','rosterStream'].forEach(id=>$(id)?.addEventListener('change',window.renderRoster));
 fillEnhancementOptions();window.renderRoster();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();