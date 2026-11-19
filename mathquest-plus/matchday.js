/* MATHQUEST+ Arena presentation and player progression HUD. */
(()=>{
 const $=id=>document.getElementById(id);
 const css=document.createElement("style");
 css.textContent=".mq-player{background:linear-gradient(125deg,#101d54,#263f9c 62%,#6034a7);color:#fff;border-radius:20px;padding:18px;position:relative;overflow:hidden}.mq-player h2,.mq-player p{color:#fff}.mq-kicker{font-size:.72rem;font-weight:900;letter-spacing:.16em;color:#f9d36b}.mq-rank{display:inline-block;padding:5px 12px;border-radius:30px;background:#f7c94e;color:#182452;font-size:.76rem;font-weight:950}.mq-player-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px}.mq-stat{background:#ffffff18;border:1px solid #ffffff25;border-radius:12px;padding:10px}.mq-stat b{display:block;font-size:1.25rem}.mq-stat span{font-size:.72rem;color:#e4eaff}.mq-rankbar{height:9px;background:#ffffff30;border-radius:20px;overflow:hidden;margin-top:9px}.mq-rankbar i{display:block;height:100%;background:linear-gradient(90deg,#ffe17a,#ff9b38);width:0}.mq-matchbar{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;background:#111c4d;color:#fff;border-radius:13px;padding:10px 13px;margin:8px 0}.mq-matchbar span{font-size:.76rem;font-weight:850;letter-spacing:.06em}.mq-combo{color:#ffda69}@media(max-width:520px){.mq-player-grid{grid-template-columns:repeat(2,1fr)}}";
 document.head.append(css);
 const journey=document.querySelector(".grid .s8")?.parentElement;
 if(!journey)return;
 const card=document.createElement("section");
 card.className="panel mq-player";
 card.innerHTML='<div class="mq-kicker">MATHQUEST+ · PLAYER CARD</div><h2 style="margin:6px 0">Your Road to Legend</h2><p id="mq-player-name">Your mathematics career starts here.</p><span class="mq-rank" id="mq-rank">ROOKIE DIVISION</span><div class="mq-rankbar"><i id="mq-rank-progress"></i></div><div class="mq-player-grid"><div class="mq-stat"><b id="mq-level">1</b><span>PLAYER LEVEL</span></div><div class="mq-stat"><b id="mq-xp">0</b><span>CAREER XP</span></div><div class="mq-stat"><b id="mq-accuracy">0%</b><span>SHOT ACCURACY</span></div></div>';
 journey.insertBefore(card,journey.firstChild);
 const game=$("game");
 if(game){
  const hud=document.createElement("div");
  hud.className="mq-matchbar";
  hud.innerHTML='<span>⚽ MATCHDAY ARENA</span><span id="mq-combo" class="mq-combo">🔥 COMBO x0</span><span id="mq-scoreboard">0 — 0</span>';
  game.insertBefore(hud,game.firstChild);
 }
 function rankFor(xp){
  const ranks=[["ROOKIE",0,100],["ACADEMY",100,250],["RISING STAR",250,500],["PRO",500,1000],["ELITE",1000,2000],["LEGEND",2000,5000]];
  return ranks.find(r=>xp>=r[1]&&xp<r[2])||ranks[ranks.length-1];
 }
 function refresh(){
  try{
   const s=typeof stats!=="undefined"?stats:{xp:0,tried:0,correct:0};
   const xp=s.xp||0,r=rankFor(xp),level=Math.floor(xp/100)+1;
   $("mq-rank").textContent=r[0]+" DIVISION";
   $("mq-level").textContent=level;
   $("mq-xp").textContent=xp;
   $("mq-accuracy").textContent=(s.tried?Math.round(s.correct/s.tried*100):0)+"%";
   $("mq-rank-progress").style.width=Math.min(100,((xp-r[1])/(r[2]-r[1]))*100)+"%";
   const name=$("accountStatus")?.textContent||"";
   $("mq-player-name").textContent=name.startsWith("Welcome")?name+" · Build your player career.":"Train, earn XP and climb the divisions.";
  }catch{}
 }
 let combo=0,correctInMatch=0,attempts=0;
 if(game){
  game.addEventListener("click",e=>{
   const btn=e.target.closest("#answers button");
   if(!btn)return;
   setTimeout(()=>{
    const buttons=[...game.querySelectorAll("#answers button")];
    const hit=buttons.some(b=>b.classList.contains("correct"))&&btn.classList.contains("correct");
    attempts++;
    if(hit){combo++;correctInMatch++;}else combo=0;
    $("mq-combo").textContent="🔥 COMBO x"+combo;
    $("mq-scoreboard").textContent=correctInMatch+" — "+(attempts-correctInMatch);
    refresh();
   },40);
  });
 }
 setInterval(refresh,900);
 refresh();
})();